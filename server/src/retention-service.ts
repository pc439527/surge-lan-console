import type { AppDatabase } from "./database.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export class RetentionService {
  private lastRunAt = 0;

  constructor(
    private readonly database: AppDatabase,
    private readonly now: () => number = () => Date.now(),
  ) {}

  runIfDue(): boolean {
    const now = this.now();
    if (this.lastRunAt !== 0 && now - this.lastRunAt < HOUR_MS) return false;
    this.lastRunAt = now;
    this.runNow(now);
    return true;
  }

  runNow(now = this.now()): void {
    const isoBefore = (ageMs: number) => new Date(now - ageMs).toISOString();

    this.database.transaction(() => {
      // High-frequency traffic samples are intentionally short-lived. Phase 15
      // aggregation will retain long-term 5m/1h summaries instead of raw payloads.
      this.database.execute(
        "DELETE FROM collector_samples WHERE kind = 'metrics' AND sampled_at < ?",
        isoBefore(2 * DAY_MS),
      );

      // Lower-frequency health/event samples stay longer for diagnostics.
      this.database.execute(
        "DELETE FROM collector_samples WHERE kind != 'metrics' AND sampled_at < ?",
        isoBefore(7 * DAY_MS),
      );

      this.database.execute("DELETE FROM job_runs WHERE created_at < ?", isoBefore(30 * DAY_MS));
      this.database.execute("DELETE FROM notification_history WHERE created_at < ?", isoBefore(90 * DAY_MS));

      // Warning/error events are point-in-time notifications and never receive a
      // dedicated recovery event. Their cooldown state can therefore be bounded.
      this.database.execute(`
        DELETE FROM event_states
        WHERE updated_at < ?
          AND (fingerprint LIKE 'event-warning:%' OR fingerprint LIKE 'event-error:%')
      `, isoBefore(90 * DAY_MS));
    });
  }
}
