import type { CapabilityReport, CapabilityStatus } from "@/api/capability";
import { ENDPOINT_FEATURE, FEATURE_LABEL } from "@/api/capability";
import { toFriendlyMessage } from "@/api/errors";
import type { SurgeClient } from "@/api/surge-client";

/**
 * Health domain (v0.6.0, P0-4).
 *
 * Health is NOT a Surge API — Surge has no /v1/health. It is derived entirely
 * from the Capability Probe the app already runs (the same probe that feeds
 * the sidebar, dashboard and Diagnostics). Status taxonomy:
 *
 *   healthy      — 端点 200 且页面 parser 通过
 *   warning      — parse-error 等可访问但需注意的状态
 *   unavailable  — 网络/超时/认证失败（探测未完成）
 *   na (N/A)     — 平台正常不提供该 API（HTTP 404/405）—— **不是异常**
 *   unknown      — 尚未探测
 *
 * A platform that legitimately lacks Modules must show "N/A", NEVER turn the
 * overall health into a degraded state.
 */

/** N/A = 当前平台不提供（正常平台差异，不是健康异常）。 */
export type HealthStatus = "healthy" | "warning" | "unavailable" | "na" | "unknown";

export interface HealthCheck {
  id: string;
  label: string;
  status: HealthStatus;
  latencyMs: number | null;
  detail: string;
  checkedAt: number;
}

export interface HealthSummary {
  status: HealthStatus;
  /** 健康（healthy）检查数量 —— na 不计入健康数，也不视为异常。 */
  healthy: number;
  total: number;
  checkedAt: number;
  checks: HealthCheck[];
}

export function healthStatusFromCapability(status: CapabilityStatus): HealthStatus {
  switch (status) {
    case "supported":
      return "healthy";
    case "unsupported":
      return "na"; // 平台差异 —— 不适用，而非异常
    case "parse-error":
      return "warning"; // 可访问但结构无法识别
    case "unreachable":
    case "unauthorized":
      return "unavailable";
    default:
      return "unknown";
  }
}

export function summarizeHealth(checks: HealthCheck[], checkedAt = Date.now()): HealthSummary {
  const healthy = checks.filter((check) => check.status === "healthy").length;
  const status: HealthStatus =
    checks.length === 0
      ? "unknown"
      : checks.some((check) => check.status === "unavailable")
        ? "unavailable"
        : checks.some((check) => check.status === "warning")
          ? "warning"
          : checks.some((check) => check.status === "unknown")
            ? "unknown"
            : "healthy";
  return { status, healthy, total: checks.length, checkedAt, checks };
}

/** feature id → probing endpoint（用于在 report.probes 里取延迟）。 */
const FEATURE_ENDPOINT: Record<string, string> = Object.fromEntries(
  Object.entries(ENDPOINT_FEATURE).map(([endpoint, feature]) => [feature, endpoint]),
);

/**
 * Derive the health report from a capability probe. One source of truth —
 * the page never builds a second query (P0-4: no race between capability
 * refetch and an independently computed "health" query).
 */
export function healthFromCapability(report: CapabilityReport): HealthSummary {
  const checks: HealthCheck[] = [
    {
      id: "api",
      label: "API",
      status: report.latencyMs === null ? "unavailable" : "healthy",
      latencyMs: report.latencyMs,
      detail: report.latencyMs === null ? "无法连接到 Surge API" : "API 连接正常",
      checkedAt: report.probedAt,
    },
  ];
  for (const [feature, status] of Object.entries(report.features)) {
    checks.push({
      id: feature,
      label: FEATURE_LABEL[feature as keyof typeof FEATURE_LABEL] ?? feature.toUpperCase(),
      status: healthStatusFromCapability(status),
      latencyMs: report.probes[FEATURE_ENDPOINT[feature]]?.latencyMs ?? null,
      detail: capabilityDetail(status),
      checkedAt: report.probedAt,
    });
  }
  return summarizeHealth(checks, report.probedAt);
}

/** Direct connection probe (unused by the page — kept as a fallback API). */
export async function getHealthReport(client: SurgeClient, signal?: AbortSignal): Promise<HealthSummary> {
  const checkedAt = Date.now();
  const result = await client.testConnection(signal);
  const api: HealthCheck = {
    id: "api",
    label: "API",
    status: result.authenticated ? "healthy" : result.reachable ? "warning" : "unavailable",
    latencyMs: result.latencyMs,
    detail: result.authenticated ? "API 连接正常" : toFriendlyMessage(result.error),
    checkedAt,
  };
  return summarizeHealth([api], checkedAt);
}

function capabilityDetail(status: CapabilityStatus): string {
  return {
    supported: "能力可用",
    unsupported: "该接口在此平台不提供（视为正常差异）",
    "parse-error": "API 可访问，但响应结构无法识别",
    unreachable: "端点暂时不可达",
    unauthorized: "认证失败",
    unknown: "尚未探测",
  }[status];
}
