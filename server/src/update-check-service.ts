export type UpdateCheckStatus = "unconfigured" | "current" | "update-available" | "unknown" | "error";
export type UpdateCheckSource = "github" | "manifest";

export interface BuildIdentity {
  version: string;
  commit: string;
  branch: string;
}

export interface RemoteBuildIdentity {
  version: string | null;
  commit: string | null;
  branch: string;
  publishedAt: string | null;
  url: string | null;
}

export interface UpdateCheckResult {
  status: UpdateCheckStatus;
  source: UpdateCheckSource | null;
  current: BuildIdentity;
  latest: RemoteBuildIdentity | null;
  checkedAt: string | null;
  message: string;
}

export interface UpdateCheckConfig {
  manifestUrl?: string;
  githubRepo?: string;
  githubToken?: string;
  branch?: string;
  cacheMs?: number;
}

interface RemoteCache {
  source: UpdateCheckSource;
  latest: RemoteBuildIdentity;
  checkedAt: string;
  expiresAt: number;
}

const DEFAULT_CACHE_MS = 10 * 60_000;
const FETCH_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 128 * 1024;
const GITHUB_REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export class UpdateCheckService {
  private readonly config: Required<Pick<UpdateCheckConfig, "branch" | "cacheMs">> & UpdateCheckConfig;
  private cache: RemoteCache | null = null;

  constructor(config: UpdateCheckConfig = {}) {
    this.config = {
      ...config,
      branch: clean(config.branch) || "main",
      cacheMs: Number.isFinite(config.cacheMs) && (config.cacheMs ?? 0) > 0 ? Math.max(60_000, config.cacheMs as number) : DEFAULT_CACHE_MS,
    };
  }

  async check(currentInput: Partial<BuildIdentity>, force = false): Promise<UpdateCheckResult> {
    const current: BuildIdentity = {
      version: clean(currentInput.version) || "unknown",
      commit: clean(currentInput.commit) || "unknown",
      branch: clean(currentInput.branch) || "unknown",
    };
    const source = this.source();
    if (!source) {
      return {
        status: "unconfigured",
        source: null,
        current,
        latest: null,
        checkedAt: null,
        message: "未配置更新源。可通过 Core 环境变量配置私有 GitHub 仓库或 Update Manifest。",
      };
    }

    try {
      const remote = await this.remote(source, force);
      const status = compareBuild(current, remote.latest);
      return {
        status,
        source,
        current,
        latest: remote.latest,
        checkedAt: remote.checkedAt,
        message: statusMessage(status),
      };
    } catch (error) {
      return {
        status: "error",
        source,
        current,
        latest: null,
        checkedAt: new Date().toISOString(),
        message: sanitizeError(error),
      };
    }
  }

  private source(): UpdateCheckSource | null {
    if (clean(this.config.manifestUrl)) return "manifest";
    if (clean(this.config.githubRepo)) return "github";
    return null;
  }

  private async remote(source: UpdateCheckSource, force: boolean): Promise<RemoteCache> {
    const now = Date.now();
    if (!force && this.cache?.source === source && this.cache.expiresAt > now) return this.cache;

    const latest = source === "manifest" ? await this.fetchManifest() : await this.fetchGitHub();
    const checkedAt = new Date().toISOString();
    this.cache = { source, latest, checkedAt, expiresAt: now + this.config.cacheMs };
    return this.cache;
  }

  private async fetchManifest(): Promise<RemoteBuildIdentity> {
    const rawUrl = clean(this.config.manifestUrl);
    const url = requireHttpUrl(rawUrl);
    const payload = await fetchJson(url, {});
    const record = asRecord(payload);
    const version = nullableString(record.version);
    const commit = nullableString(record.commit);
    if (!version && !commit) throw new Error("Update Manifest 缺少 version 或 commit。");
    return {
      version,
      commit,
      branch: nullableString(record.branch) ?? this.config.branch,
      publishedAt: nullableString(record.publishedAt),
      url: safePublicUrl(nullableString(record.url)),
    };
  }

  private async fetchGitHub(): Promise<RemoteBuildIdentity> {
    const repo = clean(this.config.githubRepo);
    if (!GITHUB_REPO_RE.test(repo)) throw new Error("SLC_UPDATE_GITHUB_REPO 必须使用 owner/repo 格式。");
    const branch = this.config.branch;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "surge-lan-console-update-check",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    const token = clean(this.config.githubToken);
    if (token) headers.Authorization = `Bearer ${token}`;

    const commitPayload = asRecord(await fetchJson(
      `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(branch)}`,
      headers,
    ));
    const sha = nullableString(commitPayload.sha);
    if (!sha) throw new Error("GitHub 未返回目标分支 commit。");

    let version: string | null = null;
    try {
      const packagePayload = asRecord(await fetchJson(
        `https://api.github.com/repos/${repo}/contents/package.json?ref=${encodeURIComponent(sha)}`,
        headers,
      ));
      const encoded = nullableString(packagePayload.content)?.replace(/\s+/g, "");
      if (encoded) {
        const pkg = asRecord(JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as unknown);
        version = nullableString(pkg.version);
      }
    } catch {
      // Commit comparison remains authoritative even if package.json is unavailable.
    }

    const commitRecord = asRecord(commitPayload.commit);
    const committer = asRecord(commitRecord.committer);
    return {
      version,
      commit: sha,
      branch,
      publishedAt: nullableString(committer.date),
      url: `https://github.com/${repo}/commit/${sha}`,
    };
  }
}

