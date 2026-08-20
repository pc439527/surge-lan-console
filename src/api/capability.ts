import { ENDPOINT_REGISTRY } from "./registry";
import { SurgeError } from "./errors";
import type { SurgeClient } from "./surge-client";

/**
 * Capability Engine (v0.3.0, 用户优化建议 P0 #2).
 *
 * Surge 的平台（iOS / tvOS / macOS）暴露的 HTTP API 并不一致 —— 例如 tvOS
 * 通常没有 /v1/rules、/v1/modules、/v1/scripting，macOS 全量开放。此前每个
 * 页面各自把 404/405 渲染成“平台不支持”，但导航栏不会因此隐藏/标记，用户对
 * “为什么这个设备没有某页面”没有解释。
 *
 * 本模块在连接建立后探测一组轻量端点（复用 Diagnostics 的同一个 registry
 * parser，保证“探测为 OK ⇒ 页面可渲染”），把结果整理成 CapabilityReport：
 *
 *   probe → classify（200/404/401/超时/解析失败）→ features 能力表
 *                                                     → platform 平台判定
 *                                                     → 供导航与页面空状态消费
 *
 * 关键原则：
 *  - 只探测 registry 中已有 parser 的端点（含 /v1/outbound 用于延迟指标）；
 *    原始响应不进报告（避免敏感字段进内存/状态）。
 *  - “无法识别 ≠ 空”：200 但 parser 抛错 → parse-error，页面照常走错误态，
 *    而不是假装“0 条数据”。
 *  - 平台判定是启发式的、可校准；连接可手动指定 platform 覆盖自动判定。
 */

export type SurgePlatform = "ios" | "tvos" | "macos" | "unknown";

/** 连接上可手动指定的平台（unknown 只能由自动判定产生）。 */
export type PlatformOverride = Exclude<SurgePlatform, "unknown">;

export type CapabilityStatus =
  | "supported" // 200 + 页面 parser 通过
  | "unsupported" // 404/405 —— 平台未开放该接口
  | "parse-error" // 200 但结构无法识别（未知 ≠ 空）
  | "unreachable" // 网络/超时/5xx —— 探测未完成，不据此隐藏功能
  | "unauthorized" // 401/403 —— 密钥问题，探测整体不可信
  | "unknown"; // 未探测（例如该端点不参与探测）

export const CAPABILITY_FEATURES = [
  "traffic",
  "requests",
  "policies",
  "dns",
  "rules",
  "modules",
  "scripts",
  "events",
] as const;

export type CapabilityFeature = (typeof CAPABILITY_FEATURES)[number];

export const FEATURE_LABEL: Record<CapabilityFeature, string> = {
  traffic: "Traffic",
  requests: "Requests",
  policies: "Policies",
  dns: "DNS",
  rules: "Rules",
  modules: "Modules",
  scripts: "Scripts",
  events: "Events",
};

export const PLATFORM_LABEL: Record<SurgePlatform, string> = {
  ios: "Surge iOS",
  tvos: "Apple TV / tvOS",
  macos: "Surge macOS",
  unknown: "未知平台",
};

export interface CapabilityProbe {
  endpoint: string;
  status: CapabilityStatus;
  /** 该端点的 HTTP 往返延迟（ms）—— 供 Dashboard 延迟指标使用。 */
  latencyMs: number | null;
}

export interface CapabilityReport {
  platform: SurgePlatform;
  /** true = 自动判定；false = 用户在连接设置中手动指定。 */
  platformDetected: boolean;
  probes: Record<string, CapabilityProbe>;
  features: Record<CapabilityFeature, CapabilityStatus>;
  /** /v1/outbound 的往返延迟（ms，探测成功时）。 */
  latencyMs: number | null;
  probedAt: number;
}

/** 端点 → 功能。不在表内的端点（如 /v1/outbound）只为延迟/健康探测，不映射功能。 */
const ENDPOINT_FEATURE: Record<string, CapabilityFeature> = {
  "/v1/traffic": "traffic",
  "/v1/requests/recent": "requests",
  "/v1/policy_groups": "policies",
  "/v1/dns": "dns",
  "/v1/rules": "rules",
  "/v1/modules": "modules",
  "/v1/scripting": "scripts",
  "/v1/events": "events",
};

/** 探测端点（顺序即展示顺序）。/v1/outbound 最轻，同时为延迟指标提供数据。 */
export const CAPABILITY_ENDPOINTS = [
  "/v1/outbound",
  "/v1/traffic",
  "/v1/requests/recent",
  "/v1/policy_groups",
  "/v1/dns",
  "/v1/rules",
  "/v1/modules",
  "/v1/scripting",
  "/v1/events",
] as const;

/** 与 Diagnostics 共享的 parser —— 探测“OK”意味着页面可以渲染同一份载荷。 */
const ADAPTERS = new Map(ENDPOINT_REGISTRY.map((a) => [a.endpoint, a]));

