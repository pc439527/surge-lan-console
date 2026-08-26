import type { CapabilityReport, CapabilityStatus } from "@/api/capability";
import { ENDPOINTS } from "@/api/endpoints";

export type DashboardHealthTone = "success" | "warning" | "danger" | "muted";

export interface DashboardHealthItem {
  key: "api" | "traffic" | "dns" | "policies";
  label: string;
  status: CapabilityStatus;
  text: string;
  tone: DashboardHealthTone;
  latencyMs: number | null;
}

export interface DashboardHealthSummary {
  items: DashboardHealthItem[];
  label: string;
  tone: DashboardHealthTone;
  apiReady: boolean;
}

const SLOW_ENDPOINT_MS = 1_000;

function statusMeta(status: CapabilityStatus, latencyMs: number | null) {
  if (status === "supported") {
    if (latencyMs !== null && latencyMs >= SLOW_ENDPOINT_MS) {
      return { text: `较慢 ${Math.round(latencyMs)}ms`, tone: "warning" as const };
    }
    return { text: "正常", tone: "success" as const };
  }
  if (status === "unsupported") return { text: "N/A", tone: "muted" as const };
  if (status === "unauthorized") return { text: "未授权", tone: "danger" as const };
  if (status === "parse-error") return { text: "解析异常", tone: "danger" as const };
  if (status === "unreachable") return { text: "不可达", tone: "danger" as const };
  return { text: "探测中", tone: "muted" as const };
}

function item(
  key: DashboardHealthItem["key"],
  label: string,
  status: CapabilityStatus,
  latencyMs: number | null,
): DashboardHealthItem {
  return { key, label, status, latencyMs, ...statusMeta(status, latencyMs) };
}

function probeStatus(report: CapabilityReport | undefined, endpoint: string): CapabilityStatus {
  return report?.probes[endpoint]?.status ?? "unknown";
}

function probeLatency(report: CapabilityReport | undefined, endpoint: string): number | null {
  return report?.probes[endpoint]?.latencyMs ?? null;
}

export function buildDashboardHealth(report: CapabilityReport | undefined): DashboardHealthSummary {
  const items = [
    item("api", "API", probeStatus(report, ENDPOINTS.outbound), probeLatency(report, ENDPOINTS.outbound)),
    item("traffic", "流量", report?.features.traffic ?? "unknown", probeLatency(report, ENDPOINTS.traffic)),
    item("dns", "DNS", report?.features.dns ?? "unknown", probeLatency(report, ENDPOINTS.dns)),
    item("policies", "节点", report?.features.policies ?? "unknown", probeLatency(report, ENDPOINTS.policyGroups)),
  ];

  const api = items[0]!;
  const dangerCount = items.filter((entry) => entry.tone === "danger").length;
  const warningCount = items.filter((entry) => entry.tone === "warning").length;
  const unknownCount = items.filter((entry) => entry.status === "unknown").length;

  if (api.tone === "danger") {
    return { items, label: "连接需要检查", tone: "danger", apiReady: false };
  }
  if (dangerCount > 0) {
    return { items, label: "部分服务异常", tone: "danger", apiReady: api.status === "supported" };
  }
  if (warningCount > 0) {
    return { items, label: "运行偏慢", tone: "warning", apiReady: api.status === "supported" };
  }
  if (unknownCount > 0) {
    return { items, label: "状态探测中", tone: "muted", apiReady: false };
  }
  return { items, label: "运行正常", tone: "success", apiReady: api.status === "supported" };
}
