import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
} from "axios";
import { ENDPOINTS } from "./endpoints";
import { SurgeError } from "./errors";
import { z } from "zod";
import { parseOrThrow, requestItemSchema, trafficSchema, trafficSummarySchema } from "./schemas";
import { normalizeEvents } from "./normalize/events";
import { normalizeRules } from "./normalize/rules";
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
  PolicyBenchmarkResults,
  PolicyGroupTestResults,
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
  /**
   * Reverse-proxy mode (v0.2.2): when set, the client targets THIS base URL
   * instead of protocol://host:port. The console's nginx proxies /v1/ to the
   * real Surge device, which lets an HTTPS-served console reach a plain-HTTP
   * Surge API without browser mixed-content blocks. proxyTarget keeps the
   * original device address so the console can verify/report it.
   */
  proxyBaseUrl?: string;
  /** The real device address ("192.168.50.10:6171") when proxyBaseUrl is set. */
  proxyTarget?: string;
}

/**
 * Connection probe result — separates device reachability from API auth,
 * so the UI can distinguish "device up, key invalid" from "device down".
 */
export interface TestConnectionResult {
  /** The device responded over HTTP (any status). */
  reachable: boolean;
  /** API key was accepted (2xx from /v1/outbound). */
  authenticated: boolean;
  /** Round-trip latency in ms; null when the probe never completed. */
  latencyMs: number | null;
  /** The underlying error, when the probe failed. */
  error?: SurgeError;
}

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * True when the page is HTTPS but the Surge API target is plain HTTP —
 * the browser blocks such requests as mixed content (never reaches the
 * device), so we must explain the real cause instead of "device down".
 *
 * pageProtocol is injectable so tests can exercise the HTTPS case without
 * mutating jsdom's location; production always passes window.location.protocol.
 */
export function isMixedContentBlocked(
  baseUrl: string | undefined,
  pageProtocol?: string,
): boolean {
  if (!baseUrl || !baseUrl.startsWith("http://")) return false;
  const protocol = pageProtocol ?? (typeof window !== "undefined" ? window.location?.protocol : undefined);
  return protocol === "https:";
}

