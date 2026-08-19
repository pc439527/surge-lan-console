import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
} from "axios";
import { ENDPOINTS } from "./endpoints";
import { SurgeError } from "./errors";
import type {
  DnsCacheEntry,
  DnsResult,
  EventLevel,
  EventList,
  FeatureState,
  GroupSelection,
  GroupTestResult,
  ModuleInfo,
  Modules,
  OutboundMode,
  Policies,
  PolicyGroups,
  ProfileInfo,
  RecentRequests,
  RequestItem,
  RuleInfo,
  Scriptings,
  Traffic,
  TrafficSummary,
} from "./types";

export interface SurgeConnectionConfig {
  protocol: "http" | "https";
  host: string;
  port: number;
  apiKey: string;
  timeoutMs?: number;
}

export interface TestConnectionResult {
  ok: boolean;
  latencyMs: number | null;
}

const DEFAULT_TIMEOUT_MS = 5000;

function classifyError(error: unknown): SurgeError {
  if (error instanceof SurgeError) return error;

  if (axios.isAxiosError(error)) {
    const ax = error as AxiosError;
    const status = ax.response?.status;
    if (ax.code === "ECONNABORTED") {
      return new SurgeError("timeout", "请求超时。设备可能不可达或响应缓慢。", { status });
    }
    if (!ax.response) {
      const code = ax.code ?? "";
      const msg = ax.message ?? "";
      const isNetwork =
        code === "ERR_NETWORK" ||
        code === "ERR_CONNECTION_REFUSED" ||
        /network error/i.test(msg);
      if (isNetwork) {
        return new SurgeError("connection", "无法连接到 Surge。请确认设备可达且端口正确。", { detail: code || msg });
      }
      return new SurgeError("browser-security", "浏览器拦截了请求（混合内容或 CORS）。请在局域网内使用 HTTP 访问，或为 Surge API 启用 HTTPS。", { detail: code || msg });
    }
    if (status === 401 || status === 403) {
      return new SurgeError("authentication", "API 密钥无效或请求未获授权。", { status });
    }
    if (status === 404) {
      return new SurgeError("unsupported", "当前 Surge 版本不支持该 API。", { status });
    }
    return new SurgeError("api", `Surge 返回错误（HTTP ${status}）。`, { status });
  }

  return new SurgeError("api", "发生未知 API 错误。");
}

/** Aggregate traffic: sum all interfaces (matches YASD behaviour). */
export function summarizeTraffic(traffic: Traffic): TrafficSummary {
  let uploadRate = 0;
  let downloadRate = 0;
  let totalUpload = 0;
  let totalDownload = 0;
  for (const name in traffic.interface) {
    const conn = traffic.interface[name];
    uploadRate += conn.outCurrentSpeed ?? 0;
    downloadRate += conn.inCurrentSpeed ?? 0;
    totalUpload += conn.out ?? 0;
    totalDownload += conn.in ?? 0;
  }
  return { uploadRate, downloadRate, totalUpload, totalDownload };
}

/**
 * All Surge HTTP traffic goes through this class.
 * Never call axios directly from React components (AGENTS.md §3).
 */
export class SurgeClient {
  private readonly http: AxiosInstance;

  constructor(private readonly config: SurgeConnectionConfig) {
    this.http = axios.create({
      baseURL: `${config.protocol}://${config.host}:${config.port}`,
      timeout: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      headers: { "X-Key": config.apiKey },
    });
    this.http.interceptors.response.use(
      (res) => res,
      (error) => Promise.reject(classifyError(error)),
    );
  }

  get connection(): SurgeConnectionConfig {
    return this.config;
  }