function compareBuild(current: BuildIdentity, latest: RemoteBuildIdentity): UpdateCheckStatus {
  if (isKnown(current.commit) && latest.commit) {
    const currentCommit = current.commit.toLowerCase();
    const latestCommit = latest.commit.toLowerCase();
    if (latestCommit === currentCommit || latestCommit.startsWith(currentCommit) || currentCommit.startsWith(latestCommit)) return "current";
    return "update-available";
  }

  if (isKnown(current.version) && latest.version) {
    const comparison = compareVersions(current.version, latest.version);
    if (comparison < 0) return "update-available";
    if (comparison >= 0) return "current";
  }
  return "unknown";
}

function compareVersions(current: string, latest: string): number {
  const a = parseVersion(current);
  const b = parseVersion(latest);
  if (!a || !b) return normalizeVersion(current) === normalizeVersion(latest) ? 0 : Number.NaN;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return (a[index] ?? 0) - (b[index] ?? 0);
  }
  return 0;
}

function parseVersion(value: string): [number, number, number] | null {
  const match = normalizeVersion(value).match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, "");
}

function statusMessage(status: UpdateCheckStatus): string {
  if (status === "current") return "当前构建与更新源一致。";
  if (status === "update-available") return "检测到更新源存在不同的新构建。";
  if (status === "unknown") return "已读取更新源，但当前构建缺少可比较的版本或 commit。";
  return "更新检查失败。";
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      throw new Error(`更新源访问失败（HTTP ${response.status}）。私有 GitHub 仓库请配置只读 Token。`);
    }
    throw new Error(`更新源返回 HTTP ${response.status}。`);
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) throw new Error("更新源响应超过 128 KB 限制。");
  try { return JSON.parse(text) as unknown; }
  catch { throw new Error("更新源返回的 JSON 无法解析。"); }
}

function requireHttpUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error("SLC_UPDATE_MANIFEST_URL 不是有效 URL。"); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Update Manifest 仅支持 HTTP(S)。");
  if (url.username || url.password) throw new Error("Update Manifest URL 不允许内嵌凭据。");
  return url.toString();
}

function safePublicUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isKnown(value: string): boolean {
  return Boolean(value && value !== "unknown" && value !== "development");
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "更新检查失败。";
  return message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 300);
}
