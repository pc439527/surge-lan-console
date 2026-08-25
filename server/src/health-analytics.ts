import type { AppDatabase } from "./database.js";
import { CoreError } from "./errors.js";
import { parsePolicyNodeHealth } from "./policy-health.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGE_MS = { "24h": DAY_MS, "7d": 7 * DAY_MS } as const;

export type HealthRange = keyof typeof RANGE_MS;

interface SampleRow {
  value_json: string;
  sampled_at: string;
}

export interface DnsTrendPoint {
  sampledAt: string;
  domain: string;
  delayMs: number;
  apiLatencyMs: number | null;
}

export interface PolicyHealthStat {
  key: string;
  name: string;
  groups: string[];
  sampleCount: number;
  reachableCount: number;
  availabilityPercent: number;
  p50Ms: number | null;
  p95Ms: number | null;
  lastLatencyMs: number | null;
  lastReachable: boolean;
  lastSampledAt: string;
}

export class HealthAnalyticsService {
  constructor(
    private readonly database: AppDatabase,
    private readonly now: () => number = () => Date.now(),
  ) {}

  queryDns(connectionId: string, range: HealthRange): DnsTrendPoint[] {
    const rows = this.samples(connectionId, "dns-health", range);
    const points: DnsTrendPoint[] = [];
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.value_json) as Record<string, unknown>;
        const delayMs = finiteNonNegative(parsed.delayMs);
        if (delayMs === null) continue;
        points.push({
          sampledAt: row.sampled_at,
          domain: typeof parsed.domain === "string" && parsed.domain.trim() ? parsed.domain : "unknown",
          delayMs,
          apiLatencyMs: finiteNonNegative(parsed.apiLatencyMs),
        });
      } catch {
        // Ignore malformed legacy collector rows; analytics should degrade gracefully.
      }
    }
    return points;
  }

  queryPolicy(connectionId: string, range: HealthRange): PolicyHealthStat[] {
    const rows = this.samples(connectionId, "node-quality", range);
    const buckets = new Map<string, {
      name: string;
      groups: Set<string>;
      sampleCount: number;
      reachableCount: number;
      latencies: number[];
      lastLatencyMs: number | null;
      lastReachable: boolean;
      lastSampledAt: string;
    }>();

    for (const row of rows) {
      let nodes;
      try { nodes = parsePolicyNodeHealth(row.value_json); }
      catch { continue; }
      for (const node of nodes) {
        const bucket = buckets.get(node.key) ?? {
          name: node.name,
          groups: new Set<string>(),
          sampleCount: 0,
          reachableCount: 0,
          latencies: [],
          lastLatencyMs: null,
          lastReachable: false,
          lastSampledAt: row.sampled_at,
        };
        bucket.name = node.name;
        node.groups.forEach((group) => bucket.groups.add(group));
        bucket.sampleCount += 1;
        if (node.reachable) bucket.reachableCount += 1;
        if (node.latencyMs !== null) bucket.latencies.push(node.latencyMs);
        bucket.lastLatencyMs = node.latencyMs;
        bucket.lastReachable = node.reachable;
        bucket.lastSampledAt = row.sampled_at;
        buckets.set(node.key, bucket);
      }
    }

    return [...buckets.entries()].map(([key, bucket]) => ({
      key,
      name: bucket.name,
      groups: [...bucket.groups].sort((a, b) => a.localeCompare(b)),
      sampleCount: bucket.sampleCount,
      reachableCount: bucket.reachableCount,
      availabilityPercent: round1(bucket.sampleCount === 0 ? 0 : bucket.reachableCount / bucket.sampleCount * 100),
      p50Ms: percentile(bucket.latencies, 0.5),
      p95Ms: percentile(bucket.latencies, 0.95),
      lastLatencyMs: bucket.lastLatencyMs,
      lastReachable: bucket.lastReachable,
      lastSampledAt: bucket.lastSampledAt,
    })).sort((a, b) =>
      a.availabilityPercent - b.availabilityPercent ||
      (b.p95Ms ?? -1) - (a.p95Ms ?? -1) ||
      a.name.localeCompare(b.name),
    );
  }

  private samples(connectionId: string, kind: string, range: HealthRange): SampleRow[] {
    const duration = RANGE_MS[range];
    if (!duration) throw new CoreError("invalid_health_range", 400, "Health Analytics range 仅支持 24h 或 7d。");
    const since = new Date(this.now() - duration).toISOString();
    return this.database.queryAll<SampleRow>(`
      SELECT value_json, sampled_at
      FROM collector_samples
      WHERE connection_id = ? AND kind = ? AND sampled_at >= ?
      ORDER BY sampled_at ASC
    `, connectionId, kind, since);
  }
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(percentileValue * sorted.length) - 1));
  const value = sorted[index];
  return value === undefined ? null : round1(value);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