  private async get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    const res = await this.http.get<T>(url, { params } as AxiosRequestConfig);
    return res.data;
  }

  private async post<T>(url: string, body?: unknown): Promise<T> {
    const res = await this.http.post<T>(url, body);
    return res.data;
  }

  // ── Connection ────────────────────────────────────────────────
  async testConnection(): Promise<TestConnectionResult> {
    const started = performance.now();
    try {
      await this.http.get(ENDPOINTS.outbound);
      return { ok: true, latencyMs: Math.round(performance.now() - started) };
    } catch (error) {
      if (error instanceof SurgeError) {
        // A reachable-but-rejecting device still counts as connected.
        if (error.kind === "authentication" || error.kind === "api") {
          return { ok: true, latencyMs: Math.round(performance.now() - started) };
        }
      }
      throw error;
    }
  }

  // ── Features ─────────────────────────────────────────────────
  /** GET /v1/features/{name} -> {"enabled": bool} */
  private async getFeatureState(endpoint: string): Promise<boolean> {
    const raw = await this.get<{ enabled?: boolean }>(endpoint);
    return raw.enabled === true;
  }

  private async setFeatureState(endpoint: string, enabled: boolean): Promise<void> {
    await this.post<void>(endpoint, { enabled });
  }

  async getFeatures(): Promise<FeatureState> {
    const [mitm, rewrite, scripting, capture] = await Promise.all([
      this.getFeatureState(ENDPOINTS.featuresMitm),
      this.getFeatureState(ENDPOINTS.featuresRewrite),
      this.getFeatureState(ENDPOINTS.featuresScripting),
      this.getFeatureState(ENDPOINTS.featuresCapture),
    ]);
    return { mitm, rewrite, scripting, capture };
  }

  async setFeature(feature: keyof FeatureState, enabled: boolean): Promise<void> {
    const endpoint = {
      mitm: ENDPOINTS.featuresMitm,
      rewrite: ENDPOINTS.featuresRewrite,
      scripting: ENDPOINTS.featuresScripting,
      capture: ENDPOINTS.featuresCapture,
    }[feature];
    await this.setFeatureState(endpoint, enabled);
  }

  // ── Outbound mode ─────────────────────────────────────────────
  /** GET /v1/outbound -> {"mode": "rule"} */
  async getOutboundMode(): Promise<OutboundMode> {
    const raw = await this.get<{ mode?: OutboundMode }>(ENDPOINTS.outbound);
    return raw.mode ?? "rule";
  }

  async setOutboundMode(mode: OutboundMode): Promise<void> {
    await this.post<void>(ENDPOINTS.outbound, { mode });
  }

  async getGlobalOutboundPolicy(): Promise<string> {
    const raw = await this.get<{ policy?: string }>(ENDPOINTS.outboundGlobal);
    return raw.policy ?? "";
  }

  // ── Policies ──────────────────────────────────────────────────
  /** GET /v1/policies -> { "policy-groups": [...], proxies: [...] } */
  async getPolicies(): Promise<Policies> {
    return this.get<Policies>(ENDPOINTS.policies);
  }

  /** GET /v1/policy_groups -> { [groupName]: Policy[] } */
  async getPolicyGroups(): Promise<PolicyGroups> {
    return this.get<PolicyGroups>(ENDPOINTS.policyGroups);
  }

  /** GET /v1/policy_groups/select?group_name=X -> {"policy": "..."} */
  async getGroupSelection(groupName: string): Promise<string> {
    const raw = await this.get<GroupSelection>(ENDPOINTS.policyGroupsSelect, {
      group_name: groupName,
    });
    return raw.policy;
  }

  /** POST /v1/policy_groups/select {group_name, policy} */
  async selectPolicy(groupName: string, policyName: string): Promise<void> {
    await this.post<void>(ENDPOINTS.policyGroupsSelect, {
      group_name: groupName,
      policy: policyName,
    });
  }

  /** POST /v1/policy_groups/test {group_name} -> {"available": [...]} */
  async testPolicyGroup(groupName: string): Promise<GroupTestResult> {
    return this.post<GroupTestResult>(ENDPOINTS.policyGroupsTest, {
      group_name: groupName,
    });
  }

  /** POST /v1/policies/test {policy_names, url} */
  async testPolicies(policyNames: string[], url?: string): Promise<void> {
    await this.post<void>(ENDPOINTS.policiesTest, {
      policy_names: policyNames,
      url: url ?? "http://www.gstatic.com/generate_204",
    });
  }

  // ── Requests ──────────────────────────────────────────────────
  /** GET /v1/requests/recent -> { requests: [...] } */
  async getRecentRequests(): Promise<RequestItem[]> {
    const raw = await this.get<RecentRequests>(ENDPOINTS.requestsRecent);
    return raw.requests ?? [];
  }

  /** GET /v1/requests/active -> { requests: [...] } */
  async getActiveRequests(): Promise<RequestItem[]> {
    const raw = await this.get<RecentRequests>(ENDPOINTS.requestsActive);
    return raw.requests ?? [];
  }

  /** POST /v1/requests/kill {"id": N} */
  async killRequest(id: number): Promise<void> {
    await this.post<void>(ENDPOINTS.requestsKill, { id });
  }

  // ── Traffic ───────────────────────────────────────────────────
  async getTraffic(): Promise<Traffic> {
    return this.get<Traffic>(ENDPOINTS.traffic);
  }

  async getTrafficSummary(): Promise<TrafficSummary> {
    return summarizeTraffic(await this.getTraffic());
  }

  // ── Events & Rules ────────────────────────────────────────────
  /** GET /v1/events -> { events: [...] } */
  async getEvents(): Promise<EventList> {
    return this.get<EventList>(ENDPOINTS.events);
  }

  /** Convert raw event type (0/1/2) to a display level. */
  static eventLevel(type: number): EventLevel {
    if (type === 2) return "error";
    if (type === 1) return "warn";
    return "info";
  }

  async getRules(): Promise<RuleInfo[]> {
    const raw = await this.get<RuleInfo[]>(ENDPOINTS.rules);
    return Array.isArray(raw) ? raw : [];
  }

  // ── DNS ───────────────────────────────────────────────────────
  /** GET /v1/dns -> { local: [...], dnsCache: [...] } */
  async getDnsCache(): Promise<DnsResult> {
    return this.get<DnsResult>(ENDPOINTS.dns);
  }

  async getDnsCacheEntries(): Promise<DnsCacheEntry[]> {
    const raw = await this.getDnsCache();
    return raw.dnsCache ?? [];
  }

  async flushDns(): Promise<void> {
    await this.post<void>(ENDPOINTS.dnsFlush);
  }

  /** POST /v1/test/dns_delay {"domain": "..."} */
  async testDnsDelay(domain: string): Promise<unknown> {
    return this.post(ENDPOINTS.dnsDelayTest, { domain });
  }

  // ── Modules ───────────────────────────────────────────────────
  /** GET /v1/modules -> { enabled: [...], available: [...] } */
  async getModules(): Promise<Modules> {
    return this.get<Modules>(ENDPOINTS.modules);
  }

  async getModuleList(): Promise<ModuleInfo[]> {
    const raw = await this.getModules();
    const enabled = new Set(raw.enabled ?? []);
    const all = new Set<string>([...(raw.enabled ?? []), ...(raw.available ?? [])]);
    return [...all].map((name) => ({ name, enabled: enabled.has(name) }));
  }

  /** POST /v1/modules { [name]: bool } */
  async updateModule(name: string, enabled: boolean): Promise<void> {
    await this.post<void>(ENDPOINTS.modules, { [name]: enabled });
  }

  // ── Scripts ───────────────────────────────────────────────────
  /** GET /v1/scripting -> { scripts: [...] } */
  async getScripts(): Promise<Scriptings> {
    return this.get<Scriptings>(ENDPOINTS.scripting);
  }

  async getScriptList() {
    const raw = await this.getScripts();
    return raw.scripts ?? [];
  }

  /** POST /v1/scripting/evaluate */
  async evaluateScript(scriptText: string, mockType = "cron", timeout = 5): Promise<unknown> {
    return this.post(ENDPOINTS.scriptingEvaluate, {
      script_text: scriptText,
      mock_type: mockType,
      timeout,
    });
  }

  /** POST /v1/scripting/cron/evaluate {"script_name": "..."} */
  async runCronScript(scriptName: string): Promise<unknown> {
    return this.post(ENDPOINTS.scriptingCronEvaluate, { script_name: scriptName });
  }

  // ── Profile ───────────────────────────────────────────────────
  /** GET /v1/profiles/current?sensitive=0 (mask passwords) */
  async getCurrentProfile(sensitive = false): Promise<ProfileInfo | string> {
    const raw = await this.get<ProfileInfo | string>(ENDPOINTS.profilesCurrent, {
      sensitive: sensitive ? 1 : 0,
    });
    return raw;
  }

  /** Extract displayable profile text regardless of response shape. */
  static profileText(profile: ProfileInfo | string): string {
    if (typeof profile === "string") return profile;
    return profile.profile ?? profile.originalProfile ?? "";
  }

  async reloadProfile(): Promise<void> {
    await this.post<void>(ENDPOINTS.profilesReload);
  }

  // ── Metrics (V2, capability-gated) ────────────────────────────
  async getMetrics(): Promise<string> {
    return this.get<string>(ENDPOINTS.metrics);
  }
}

export { classifyError };