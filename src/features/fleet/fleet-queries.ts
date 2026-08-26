import { useQueries } from "@tanstack/react-query";
import { toFriendlyMessage } from "@/api/errors";
import { buildClientFor, type SurgeConnection } from "@/stores/connection-store";
import type { FleetDeviceSnapshot } from "./fleet-model";

async function loadSnapshot(connection: SurgeConnection): Promise<FleetDeviceSnapshot> {
  const built = buildClientFor(connection);
  if (!built) {
    return {
      status: "missing-key",
      apiLatencyMs: null,
      snapshotDurationMs: null,
      outboundMode: null,
      traffic: null,
      activeRequests: 0,
      checkedAt: Date.now(),
    };
  }

  const probePromise = built.client.testConnection();
  const snapshotStarted = performance.now();

  try {
    const [outboundMode, traffic, active] = await Promise.all([
      built.client.getOutboundMode(),
      built.client.getTrafficSummary(),
      built.client.getActiveRequests(),
    ]);
    const probe = await probePromise;
    return {
      status: "online",
      apiLatencyMs: probe.latencyMs,
      snapshotDurationMs: Math.round(performance.now() - snapshotStarted),
      outboundMode,
      traffic,
      activeRequests: active.length,
      checkedAt: Date.now(),
    };
  } catch (error) {
    const probe = await probePromise;
    return {
      status: "offline",
      apiLatencyMs: probe.latencyMs,
      snapshotDurationMs: Math.round(performance.now() - snapshotStarted),
      outboundMode: null,
      traffic: null,
      activeRequests: 0,
      checkedAt: Date.now(),
      errorMessage: toFriendlyMessage(error),
    };
  }
}

export function useFleetQueries(connections: SurgeConnection[]) {
  return useQueries({
    queries: connections.map((connection) => ({
      queryKey: ["fleet", connection.id, "snapshot"],
      queryFn: () => loadSnapshot(connection),
      staleTime: 10_000,
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
    })),
  });
}
