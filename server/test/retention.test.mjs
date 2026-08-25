import assert from "node:assert/strict";
import { test } from "node:test";
import { AppDatabase } from "../dist/database.js";
import { RetentionService } from "../dist/retention-service.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function iso(now, ageMs) {
  return new Date(now - ageMs).toISOString();
}

test("retention removes expired raw samples and history", () => {
  const now = Date.parse("2026-08-25T12:00:00Z");
  const db = new AppDatabase(":memory:");
  try {
    const createdAt = new Date(now).toISOString();
    db.execute(`
      INSERT INTO connections(id, name, protocol, host, port, platform, secret_id, created_at, updated_at)
      VALUES ('conn-1', 'Test', 'http', '192.168.50.2', 6171, 'tvos', NULL, ?, ?)
    `, createdAt, createdAt);
    db.execute(`
      INSERT INTO scheduled_jobs(id, type, connection_id, enabled, interval_seconds, config_json, next_run_at, last_run_at, created_at, updated_at)
      VALUES ('job-1', 'metrics', 'conn-1', 1, 60, '{}', ?, NULL, ?, ?)
    `, createdAt, createdAt, createdAt);

    db.execute("INSERT INTO collector_samples(id, connection_id, kind, value_json, sampled_at) VALUES ('metrics-old', 'conn-1', 'metrics', '{}', ?)", iso(now, 3 * DAY_MS));
    db.execute("INSERT INTO collector_samples(id, connection_id, kind, value_json, sampled_at) VALUES ('metrics-new', 'conn-1', 'metrics', '{}', ?)", iso(now, DAY_MS));
    db.execute("INSERT INTO collector_samples(id, connection_id, kind, value_json, sampled_at) VALUES ('dns-old', 'conn-1', 'dns', '{}', ?)", iso(now, 8 * DAY_MS));
    db.execute("INSERT INTO collector_samples(id, connection_id, kind, value_json, sampled_at) VALUES ('dns-new', 'conn-1', 'dns', '{}', ?)", iso(now, 6 * DAY_MS));

    db.execute(`
      INSERT INTO job_runs(id, job_id, status, started_at, finished_at, duration_ms, message, created_at)
      VALUES ('run-old', 'job-1', 'success', ?, ?, 1, NULL, ?)
    `, iso(now, 31 * DAY_MS), iso(now, 31 * DAY_MS), iso(now, 31 * DAY_MS));
    db.execute(`
      INSERT INTO job_runs(id, job_id, status, started_at, finished_at, duration_ms, message, created_at)
      VALUES ('run-new', 'job-1', 'success', ?, ?, 1, NULL, ?)
    `, iso(now, 29 * DAY_MS), iso(now, 29 * DAY_MS), iso(now, 29 * DAY_MS));

    db.execute(`
      INSERT INTO notification_history(id, channel_id, event_type, fingerprint, title, body, status, error_message, created_at)
      VALUES ('history-old', NULL, 'test', 'old', 'old', 'old', 'sent', NULL, ?)
    `, iso(now, 91 * DAY_MS));
    db.execute(`
      INSERT INTO notification_history(id, channel_id, event_type, fingerprint, title, body, status, error_message, created_at)
      VALUES ('history-new', NULL, 'test', 'new', 'new', 'new', 'sent', NULL, ?)
    `, iso(now, 89 * DAY_MS));

    new RetentionService(db, () => now).runNow();

    const samples = db.queryAll("SELECT id FROM collector_samples ORDER BY id").map((row) => row.id);
    const runs = db.queryAll("SELECT id FROM job_runs ORDER BY id").map((row) => row.id);
    const history = db.queryAll("SELECT id FROM notification_history ORDER BY id").map((row) => row.id);

    assert.deepEqual(samples, ["dns-new", "metrics-new"]);
    assert.deepEqual(runs, ["run-new"]);
    assert.deepEqual(history, ["history-new"]);
  } finally {
    db.close();
  }
});
