/**
 * Build identity (OPTIMIZATION_PLAN Task 01).
 *
 * The values below are injected at build time by Vite `define` from
 * vite.config.ts (git commit / branch / build time are derived from the
 * repository unless overridden by VITE_* env vars, e.g. Docker build args).
 *
 * Exposed to the UI so the running deployment can always be compared
 * against GitHub main (deployment-version verification, §82–88).
 */

declare const __APP_VERSION__: string;
declare const __GIT_COMMIT__: string;
declare const __GIT_BRANCH__: string;
declare const __BUILD_TIME__: string;
declare const __APP_ENV__: string;

export interface BuildInfo {
  version: string;
  commit: string;
  branch: string;
  buildTime: string;
  environment: string;
}

export interface RuntimeBuildInfo extends BuildInfo {}

interface VersionJsonPayload {
  version?: unknown;
  commit?: unknown;
  branch?: unknown;
  build?: unknown;
  environment?: unknown;
}

export const BUILD_INFO: BuildInfo = {
  version: __APP_VERSION__ ?? "dev",
  commit: __GIT_COMMIT__ ?? "unknown",
  branch: __GIT_BRANCH__ ?? "unknown",
  buildTime: __BUILD_TIME__ ?? "",
  environment: __APP_ENV__ ?? "development",
};

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function isKnownCommit(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return Boolean(normalized) && !["unknown", "dev", "local"].includes(normalized);
}

function sameCommit(left: string, right: string): boolean {
  const a = left.trim().toLowerCase();
  const b = right.trim().toLowerCase();
  if (a === b) return true;
  if (a.length < 7 || b.length < 7) return false;
  return a.startsWith(b) || b.startsWith(a);
}

function validBuildTime(value: string): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

/** Parse the no-cache /version.json payload emitted by Vite at build time. */
export function parseRuntimeBuildInfo(payload: unknown): RuntimeBuildInfo | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = payload as VersionJsonPayload;
  return {
    version: asString(value.version, "unknown"),
    commit: asString(value.commit, "unknown"),
    branch: asString(value.branch, "unknown"),
    buildTime: asString(value.build, ""),
    environment: asString(value.environment, "unknown"),
  };
}

/**
 * Detect whether the static bundle in the current tab differs from the files
 * currently served by the deployment. Prefer git identity, then build time,
 * then semantic version so short/full SHAs and Docker metadata remain robust.
 */
export function hasRuntimeBuildChanged(current: BuildInfo, runtime: RuntimeBuildInfo): boolean {
  if (isKnownCommit(current.commit) && isKnownCommit(runtime.commit)) {
    return !sameCommit(current.commit, runtime.commit);
  }

  const currentBuild = validBuildTime(current.buildTime);
  const runtimeBuild = validBuildTime(runtime.buildTime);
  if (currentBuild !== null && runtimeBuild !== null) {
    return currentBuild !== runtimeBuild;
  }

  const currentVersion = current.version.trim();
  const runtimeVersion = runtime.version.trim();
  if (currentVersion && runtimeVersion && currentVersion !== "unknown" && runtimeVersion !== "unknown") {
    return currentVersion !== runtimeVersion;
  }

  return false;
}

/** Fetch the server-side build identity without browser or service-worker cache. */
export async function fetchRuntimeBuildInfo(): Promise<RuntimeBuildInfo | null> {
  const response = await fetch(`/version.json?_=${Date.now()}`, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });
  if (!response.ok) throw new Error(`version.json returned HTTP ${response.status}`);
  return parseRuntimeBuildInfo(await response.json());
}

export function shortCommit(commit: string): string {
  const normalized = commit.trim();
  return isKnownCommit(normalized) ? normalized.slice(0, 7) : normalized || "unknown";
}

/** Compact "v0.2.0 · da3065f" label for the sidebar footer. */
export function compactBuildLabel(info: BuildInfo = BUILD_INFO): string {
  return `v${info.version} · ${shortCommit(info.commit)}`;
}

/** Human-readable build time in the local timezone, or "—" when unknown. */
export function formatBuildTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-CN", { hour12: false });
}
