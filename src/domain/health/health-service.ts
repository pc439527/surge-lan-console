import type { CapabilityReport, CapabilityStatus } from "@/api/capability";
import { toFriendlyMessage } from "@/api/errors";
import type { SurgeClient } from "@/api/surge-client";

export type HealthStatus = "healthy" | "degraded" | "unavailable" | "unsupported" | "unknown";
export interface HealthCheck { id: string; label: string; status: HealthStatus; latencyMs: number | null; detail: string; checkedAt: number; }
export interface HealthSummary { status: HealthStatus; healthy: number; total: number; checkedAt: number; checks: HealthCheck[]; }

export function healthStatusFromCapability(status: CapabilityStatus): HealthStatus {
  if (status === "supported") return "healthy";
  if (status === "unsupported") return "unsupported";
  if (status === "unauthorized" || status === "unreachable") return "unavailable";
  if (status === "parse-error") return "degraded";
  return "unknown";
}

export function summarizeHealth(checks: HealthCheck[], checkedAt = Date.now()): HealthSummary {
  const healthy = checks.filter((check) => check.status === "healthy").length;
  const status = checks.length === 0 ? "unknown" : checks.some((check) => check.status === "unavailable") ? "unavailable" : checks.some((check) => check.status === "degraded" || check.status === "unsupported") ? "degraded" : healthy === checks.length ? "healthy" : "unknown";
  return { status, healthy, total: checks.length, checkedAt, checks };
}

export function healthFromCapability(report: CapabilityReport): HealthSummary {
  const checks = Object.entries(report.features).map(([id, status]) => ({
    id, label: id.toUpperCase(), status: healthStatusFromCapability(status), latencyMs: report.probes[`/v1/${id === "requests" ? "requests/recent" : id === "policies" ? "policy_groups" : id}`]?.latencyMs ?? null, detail: capabilityDetail(status), checkedAt: report.probedAt,
  }));
  checks.unshift({ id: "api", label: "API", status: report.latencyMs === null ? "unavailable" : "healthy", latencyMs: report.latencyMs, detail: report.latencyMs === null ? "无法连接到 Surge API" : "API 连接正常", checkedAt: report.probedAt });
  return summarizeHealth(checks, report.probedAt);
}

export async function getHealthReport(client: SurgeClient, signal?: AbortSignal): Promise<HealthSummary> {
  const checkedAt = Date.now();
  const result = await client.testConnection(signal);
  const api: HealthCheck = { id: "api", label: "API", status: result.authenticated ? "healthy" : result.reachable ? "degraded" : "unavailable", latencyMs: result.latencyMs, detail: result.authenticated ? "API 连接正常" : toFriendlyMessage(result.error), checkedAt };
  return summarizeHealth([api], checkedAt);
}

function capabilityDetail(status: CapabilityStatus): string {
  return { supported: "能力可用", unsupported: "当前平台未开放此 API", "parse-error": "响应无法解析", unreachable: "端点暂时不可达", unauthorized: "认证失败", unknown: "尚未探测" }[status];
}
