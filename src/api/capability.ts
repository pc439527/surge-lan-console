/**
 * Capability Engine (v0.6.0, P0-2 — platform/capability decoupling).
 *
 * Surge 的平台（iOS / tvOS / macOS）暴露的 HTTP API 并不一致。此前每个页面
 * 各自把 404/405 渲染成"平台不支持"，而平台判定直接由 rules/modules/scripts
 * 的可用性推断 —— 这与真实环境冲突：tvOS 与 iOS 共用同一套引擎核心
 * （rules、scripts 甚至 WireGuard 都可用），仅部分依赖 UI 的能力缺失。
 *
 * 本轮重构（用户优化建议 P0 #2）：
 *   - 平台与能力彻底解耦。**平台只是展示信息**；某个端点能不能用，只由
 *     Capability Probes（= 实际探测结果）决定，绝不由平台推断。
 *   - 自动平台判定只保留一条可信信号：全部探测端点均可用 ⇒ macOS（唯一
 *     官方全量开放 API 的平台）；其余（Apple TV / iOS 核心相同，无法区分）
 *     返回 unknown —— 用户可在「连接」中手动指定平台覆盖。
 *   - 探测端点 / 功能映射派生自 API_DESCRIPTORS（单一来源），并复用
 *     Diagnostics 的同一个 registry parser："探测为 OK ⇒ 页面可渲染"。
 *   - "无法识别 ≠ 空"：200 但 parser 抛错 → parse-error（v0.6.0，P0-3），
 *     与 404/405 的 unsupported 完全分开。
 */

import { ENDPOINT_REGISTRY } from "./registry";
import { API_DESCRIPTORS, CAPABILITY_FEATURES, FEATURE_LABEL } from "./descriptors";
import type { CapabilityFeature } from "./descriptors";
import { SurgeError } from "./errors";
import type { SurgeClient } from "./surge-client";

export type { CapabilityFeature };
export { CAPABILITY_FEATURES, FEATURE_LABEL };

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

/**
 * 探测端点（顺序即展示顺序）—— 派生自 API_DESCRIPTORS 中带 parser 的
 * 描述符。/v1/outbound 最轻，同时为延迟指标提供数据。
 */
export const CAPABILITY_ENDPOINTS: readonly string[] = API_DESCRIPTORS
  .filter((d) => typeof d.normalize === "function")
  .map((d) => d.path);

/** 端点 → 功能（在 descriptor.feature 上声明，派生至此）。 */
export const ENDPOINT_FEATURE: Record<string, CapabilityFeature> = Object.fromEntries(
  API_DESCRIPTORS
    .filter((d) => typeof d.normalize === "function" && d.feature)
    .map((d) => [d.path, d.feature as CapabilityFeature]),
) as Record<string, CapabilityFeature>;

/** 与 Diagnostics 共享的 parser —— 探测"OK"意味着页面可以渲染同一份载荷。 */
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
        // 404/405：平台未开放该接口 —— 真正的"不支持"。
        return { endpoint, status: "unsupported", latencyMs: probe.latencyMs };
      case "parse-error":
        // 200 但结构无法识别 —— 与"不支持"严格区分（P0-3）。
        return { endpoint, status: "parse-error", latencyMs: probe.latencyMs };
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
 * 平台判定（P0-2 重构后只保留一条可信信号）：
 *   - 全部探测端点可用 ⇒ macOS（官方唯一全量开放 HTTP API 的平台）。
 *   - 其余情形（包括 Apple TV / iOS —— 两者核心相同，rules/scripts 均可用，
 *     仅 modules 等 UI 依赖能力缺失）⇒ unknown。
 *
 * 关键原则：**平台是展示信息，不是能力判断依据**。端点是否可用只看
 * Capability Probes；平台无法自动区分时在「连接」中手动指定。
 */
export function detectPlatform(
  features: Record<CapabilityFeature, CapabilityStatus>,
): SurgePlatform {
  const allSupported = CAPABILITY_FEATURES.every((f) => features[f] === "supported");
  return allSupported ? "macos" : "unknown";
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

/** 报告里"确认不支持"的功能列表（用于 CapabilityNotice 的说明清单）。 */
export function unsupportedFeatures(report: CapabilityReport): CapabilityFeature[] {
  return CAPABILITY_FEATURES.filter((f) => report.features[f] === "unsupported");
}

/** 报告里"确认可用"的功能列表。 */
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
