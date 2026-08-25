import type { AppDatabase } from "./database.js";
import type { TrafficRange } from "./traffic-analytics.js";
import type { PolicyTrafficCounter } from "./policy-traffic.js";

const HOUR_MS = 60 * 60 * 1000;
const RANGE_MS: Record<TrafficRange, number> = {
  "24h": 24 * HOUR_MS,
  "7d": 7 * 24 * HOUR_MS,
  "30d": 30 * 24 * HOUR_MS,
};

interface SampleRow {
  value_json: string;
  sampled_at: string;
}

interface StoredSample {
  policies: PolicyTrafficCounter[];
}

export interface PolicyTrafficStat {
  name: string;
  downloadBytes: number;
  uploadBytes: number;
  totalBytes: number;
  sampleCount: number;
  lastSeenAt: string;
}

export class PolicyTrafficAnalyticsService {
  constructor(
    private readonly database: AppDatabase,
    private readonly now: () => number = () => Date.now(),
  ) {}

  query(connectionId: string, range: TrafficRange): PolicyTrafficStat[] {
    const since = new Date(this.now() - RANGE_MS[range]).toISOString();
    const baseline = this.database.queryOne<SampleRow>(`
      SELECT value_json, sampled_at
      FROM collector_samples
      WHERE connection_id = ? AND kind = 'policy-traffic' AND sampled_at < ?
      ORDER BY sampled_at DESC LIMIT 1
    `, connectionId, since);
    const rows = this.database.queryAll<SampleRow>(`
      SELECT value_json, sampled_at
      FROM collector_samples
      WHERE connection_id = ? AND kind = 'policy-traffic' AND sampled_at >= ?
      ORDER BY sampled_at ASC
      LIMIT 10000
    `, connectionId, since);

    const ordered = baseline ? [baseline, ...rows] : rows;
    const totals = new Map<string, PolicyTrafficStat>();
    let previous = new Map<string, PolicyTrafficCounter>();

    for (let index = 0; index < ordered.length; index += 1) {
      const row = ordered[index];
      if (!row) continue;
      const sample = parseStoredSample(row.value_json);
      if (!sample) continue;
      const current = new Map(sample.policies.map((policy) => [policy.name, policy]));
      const contributes = baseline ? index > 0 : index > 0;

      if (contributes) {
        for (const policy of sample.policies) {
          const before = previous.get(policy.name);
          if (!before) continue;
          const download = counterDelta(before.downloadBytes, policy.downloadBytes);
          const upload = counterDelta(before.uploadBytes, policy.uploadBytes);
          const existing = totals.get(policy.name) ?? {
            name: policy.name,
            downloadBytes: 0,
            uploadBytes: 0,
            totalBytes: 0,
            sampleCount: 0,
            lastSeenAt: row.sampled_at,
          };
          existing.downloadBytes += download;
          existing.uploadBytes += upload;
          existing.totalBytes = existing.downloadBytes + existing.uploadBytes;
          existing.sampleCount += 1;
          existing.lastSeenAt = row.sampled_at;
          totals.set(policy.name, existing);
        }
      }
      previous = current;
    }

    return [...totals.values()].sort((a, b) => b.totalBytes - a.totalBytes || a.name.localeCompare(b.name));
  }
}

function counterDelta(previous: number, current: number): number {
  if (current >= previous) return current - previous;
  return current;
}

function parseStoredSample(valueJson: string): StoredSample | null {
  try {
    const raw = JSON.parse(valueJson) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const policies = (raw as { policies?: unknown }).policies;
    if (!Array.isArray(policies)) return null;
    const valid: PolicyTrafficCounter[] = [];
    for (const item of policies) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const row = item as Record<string, unknown>;
      if (typeof row.name !== "string" || !row.name.trim()) continue;
      if (typeof row.downloadBytes !== "number" || !Number.isFinite(row.downloadBytes) || row.downloadBytes < 0) continue;
      if (typeof row.uploadBytes !== "number" || !Number.isFinite(row.uploadBytes) || row.uploadBytes < 0) continue;
      valid.push({ name: row.name, downloadBytes: row.downloadBytes, uploadBytes: row.uploadBytes });
    }
    return { policies: valid };
  } catch {
    return null;
  }
}