function classifyError(error: unknown): SurgeError {
  if (error instanceof SurgeError) return error;

  if (axios.isAxiosError(error)) {
    const ax = error as AxiosError;
    const status = ax.response?.status;
    if (ax.code === "ECONNABORTED") {
      return new SurgeError("timeout", "请求超时。设备可能不可达或响应缓慢。", { status });
    }
    if (!ax.response) {
      // Mixed content: the console is served over HTTPS but the Surge API is
      // plain HTTP — the browser blocks the request before it leaves. This is
      // NOT a device problem; direct the user to the proxy mode instead.
      const pageProtocol =
        typeof window !== "undefined" ? window.location?.protocol : undefined;
      if (isMixedContentBlocked(ax.config?.baseURL, pageProtocol)) {
        return new SurgeError(
          "browser-security",
          "控制台通过 HTTPS 打开，但 Surge API 是纯 HTTP —— 浏览器拦截了混合内容请求。请在连接上开启「通过控制台反向代理」后再试。",
          { detail: "mixed-content" },
        );
      }
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
    // v0.2.1 T05 taxonomy: 404/405 → unsupported, 408 → timeout, 5xx → server-error.
    if (status === 404 || status === 405) {
      return new SurgeError("unsupported", "当前 Surge 版本不支持该 API。", { status });
    }
    if (status === 408) {
      return new SurgeError("timeout", "请求超时（HTTP 408）。", { status });
    }
    if (status !== undefined && status >= 500) {
      return new SurgeError("server-error", `Surge API 服务返回错误（HTTP ${status}）。`, { status });
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
  return { uploadRate, downloadRate, totalUpload, totalDownload, startTime: traffic.startTime };
}

/**
 * All Surge HTTP traffic goes through this class.
 * Never call axios directly from React components (AGENTS.md §3).
 */
export class SurgeClient {
  private readonly http: AxiosInstance;

  constructor(private readonly config: SurgeConnectionConfig) {
    this.http = axios.create({
      // Proxy mode: talk to the console origin; nginx forwards /v1/ to the device.
      baseURL: config.proxyBaseUrl ?? `${config.protocol}://${config.host}:${config.port}`,
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

  private async get<T>(
    url: string,
    params?: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<T> {
    const res = await this.http.get<T>(url, { params, signal } as AxiosRequestConfig);
    return res.data;
  }

  private async post<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const res = await this.http.post<T>(url, body, { signal } as AxiosRequestConfig);
    return res.data;
  }

  // ── Connection ────────────────────────────────────────────────
  async testConnection(signal?: AbortSignal): Promise<TestConnectionResult> {
    const started = performance.now();
    try {
      await this.http.get(ENDPOINTS.outbound, { signal } as AxiosRequestConfig);
      return {
        reachable: true,
        authenticated: true,
        latencyMs: Math.round(performance.now() - started),
      };
    } catch (error) {
      if (error instanceof SurgeError) {
        // Any HTTP response proves that the device is reachable, even when
        // the endpoint is unsupported or the server is unhealthy.  Keep
        // reachability separate from authentication as promised by the
        // TestConnectionResult contract.
        if (error.status !== undefined) {
          return {
            reachable: true,
            authenticated: false,
            latencyMs: Math.round(performance.now() - started),
            error,
          };
        }
        // Timeout / network / browser-security: the probe never completed.
        return {
          reachable: false,
          authenticated: false,
          latencyMs: null,
          error,
        };
      }
      return {
        reachable: false,
        authenticated: false,
        latencyMs: null,
        error: classifyError(error),
      };
    }
  }

  // ── Features ─────────────────────────────────────────────────
  /** GET /v1/features/{name} -> {"enabled": bool} */
  private async getFeatureState(endpoint: string, signal?: AbortSignal): Promise<boolean> {
    const raw = await this.get<{ enabled?: boolean }>(endpoint, undefined, signal);
    return raw.enabled === true;
  }

  private async setFeatureState(endpoint: string, enabled: boolean, signal?: AbortSignal): Promise<void> {
    await this.post<void>(endpoint, { enabled }, signal);
  }

  async getFeatures(signal?: AbortSignal): Promise<FeatureState> {
    const [mitm, rewrite, scripting, capture] = await Promise.all([
      this.getFeatureState(ENDPOINTS.featuresMitm, signal),
      this.getFeatureState(ENDPOINTS.featuresRewrite, signal),
      this.getFeatureState(ENDPOINTS.featuresScripting, signal),
      this.getFeatureState(ENDPOINTS.featuresCapture, signal),
    ]);
    return { mitm, rewrite, scripting, capture };
  }

  async setFeature(feature: keyof FeatureState, enabled: boolean, signal?: AbortSignal): Promise<void> {
    const endpoint = {
      mitm: ENDPOINTS.featuresMitm,
      rewrite: ENDPOINTS.featuresRewrite,
      scripting: ENDPOINTS.featuresScripting,
      capture: ENDPOINTS.featuresCapture,
    }[feature];
    await this.setFeatureState(endpoint, enabled, signal);
  }

  // ── Outbound mode ─────────────────────────────────────────────
  /** GET /v1/outbound -> {"mode": "rule"} */
  async getOutboundMode(signal?: AbortSignal): Promise<OutboundMode> {
    const raw = await this.get<{ mode?: OutboundMode }>(ENDPOINTS.outbound, undefined, signal);
    return raw.mode ?? "rule";
  }

  async setOutboundMode(mode: OutboundMode, signal?: AbortSignal): Promise<void> {
    await this.post<void>(ENDPOINTS.outbound, { mode }, signal);
  }

  async getGlobalOutboundPolicy(signal?: AbortSignal): Promise<string> {
    const raw = await this.get<{ policy?: string }>(ENDPOINTS.outboundGlobal, undefined, signal);
    return raw.policy ?? "";
  }

  // ── Policies ──────────────────────────────────────────────────
  /** GET /v1/policies -> { "policy-groups": [...], proxies: [...] } */
  async getPolicies(signal?: AbortSignal): Promise<Policies> {
    return this.get<Policies>(ENDPOINTS.policies, undefined, signal);
  }

  /** GET /v1/policy_groups -> { [groupName]: Policy[] } */
  async getPolicyGroups(signal?: AbortSignal): Promise<PolicyGroups> {
    return this.get<PolicyGroups>(ENDPOINTS.policyGroups, undefined, signal);
  }

  /** GET /v1/policy_groups/select?group_name=X -> {"policy": "..."} */
  async getGroupSelection(groupName: string, signal?: AbortSignal): Promise<string> {
    const raw = await this.get<GroupSelection>(
      ENDPOINTS.policyGroupsSelect,
      { group_name: groupName },
      signal,
    );
    return raw.policy;
  }

  /** POST /v1/policy_groups/select {group_name, policy} */
  async selectPolicy(groupName: string, policyName: string, signal?: AbortSignal): Promise<void> {
    await this.post<void>(
      ENDPOINTS.policyGroupsSelect,
      { group_name: groupName, policy: policyName },
      signal,
    );
  }

  /** POST /v1/policy_groups/test. Surge returns per-policy transport metrics keyed by name. */
  async testPolicyGroup(groupName: string, signal?: AbortSignal): Promise<GroupTestResult> {
    const raw = await this.post<unknown>(ENDPOINTS.policyGroupsTest, { group_name: groupName }, signal);
    return normalizePolicyGroupTest(raw);
  }

  /** POST /v1/policies/test {policy_names, url} */
  async testPolicies(policyNames: string[], url?: string, signal?: AbortSignal): Promise<void> {
    await this.post<void>(
      ENDPOINTS.policiesTest,
      { policy_names: policyNames, url: url ?? "http://www.gstatic.com/generate_204" },
      signal,
    );
  }

  /** GET /v1/policy_groups/test_results -> per-policy latency after the last test. */
  async getPolicyBenchmarkResults(signal?: AbortSignal): Promise<PolicyBenchmarkResults> {
    return this.get<PolicyBenchmarkResults>(ENDPOINTS.policyBenchmarkResults, undefined, signal);
  }

  async getPolicyTestResults(signal?: AbortSignal): Promise<PolicyGroupTestResults> {
    const raw = await this.get<PolicyGroupTestResults>(
      ENDPOINTS.policyGroupsTestResults,
      undefined,
      signal,
    );
    return raw ?? {};
  }

  // ── Requests ──────────────────────────────────────────────────
  /**
   * Parse a request list and pin the original record onto each item.
   * The schema is passthrough, so `item.raw` preserves every unmodelled
   * platform field instead of dropping it (Request Inspector V2).
   */
  private parseRequestList(endpoint: string, rawRequests: unknown): RequestItem[] {
    const items = parseOrThrow(
      z.array(requestItemSchema),
      rawRequests,
      endpoint,
    );
    return items.map((item) => ({ ...item, raw: item }));
  }

  /** GET /v1/requests/recent -> { requests: [...] } */
  async getRecentRequests(signal?: AbortSignal): Promise<RequestItem[]> {
    const raw = await this.get<RecentRequests>(ENDPOINTS.requestsRecent, undefined, signal);
    return this.parseRequestList(ENDPOINTS.requestsRecent, raw.requests ?? []);
  }

  /** GET /v1/requests/active -> { requests: [...] } */
  async getActiveRequests(signal?: AbortSignal): Promise<RequestItem[]> {
    const raw = await this.get<RecentRequests>(ENDPOINTS.requestsActive, undefined, signal);
    return this.parseRequestList(ENDPOINTS.requestsActive, raw.requests ?? []);
  }

  /** POST /v1/requests/kill {"id": N} */
  async killRequest(id: number, signal?: AbortSignal): Promise<void> {
    await this.post<void>(ENDPOINTS.requestsKill, { id }, signal);
  }

  // ── Traffic ───────────────────────────────────────────────────
  /**
   * Raw GET /v1/traffic payload, runtime-validated so missing per-platform
   * fields default to 0 instead of poisoning the Traffic page.
   */
  async getTraffic(signal?: AbortSignal): Promise<Traffic> {
    const raw = await this.get<unknown>(ENDPOINTS.traffic, undefined, signal);
    return parseOrThrow(trafficSchema, raw, ENDPOINTS.traffic);
  }

  async getTrafficSummary(signal?: AbortSignal): Promise<TrafficSummary> {
    const summary = summarizeTraffic(await this.getTraffic(signal));
    return parseOrThrow(trafficSummarySchema, summary, ENDPOINTS.traffic);
  }

  // ── Events & Rules ────────────────────────────────────────────
  /** GET /v1/events -> { events: [...] } (normalized — same parser Diagnostics uses, T01/T03). */
  async getEvents(signal?: AbortSignal): Promise<EventList> {
    const raw = await this.get<unknown>(ENDPOINTS.events, undefined, signal);
    const normalized = normalizeEvents(raw);
    return { events: normalized.events };
  }

  /** Convert raw event type (0/1/2) to a display level. */
  static eventLevel(type: number): EventLevel {
    if (type === 2) return "error";
    if (type === 1) return "warn";
    return "info";
  }

  async getRules(signal?: AbortSignal): Promise<RuleInfo[]> {
    const raw = await this.get<unknown>(ENDPOINTS.rules, undefined, signal);
    // Task 05: unknown shape must THROW (→ "parse error" state), never [].
    return normalizeRules(raw);
  }

  // ── DNS ───────────────────────────────────────────────────────
  /** GET /v1/dns -> { local: [...], dnsCache: [...] } */
  async getDnsCache(signal?: AbortSignal): Promise<DnsResult> {
    return this.get<DnsResult>(ENDPOINTS.dns, undefined, signal);
  }

  async getDnsCacheEntries(signal?: AbortSignal): Promise<DnsCacheEntry[]> {
    const raw = await this.getDnsCache(signal);
    return raw.dnsCache ?? [];
  }

  async flushDns(signal?: AbortSignal): Promise<void> {
    await this.post<void>(ENDPOINTS.dnsFlush, undefined, signal);
  }

  /** POST /v1/test/dns_delay {"domain": "..."} */
  async testDnsDelay(domain: string, signal?: AbortSignal): Promise<unknown> {
    return this.post(ENDPOINTS.dnsDelayTest, { domain }, signal);
  }

  // ── Modules ───────────────────────────────────────────────────
  /** GET /v1/modules -> { enabled: [...], available: [...] } */
  async getModules(signal?: AbortSignal): Promise<Modules> {
    return this.get<Modules>(ENDPOINTS.modules, undefined, signal);
  }

  async getModuleList(signal?: AbortSignal): Promise<ModuleInfo[]> {
    const raw = await this.getModules(signal);
    const enabled = new Set(raw.enabled ?? []);
    const all = new Set<string>([...(raw.enabled ?? []), ...(raw.available ?? [])]);
    return [...all].map((name) => ({ name, enabled: enabled.has(name) }));
  }

  /** POST /v1/modules { [name]: bool } */
  async updateModule(name: string, enabled: boolean, signal?: AbortSignal): Promise<void> {
    await this.post<void>(ENDPOINTS.modules, { [name]: enabled }, signal);
  }

  // ── Scripts ───────────────────────────────────────────────────
  /** GET /v1/scripting -> { scripts: [...] } */
  async getScripts(signal?: AbortSignal): Promise<Scriptings> {
    return this.get<Scriptings>(ENDPOINTS.scripting, undefined, signal);
  }

  async getScriptList(signal?: AbortSignal) {
    const raw = await this.getScripts(signal);
    return raw.scripts ?? [];
  }

  /** POST /v1/scripting/evaluate */
  async evaluateScript(scriptText: string, mockType = "cron", timeout = 5, signal?: AbortSignal): Promise<unknown> {
    return this.post(
      ENDPOINTS.scriptingEvaluate,
      { script_text: scriptText, mock_type: mockType, timeout },
      signal,
    );
  }

  /** POST /v1/scripting/cron/evaluate {"script_name": "..."} */
  async runCronScript(scriptName: string, signal?: AbortSignal): Promise<unknown> {
    return this.post(ENDPOINTS.scriptingCronEvaluate, { script_name: scriptName }, signal);
  }

  // ── Profile ───────────────────────────────────────────────────
  /** GET /v1/profiles/current?sensitive=0 (mask passwords) */
  async getCurrentProfile(sensitive = false, signal?: AbortSignal): Promise<ProfileInfo | string> {
    const raw = await this.get<ProfileInfo | string>(
      ENDPOINTS.profilesCurrent,
      { sensitive: sensitive ? 1 : 0 },
      signal,
    );
    return raw;
  }

  /** Extract displayable profile text regardless of response shape. */
  static profileText(profile: ProfileInfo | string): string {
    if (typeof profile === "string") return profile;
    return profile.profile ?? profile.originalProfile ?? "";
  }

  async reloadProfile(signal?: AbortSignal): Promise<void> {
    await this.post<void>(ENDPOINTS.profilesReload, undefined, signal);
  }

  // ── Metrics (V2, capability-gated) ────────────────────────────
  async getMetrics(signal?: AbortSignal): Promise<string> {
    return this.get<string>(ENDPOINTS.metrics, undefined, signal);
  }

  /**
   * Raw endpoint probe for API Diagnostics (OPTIMIZATION_PLAN Task 04).
   * Captures HTTP status, latency and the raw response so the UI can show
   * whether an endpoint is reachable, unsupported or mis-parsed — without
   * the page-level query layers interfering.
   */
  async probeEndpoint(
    endpoint: string,
    signal?: AbortSignal,
  ): Promise<{ status: number | null; latencyMs: number | null; raw: unknown; error?: SurgeError }> {
    const started = performance.now();
    try {
      const raw = await this.get<unknown>(endpoint, undefined, signal);
      return { status: 200, latencyMs: Math.round(performance.now() - started), raw };
    } catch (error) {
      const latency = Math.round(performance.now() - started);
      if (error instanceof SurgeError) {
        return { status: error.status ?? null, latencyMs: latency, raw: null, error };
      }
      return { status: null, latencyMs: latency, raw: null, error: classifyError(error) };
    }
  }
}

function normalizePolicyGroupTest(raw: unknown): GroupTestResult {
  const root = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const winner = typeof root.winner === "string" ? root.winner : undefined;
  const wrapped = Array.isArray(root.results) && root.results[0] && typeof root.results[0] === "object"
    ? (root.results[0] as Record<string, unknown>).data
    : undefined;
  const metrics = wrapped && typeof wrapped === "object" && !Array.isArray(wrapped)
    ? wrapped as Record<string, unknown>
    : root;
  const declaredAvailable = Array.isArray(root.available)
    ? root.available.filter((item): item is string => typeof item === "string")
    : [];
  const results: Record<string, { ok?: boolean; latency?: number | string | null }> = Object.fromEntries(
    declaredAvailable.map((name) => [name, { ok: true, latency: null }]),
  );
  for (const [name, value] of Object.entries(metrics)) {
    if (["winner", "time", "results", "available"].includes(name)) continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const metric = value as Record<string, unknown>;
    const candidate = metric.receive ?? metric.latency;
    const latency = typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0
      ? Math.round(candidate)
      : null;
    const normalizedOk = typeof metric.ok === "boolean" ? metric.ok : undefined;
    results[name] = {
      ok: normalizedOk ?? latency !== null,
      latency: latency ?? (normalizedOk ? null : "Timeout"),
    };
  }
  return { available: Object.keys(results).filter((name) => results[name].ok), results, ...(winner ? { winner } : {}) };
}

export { classifyError };
