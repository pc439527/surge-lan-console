import type { OutboundMode, TrafficSummary } from "@/api/types";

export type FleetDeviceStatus = "online" | "offline" | "missing-key";

export interface FleetDeviceSnapshot {
  status: FleetDeviceStatus;
  /** Lightweight /v1/outbound round-trip latency from testConnection(). */
  apiLatencyMs: number | null;
  /** Total time to assemble outbound + traffic + active request snapshot. */
  snapshotDurationMs: number | null;
  outboundMode: OutboundMode | null;
  traffic: TrafficSummary | null;
  activeRequests: number;
  checkedAt: number;
  errorMessage?: string;
}

export function fleetTotals(items: FleetDeviceSnapshot[]) {
  return items.reduce(
    (totals, item) => {
      if (item.status === "online") totals.online += 1;
      if (item.status === "offline") totals.offline += 1;
      if (item.status === "missing-key") totals.missingKey += 1;
      totals.uploadRate += item.traffic?.uploadRate ?? 0;
      totals.downloadRate += item.traffic?.downloadRate ?? 0;
      totals.activeRequests += item.activeRequests;
      return totals;
    },
    { online: 0, offline: 0, missingKey: 0, uploadRate: 0, downloadRate: 0, activeRequests: 0 },
  );
}
