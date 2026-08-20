import type { PolicyTestEntry } from "@/api/types";
import { policyLatencyMs } from "@/lib/request";

export interface FastestPolicy {
  name: string;
  latencyMs: number;
}

/** Pick the lowest reachable latency from policies that belong to this group. */
export function findFastestPolicy(
  policies: string[],
  results: Record<string, PolicyTestEntry> | undefined,
): FastestPolicy | null {
  if (!results) return null;

  let fastest: FastestPolicy | null = null;
  for (const name of policies) {
    const latencyMs = policyLatencyMs(results[name]);
    if (latencyMs === null) continue;
    if (!fastest || latencyMs < fastest.latencyMs) fastest = { name, latencyMs };
  }
  return fastest;
}
