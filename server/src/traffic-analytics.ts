import type { AppDatabase } from "./database.js";
import { CoreError } from "./errors.js";

export type TrafficRange = "24h" | "7d" | "30d";

export interface TrafficSnapshot {
  uploadRate: number;
  downloadRate: number;
  totalUpload: number;
  totalDownload: number;
  startTime: number | null;
}

interface TrafficCursor {
  totalUpload: number;
  totalDownload: number;
  startTime: number | null;
}

interface RollupRow {
  bucket_seconds: number;
  bucket_start: string;
  sample_count: number;
  avg_upload_rate: number;
  avg_download_rate: number;
  max_upload_rate: number;
  max_download_rate: number;
  upload_bytes_delta: number;
  download_bytes_delta: number;
}

export interface TrafficRollupPoint {
  bucketSeconds: number;
  bucketStart: string;
  sampleCount: number;
  avgUploadRate: number;
  avgDownloadRate: number;
  maxUploadRate: number;
  maxDownloadRate: number;
  uploadBytesDelta: number;
  downloadBytesDelta: number;
}

const FIVE_MINUTES = 300;
const ONE_HOUR = 3600;
const RANGES: Record<TrafficRange, { ageMs: number; bucketSeconds: number }> = {
  "24h": { ageMs: 24 * 60 * 60 * 1000, bucketSeconds: FIVE_MINUTES },
  "7d": { ageMs: 7 * 24 * 60 * 60 * 1000, bucketSeconds: ONE_HOUR },
  "30d": { ageMs: 30 * 24 * 60 * 60 * 1000, bucketSeconds: ONE_HOUR },
};

export class TrafficAnalyticsService {
  constructor(
    private readonly database: AppDatabase,
    private readonly now: () => number = () => Date.now(),
  ) {}

  ingest(connectionId: string, body: Buffer, sampledAtMs = this.now()): TrafficSnapshot {
    const snapshot = parseTrafficSnapshot(body);
    const previous = this.loadCursor(connectionId);
    const uploadDelta = counterDelta(previous?.totalUpload, snapshot.totalUpload, previous?.startTime, snapshot.startTime);
    const downloadDelta = counterDelta(previous?.totalDownload, snapshot.totalDownload, previous?.startTime, snapshot.startTime);

    this.database.transaction(() => {
      this.upsertBucket(connectionId, FIVE_MINUTES, sampledAtMs, snapshot, uploadDelta, downloadDelta);
      this.upsertBucket(connectionId, ONE_HOUR, sampledAtMs, snapshot, uploadDelta, downloadDelta);
      this.saveCursor(connectionId, snapshot);
    });
    return snapshot;
  }

  query(connectionId: string, range: TrafficRange): TrafficRollupPoint[] {
    const config = RANGES[range];
    const since = new Date(this.now() - config.ageMs).toISOString();
    return this.database.queryAll<RollupRow>(`
      SELECT bucket_seconds, bucket_start, sample_count,
             avg_upload_rate, avg_download_rate,
             max_upload_rate, max_download_rate,
             upload_bytes_delta, download_bytes_delta
      FROM traffic_rollups
      WHERE connection_id = ? AND bucket_seconds = ? AND bucket_start >= ?
      ORDER BY bucket_start ASC
    `, connectionId, config.bucketSeconds, since).map((row) => ({
      bucketSeconds: row.bucket_seconds,
      bucketStart: row.bucket_start,
      sampleCount: row.sample_count,
      avgUploadRate: row.avg_upload_rate,
      avgDownloadRate: row.avg_download_rate,
      maxUploadRate: row.max_upload_rate,
      maxDownloadRate: row.max_download_rate,
      uploadBytesDelta: row.upload_bytes_delta,
      downloadBytesDelta: row.download_bytes_delta,
    }));
  }

