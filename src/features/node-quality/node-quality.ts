import type { PolicyTestEntry } from "@/api/types";
import { policyLatencyMs } from "@/lib/request";

export interface NodeQuality { name: string; group: string; latencyMs: number | null; reachable: boolean; score: number | null; }
export function nodeQuality(name: string, group: string, entry?: PolicyTestEntry): NodeQuality {
  const latencyMs = entry ? policyLatencyMs(entry) : null;
  const reachable = entry?.ok === true;
  const score = latencyMs === null ? null : Math.max(0, Math.round(100 - latencyMs / 5));
  return { name, group, latencyMs, reachable, score };
}
export function rankNodes(rows: NodeQuality[]): NodeQuality[] {
  return [...rows].sort((a, b) => (a.latencyMs ?? Number.POSITIVE_INFINITY) - (b.latencyMs ?? Number.POSITIVE_INFINITY));
}
