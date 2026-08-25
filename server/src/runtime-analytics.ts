import type { AppDatabase } from "./database.js";
import type { HealthRange } from "./health-analytics.js";

const HOUR_MS = 60 * 60 * 1000;
const RANGE_MS: Record<HealthRange, number> = { "24h": 24 * HOUR_MS, "7d": 7 * 24 * HOUR_MS };

interface SampleRow {
  value_json: string;
  sampled_at: string;
}

export interface RuntimeTrendPoint {
  sampledAt: string;
  source: "metrics" | "traffic";
  uptimeSeconds: number | null;
  memoryBytes: number | null;
  activeRequests: number | null;
  dnsCacheEntries: number | null;
  activeBans: number | null;
}

export class RuntimeAnalyticsService {
  constructor(
    private readonly database: AppDatabase,
    private readonly now: () => number = () => Date.now(),
  ) {}

  query(connectionId: string, range: HealthRange): RuntimeTrendPoint[] {
    const since = new Date(this.now() - RANGE_MS[range]).toISOString();
    const rows = this.database.queryAll<SampleRow>(`
      SELECT value_json, sampled_at
      FROM collector_samples
      WHERE connection_id = ? AND kind = 'runtime-metrics' AND sampled_at >= ?
      ORDER BY sampled_at ASC
      LIMIT 2500
    `, connectionId, since);

    return rows.flatMap((row) => {
      const parsed = parseSample(row.value_json, row.sampled_at);
      return parsed ? [parsed] : [];
    });
  }
}

function parseSample(valueJson: string, sampledAt: string): RuntimeTrendPoint | null {
  try {
    const raw = JSON.parse(valueJson) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const row = raw as Record<string, unknown>;
    const source = row.source === "metrics" ? "metrics" : "traffic";
    const point: RuntimeTrendPoint = {
      sampledAt,
      source,
      uptimeSeconds: finiteNonNegative(row.uptimeSeconds),
      memoryBytes: finiteNonNegative(row.memoryBytes),
      activeRequests: finiteNonNegative(row.activeRequests),
      dnsCacheEntries: finiteNonNegative(row.dnsCacheEntries),
      activeBans: finiteNonNegative(row.activeBans),
    };
    return point.uptimeSeconds === null && point.memoryBytes === null ? null : point;
  } catch {
    return null;
  }
}

function finiteNonNegative(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
}
