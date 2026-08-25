import type { AppDatabase } from "./database.js";
import type { HealthRange } from "./health-analytics.js";

const HOUR_MS = 60 * 60 * 1000;
const RANGE_MS: Record<HealthRange, number> = { "24h": 24 * HOUR_MS, "7d": 7 * 24 * HOUR_MS };
const BUCKET_MS: Record<HealthRange, number> = { "24h": HOUR_MS, "7d": 6 * HOUR_MS };

interface CollectorRow {
  value_json: string;
  sampled_at: string;
}

interface TimeRow {
  occurred_at: string;
}

export interface ErrorTrendPoint {
  bucketStart: string;
  surgeWarnings: number;
  surgeErrors: number;
  jobFailures: number;
  total: number;
}

export interface ErrorTrendResult {
  points: ErrorTrendPoint[];
  notificationFailuresGlobal: number;
}

export class ErrorAnalyticsService {
  constructor(
    private readonly database: AppDatabase,
    private readonly now: () => number = () => Date.now(),
  ) {}

  query(connectionId: string, range: HealthRange): ErrorTrendResult {
    const duration = RANGE_MS[range];
    const bucketMs = BUCKET_MS[range];
    const now = this.now();
    const since = now - duration;
    const buckets = new Map<number, ErrorTrendPoint>();

    for (let cursor = bucketStart(since, bucketMs); cursor <= bucketStart(now, bucketMs); cursor += bucketMs) {
      buckets.set(cursor, {
        bucketStart: new Date(cursor).toISOString(),
        surgeWarnings: 0,
        surgeErrors: 0,
        jobFailures: 0,
        total: 0,
      });
    }

    const surgeRows = this.database.queryAll<CollectorRow>(`
      SELECT value_json, sampled_at
      FROM collector_samples
      WHERE connection_id = ? AND kind = 'events' AND sampled_at >= ?
      ORDER BY sampled_at ASC
    `, connectionId, new Date(since).toISOString());

    for (const row of surgeRows) {
      const point = buckets.get(bucketStart(Date.parse(row.sampled_at), bucketMs));
      if (!point) continue;
      for (const type of eventTypes(row.value_json)) {
        if (type >= 2) point.surgeErrors += 1;
        else if (type === 1) point.surgeWarnings += 1;
      }
    }

    const jobRows = this.database.queryAll<TimeRow>(`
      SELECT jr.finished_at AS occurred_at
      FROM job_runs jr
      INNER JOIN scheduled_jobs sj ON sj.id = jr.job_id
      WHERE jr.status = 'error'
        AND sj.connection_id = ?
        AND jr.finished_at >= ?
      ORDER BY jr.finished_at ASC
    `, connectionId, new Date(since).toISOString());

    for (const row of jobRows) {
      const point = buckets.get(bucketStart(Date.parse(row.occurred_at), bucketMs));
      if (point) point.jobFailures += 1;
    }

    for (const point of buckets.values()) {
      point.total = point.surgeWarnings + point.surgeErrors + point.jobFailures;
    }

    const notificationFailuresGlobal = this.database.queryOne<{ count: number }>(`
      SELECT COUNT(*) AS count
      FROM notification_history
      WHERE status = 'error' AND created_at >= ?
    `, new Date(since).toISOString())?.count ?? 0;

    return { points: [...buckets.values()], notificationFailuresGlobal };
  }
}

function eventTypes(valueJson: string): number[] {
  try {
    const parsed = JSON.parse(valueJson) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    const events = (parsed as { events?: unknown }).events;
    if (!Array.isArray(events)) return [];
    return events.flatMap((event) => {
      if (!event || typeof event !== "object" || Array.isArray(event)) return [];
      const value = (event as { type?: unknown }).type;
      if (typeof value === "number" && Number.isFinite(value)) return [Math.trunc(value)];
      if (typeof value === "string" && value.trim()) {
        const parsedType = Number(value);
        if (Number.isFinite(parsedType)) return [Math.trunc(parsedType)];
      }
      return [];
    });
  } catch {
    return [];
  }
}

function bucketStart(timestamp: number, bucketMs: number): number {
  return Math.floor(timestamp / bucketMs) * bucketMs;
}
