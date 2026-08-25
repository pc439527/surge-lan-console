import type { AppDatabase } from "./database.js";
import { CoreError } from "./errors.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const SETTINGS_KEY = "retention.settings.v1";

export interface RetentionSettings {
  metricsRawDays: number;
  policyTrafficDays: number;
  healthRawDays: number;
  trafficFiveMinuteDays: number;
  trafficHourlyDays: number;
  jobRunsDays: number;
  notificationHistoryDays: number;
}

export const DEFAULT_RETENTION_SETTINGS: RetentionSettings = {
  metricsRawDays: 2,
  policyTrafficDays: 30,
  healthRawDays: 7,
  trafficFiveMinuteDays: 30,
  trafficHourlyDays: 365,
  jobRunsDays: 30,
  notificationHistoryDays: 90,
};

const BOUNDS: Record<keyof RetentionSettings, { min: number; max: number }> = {
  metricsRawDays: { min: 1, max: 7 },
  policyTrafficDays: { min: 7, max: 90 },
  healthRawDays: { min: 2, max: 30 },
  trafficFiveMinuteDays: { min: 7, max: 90 },
  trafficHourlyDays: { min: 30, max: 730 },
  jobRunsDays: { min: 7, max: 180 },
  notificationHistoryDays: { min: 30, max: 365 },
};

export class RetentionService {
  private lastRunAt = 0;

  constructor(
    private readonly database: AppDatabase,
    private readonly now: () => number = () => Date.now(),
  ) {}

  getSettings(): RetentionSettings {
    const raw = this.database.getMeta(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_RETENTION_SETTINGS };
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ...DEFAULT_RETENTION_SETTINGS };
      return sanitizeSettings(parsed as Record<string, unknown>, false);
    } catch {
      return { ...DEFAULT_RETENTION_SETTINGS };
    }
  }

  updateSettings(input: Record<string, unknown>): RetentionSettings {
    const current = this.getSettings();
    const next = sanitizeSettings({ ...current, ...input }, true);
    this.database.setMeta(SETTINGS_KEY, JSON.stringify(next));
    return next;
  }

  resetSettings(): RetentionSettings {
    this.database.deleteMeta(SETTINGS_KEY);
    return { ...DEFAULT_RETENTION_SETTINGS };
  }

  runIfDue(): boolean {
    const now = this.now();
    if (this.lastRunAt !== 0 && now - this.lastRunAt < HOUR_MS) return false;
    this.lastRunAt = now;
    this.runNow(now);
    return true;
  }

  runNow(now = this.now()): void {
    const settings = this.getSettings();
    const isoBefore = (days: number) => new Date(now - days * DAY_MS).toISOString();

    this.database.transaction(() => {
      // High-frequency raw /v1/traffic payloads are intentionally short-lived.
      // Long-term total traffic analytics come from traffic_rollups.
      this.database.execute(
        "DELETE FROM collector_samples WHERE kind = 'metrics' AND sampled_at < ?",
        isoBefore(settings.metricsRawDays),
      );

      // Per-policy Prometheus counters need a wider raw window so counter deltas
      // can be reconstructed safely after process or Surge counter resets.
      this.database.execute(
        "DELETE FROM collector_samples WHERE kind = 'policy-traffic' AND sampled_at < ?",
        isoBefore(settings.policyTrafficDays),
      );

      // Lower-frequency health/event/runtime samples share one bounded diagnostic window.
      this.database.execute(
        "DELETE FROM collector_samples WHERE kind NOT IN ('metrics', 'policy-traffic') AND sampled_at < ?",
        isoBefore(settings.healthRawDays),
      );

      this.database.execute(
        "DELETE FROM traffic_rollups WHERE bucket_seconds = 300 AND bucket_start < ?",
        isoBefore(settings.trafficFiveMinuteDays),
      );
      this.database.execute(
        "DELETE FROM traffic_rollups WHERE bucket_seconds = 3600 AND bucket_start < ?",
        isoBefore(settings.trafficHourlyDays),
      );

      this.database.execute("DELETE FROM job_runs WHERE created_at < ?", isoBefore(settings.jobRunsDays));
      this.database.execute("DELETE FROM notification_history WHERE created_at < ?", isoBefore(settings.notificationHistoryDays));

      // Warning/error events are point-in-time notifications and never receive a
      // dedicated recovery event. Keep their cooldown state no longer than the
      // notification history window selected by the user.
      this.database.execute(`
        DELETE FROM event_states
        WHERE updated_at < ?
          AND (fingerprint LIKE 'event-warning:%' OR fingerprint LIKE 'event-error:%')
      `, isoBefore(settings.notificationHistoryDays));
    });
  }
}

function sanitizeSettings(input: Record<string, unknown>, strict: boolean): RetentionSettings {
  const output = { ...DEFAULT_RETENTION_SETTINGS };
  for (const key of Object.keys(DEFAULT_RETENTION_SETTINGS) as Array<keyof RetentionSettings>) {
    const value = input[key];
    if (value === undefined) continue;
    const bounds = BOUNDS[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < bounds.min || value > bounds.max) {
      if (strict) {
        throw new CoreError(
          "invalid_retention_setting",
          400,
          `${key} 必须是 ${bounds.min}–${bounds.max} 天之间的整数。`,
        );
      }
      continue;
    }
    output[key] = value;
  }
  return output;
}