  private upsertBucket(
    connectionId: string,
    bucketSeconds: number,
    sampledAtMs: number,
    snapshot: TrafficSnapshot,
    uploadDelta: number,
    downloadDelta: number,
  ): void {
    const bucketStart = bucketStartIso(sampledAtMs, bucketSeconds);
    const existing = this.database.queryOne<RollupRow>(`
      SELECT bucket_seconds, bucket_start, sample_count,
             avg_upload_rate, avg_download_rate,
             max_upload_rate, max_download_rate,
             upload_bytes_delta, download_bytes_delta
      FROM traffic_rollups
      WHERE connection_id = ? AND bucket_seconds = ? AND bucket_start = ?
    `, connectionId, bucketSeconds, bucketStart);
    const updatedAt = new Date(sampledAtMs).toISOString();

    if (!existing) {
      this.database.execute(`
        INSERT INTO traffic_rollups(
          connection_id, bucket_seconds, bucket_start, sample_count,
          avg_upload_rate, avg_download_rate, max_upload_rate, max_download_rate,
          upload_bytes_delta, download_bytes_delta, updated_at
        ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
      `, connectionId, bucketSeconds, bucketStart,
      snapshot.uploadRate, snapshot.downloadRate, snapshot.uploadRate, snapshot.downloadRate,
      uploadDelta, downloadDelta, updatedAt);
      return;
    }

    const count = existing.sample_count + 1;
    const avgUpload = ((existing.avg_upload_rate * existing.sample_count) + snapshot.uploadRate) / count;
    const avgDownload = ((existing.avg_download_rate * existing.sample_count) + snapshot.downloadRate) / count;
    this.database.execute(`
      UPDATE traffic_rollups
      SET sample_count = ?, avg_upload_rate = ?, avg_download_rate = ?,
          max_upload_rate = ?, max_download_rate = ?,
          upload_bytes_delta = ?, download_bytes_delta = ?, updated_at = ?
      WHERE connection_id = ? AND bucket_seconds = ? AND bucket_start = ?
    `, count, avgUpload, avgDownload,
    Math.max(existing.max_upload_rate, snapshot.uploadRate), Math.max(existing.max_download_rate, snapshot.downloadRate),
    existing.upload_bytes_delta + uploadDelta, existing.download_bytes_delta + downloadDelta, updatedAt,
    connectionId, bucketSeconds, bucketStart);
  }

  private loadCursor(connectionId: string): TrafficCursor | null {
    const row = this.database.queryOne<{ cursor_json: string }>(`
      SELECT cursor_json FROM collector_state
      WHERE connection_id = ? AND collector = 'traffic-rollup'
    `, connectionId);
    if (!row) return null;
    try {
      const value = JSON.parse(row.cursor_json) as Partial<TrafficCursor>;
      if (!finiteNonNegative(value.totalUpload) || !finiteNonNegative(value.totalDownload)) return null;
      return {
        totalUpload: value.totalUpload,
        totalDownload: value.totalDownload,
        startTime: typeof value.startTime === "number" && Number.isFinite(value.startTime) ? value.startTime : null,
      };
    } catch {
      return null;
    }
  }

  private saveCursor(connectionId: string, snapshot: TrafficSnapshot): void {
    const cursor: TrafficCursor = {
      totalUpload: snapshot.totalUpload,
      totalDownload: snapshot.totalDownload,
      startTime: snapshot.startTime,
    };
    this.database.execute(`
      INSERT INTO collector_state(connection_id, collector, cursor_json, updated_at)
      VALUES (?, 'traffic-rollup', ?, ?)
      ON CONFLICT(connection_id, collector) DO UPDATE SET
        cursor_json = excluded.cursor_json, updated_at = excluded.updated_at
    `, connectionId, JSON.stringify(cursor), new Date(this.now()).toISOString());
  }
}

export function parseTrafficSnapshot(body: Buffer | string): TrafficSnapshot {
  const text = Buffer.isBuffer(body) ? body.toString("utf8") : body;
  let payload: unknown;
  try { payload = JSON.parse(text) as unknown; }
  catch { throw new CoreError("traffic_parse_error", 502, "Traffic Collector 返回了无法解析的 JSON。"); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw trafficShapeError();
  const root = payload as Record<string, unknown>;
  const interfaces = root.interface;
  if (!interfaces || typeof interfaces !== "object" || Array.isArray(interfaces)) throw trafficShapeError();

  let uploadRate = 0;
  let downloadRate = 0;
  let totalUpload = 0;
  let totalDownload = 0;
  for (const raw of Object.values(interfaces as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    uploadRate += numeric(item.outCurrentSpeed);
    downloadRate += numeric(item.inCurrentSpeed);
    totalUpload += numeric(item.out);
    totalDownload += numeric(item.in);
  }

  return {
    uploadRate,
    downloadRate,
    totalUpload,
    totalDownload,
    startTime: typeof root.startTime === "number" && Number.isFinite(root.startTime) ? root.startTime : null,
  };
}

function counterDelta(
  previous: number | undefined,
  current: number,
  previousStart: number | null | undefined,
  currentStart: number | null,
): number {
  if (previous === undefined || previousStart !== currentStart || current < previous) return 0;
  return current - previous;
}

function bucketStartIso(timestampMs: number, bucketSeconds: number): string {
  const bucketMs = bucketSeconds * 1000;
  return new Date(Math.floor(timestampMs / bucketMs) * bucketMs).toISOString();
}

function numeric(value: unknown): number {
  return finiteNonNegative(value) ? value : 0;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function trafficShapeError(): CoreError {
  return new CoreError("traffic_parse_error", 502, "Traffic Collector 返回结构缺少 interface 数据。");
}