/** probeEndpoint 返回形状的窄类型（与 SurgeClient.probeEndpoint 一致）。 */
export interface EndpointProbeResult {
  status: number | null;
  latencyMs: number | null;
  raw: unknown;
  error?: unknown;
}

/**
 * 把一次端点探测归类为能力状态。导出供单元测试直接验证。
 */
export function classifyEndpointProbe(
  endpoint: string,
  probe: EndpointProbeResult,
): CapabilityProbe {
  if (probe.error instanceof SurgeError) {
    switch (probe.error.kind) {
      case "authentication":
        // 401/403：密钥问题，不是平台能力问题 —— 探测整体不可信。
        return { endpoint, status: "unauthorized", latencyMs: probe.latencyMs };
      case "unsupported":
        // 404/405：平台未开放该接口 —— 真正的“不支持”。
        return { endpoint, status: "unsupported", latencyMs: probe.latencyMs };
      default:
        // timeout / connection / browser-security / server-error / api：
        // 瞬时或歧义状态，不据此隐藏功能。
        return { endpoint, status: "unreachable", latencyMs: probe.latencyMs };
    }
  }
  const adapter = ADAPTERS.get(endpoint);
  if (adapter) {
    try {
      adapter.normalize(probe.raw);
    } catch {
      return { endpoint, status: "parse-error", latencyMs: probe.latencyMs };
    }
  }
  return { endpoint, status: "supported", latencyMs: probe.latencyMs };
}

/**
 * 平台判定（启发式，可在真实设备上校准）：
 *  - modules + scripts + rules 全支持        → macOS
 *  - 三者全不支持但核心接口可用              → tvOS（Apple TV）
 *  - rules 支持但 modules 不支持             → iOS（介于两者之间）
 *  - 其他情况（探测未完成等）                → unknown
 */
export function detectPlatform(
  features: Record<CapabilityFeature, CapabilityStatus>,
): SurgePlatform {
  const is = (f: CapabilityFeature) => features[f] === "supported";
  const not = (f: CapabilityFeature) => features[f] === "unsupported";
  if (is("modules") && is("scripts") && is("rules")) return "macos";
  const coreUp = is("traffic") || is("requests") || is("dns") || is("policies");
  if (not("modules") && not("scripts") && not("rules") && coreUp) return "tvos";
  if (is("rules") && not("modules")) return "ios";
  return "unknown";
}

/**
 * 探测一组端点并生成能力报告。
 * @param platformOverride 用户在连接设置中的手动指定（覆盖自动判定）。
 */
export async function probeCapabilities(
  client: SurgeClient,
  platformOverride?: PlatformOverride,
  signal?: AbortSignal,
): Promise<CapabilityReport> {
  const settled = await Promise.allSettled(
    CAPABILITY_ENDPOINTS.map(async (endpoint) => {
      try {
        const probe = await client.probeEndpoint(endpoint, signal);
        return [endpoint, classifyEndpointProbe(endpoint, probe)] as const;
      } catch {
        // probeEndpoint 理论上会自行捕获错误，此处兜底：当作不可达。
        return [endpoint, { endpoint, status: "unreachable", latencyMs: null }] as const;
      }
    }),
  );

  const probes: Record<string, CapabilityProbe> = {};
  for (const item of settled) {
    if (item.status === "fulfilled") {
      probes[item.value[0]] = item.value[1];
    }
  }

  const features = {} as Record<CapabilityFeature, CapabilityStatus>;
  for (const feature of CAPABILITY_FEATURES) {
    features[feature] = "unknown";
  }
  for (const [endpoint, feature] of Object.entries(ENDPOINT_FEATURE)) {
    features[feature] = probes[endpoint]?.status ?? "unknown";
  }

  const outbound = probes["/v1/outbound"];
  const latencyMs = outbound?.status === "supported" ? outbound.latencyMs : null;

  const platform = platformOverride ?? detectPlatform(features);
  return {
    platform,
    platformDetected: !platformOverride,
    probes,
    features,
    latencyMs,
    probedAt: Date.now(),
  };
}

/** 报告里“确认不支持”的功能列表（用于 CapabilityNotice 的说明清单）。 */
export function unsupportedFeatures(report: CapabilityReport): CapabilityFeature[] {
  return CAPABILITY_FEATURES.filter((f) => report.features[f] === "unsupported");
}

/** 报告里“确认可用”的功能列表。 */
export function supportedFeatures(report: CapabilityReport): CapabilityFeature[] {
  return CAPABILITY_FEATURES.filter((f) => report.features[f] === "supported");
}

/** 该功能是否确定不可用（导航据此隐藏/标记）。unknown/unreachable 一律视为可用。 */
export function isFeatureUnsupported(
  report: CapabilityReport | undefined,
  feature: CapabilityFeature,
): boolean {
  return report?.features[feature] === "unsupported";
}
