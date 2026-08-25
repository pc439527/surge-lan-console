import type { PolicyTestEntry } from "@/api/types";
import { policyLatencyMs } from "@/lib/request";

export interface NodeQuality {
  id: string;
  name: string;
  groups: string[];
  latencyMs: number | null;
  reachable: boolean;
  score: number | null;
  typeDescription: string;
  lineHash: string | null;
}

interface NodeIdentityOptions {
  lineHash?: string;
  typeDescription?: string;
}

function normalizeIdentityPart(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function nodeIdentity(name: string, options: NodeIdentityOptions): string {
  const lineHash = options.lineHash?.trim();
  if (lineHash) return `line:${lineHash}`;

  // Older Surge builds may omit lineHash. In that case the stable fallback is
  // node name + transport type, intentionally excluding the policy-group name
  // so the same real node does not appear once per group.
  return `fallback:${normalizeIdentityPart(name)}:${normalizeIdentityPart(options.typeDescription ?? "")}`;
}

function scoreForLatency(latencyMs: number | null): number | null {
  return latencyMs === null ? null : Math.max(0, Math.round(100 - latencyMs / 5));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  const left = sorted[middle - 1];
  const right = sorted[middle];
  return left === undefined || right === undefined ? null : (left + right) / 2;
}

export function nodeQuality(
  name: string,
  group: string,
  entry?: PolicyTestEntry,
  options: NodeIdentityOptions = {},
): NodeQuality {
  const latencyMs = entry ? policyLatencyMs(entry) : null;
  const reachable = entry?.ok === true;
  return {
    id: nodeIdentity(name, options),
    name,
    groups: [group],
    latencyMs,
    reachable,
    score: scoreForLatency(latencyMs),
    typeDescription: options.typeDescription ?? "",
    lineHash: options.lineHash?.trim() || null,
  };
}

/**
 * Collapse policy-group memberships into unique real nodes.
 *
 * lineHash is the primary identity because Surge keeps it stable across groups.
 * For older builds without lineHash we fall back to normalized name + type.
 * When the same node was tested through multiple groups, use the median measured
 * latency to avoid one outlier group test distorting the node ranking.
 */
export function dedupeNodeQualities(rows: NodeQuality[]): NodeQuality[] {
  const buckets = new Map<string, NodeQuality[]>();
  for (const row of rows) {
    const bucket = buckets.get(row.id);
    if (bucket) bucket.push(row);
    else buckets.set(row.id, [row]);
  }

  return [...buckets.values()].map((bucket) => {
    const first = bucket[0]!;
    const latencyMs = median(
      bucket
        .map((row) => row.latencyMs)
        .filter((value): value is number => value !== null && Number.isFinite(value)),
    );
    const groups = [...new Set(bucket.flatMap((row) => row.groups))].sort((a, b) => a.localeCompare(b));

    return {
      ...first,
      groups,
      latencyMs,
      reachable: bucket.some((row) => row.reachable),
      score: scoreForLatency(latencyMs),
    };
  });
}

export function rankNodes(rows: NodeQuality[]): NodeQuality[] {
  return [...rows].sort((a, b) => (a.latencyMs ?? Number.POSITIVE_INFINITY) - (b.latencyMs ?? Number.POSITIVE_INFINITY));
}
