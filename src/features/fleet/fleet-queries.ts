import { useQueries } from "@tanstack/react-query";
import { toFriendlyMessage } from "@/api/errors";
import { buildClientFor, type SurgeConnection } from "@/stores/connection-store";
import type { FleetDeviceSnapshot } from "./fleet-model";

async function loadSnapshot(connection: SurgeConnection): Promise<FleetDeviceSnapshot> {
  const built = buildClientFor(connection);
  if (!built) return { status: "missing-key", latencyMs: null, outboundMode: null, traffic: null, activeRequests: 0, checkedAt: Date.now() };
  const started = performance.now();
  try {
    const [outboundMode, traffic, active] = await Promise.all([
      built.client.getOutboundMode(),
      built.client.getTrafficSummary(),
      built.client.getActiveRequests(),
    ]);
    return { status: "online", latencyMs: Math.round(performance.now() - started), outboundMode, traffic, activeRequests: active.length, checkedAt: Date.now() };
  } catch (error) {
    return { status: "offline", latencyMs: Math.round(performance.now() - started), outboundMode: null, traffic: null, activeRequests: 0, checkedAt: Date.now(), errorMessage: toFriendlyMessage(error) };
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
