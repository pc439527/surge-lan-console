import assert from "node:assert/strict";
import { test } from "node:test";
import { AppDatabase } from "../dist/database.js";
import { ErrorAnalyticsService } from "../dist/error-analytics.js";

const NOW = Date.UTC(2026, 7, 25, 12, 30, 0);

function setupDatabase() {
  const database = new AppDatabase(":memory:");
  const now = new Date(NOW).toISOString();
  database.execute(`
    INSERT INTO connections(id, name, protocol, host, port, platform, secret_id, created_at, updated_at)
    VALUES ('c1', 'Test', 'http', '192.168.50.10', 6171, 'tvos', NULL, ?, ?)
  `, now, now);
  database.execute(`
    INSERT INTO scheduled_jobs(id, type, connection_id, enabled, interval_seconds, config_json, next_run_at, last_run_at, created_at, updated_at)
    VALUES ('job-1', 'dns-health', 'c1', 1, 600, '{}', ?, NULL, ?, ?)
  `, now, now, now);
  return database;
}

function eventSample(database, id, ageMs, events) {
  database.execute(`
    INSERT INTO collector_samples(id, connection_id, kind, value_json, sampled_at)
    VALUES (?, 'c1', 'events', ?, ?)
  `, id, JSON.stringify({ events }), new Date(NOW - ageMs).toISOString());
}

test("error analytics aggregates Surge severity and connection job failures", () => {
  const database = setupDatabase();
  try {
    eventSample(database, "events-1", 30 * 60 * 1000, [
      { type: 1, content: "warning" },
      { type: 2, content: "error" },
      { type: 0, content: "info" },
    ]);
    eventSample(database, "events-2", 90 * 60 * 1000, [
      { type: "3", content: "fatal" },
    ]);
    database.execute(`
      INSERT INTO job_runs(id, job_id, status, started_at, finished_at, duration_ms, message, created_at)
      VALUES ('run-1', 'job-1', 'error', ?, ?, 100, 'failed', ?)
    `,
      new Date(NOW - 35 * 60 * 1000).toISOString(),
      new Date(NOW - 34 * 60 * 1000).toISOString(),
      new Date(NOW - 34 * 60 * 1000).toISOString(),
    );
    database.execute(`
      INSERT INTO notification_history(id, channel_id, event_type, fingerprint, title, body, status, error_message, created_at)
      VALUES ('notify-1', NULL, 'event-error', 'f1', 't', 'b', 'error', 'offline', ?)
    `, new Date(NOW - 10 * 60 * 1000).toISOString());

    const analytics = new ErrorAnalyticsService(database, () => NOW);
    const result = analytics.query("c1", "24h");
    const active = result.points.filter((point) => point.total > 0);

    assert.equal(active.length, 2);
    assert.equal(active.reduce((sum, point) => sum + point.surgeWarnings, 0), 1);
    assert.equal(active.reduce((sum, point) => sum + point.surgeErrors, 0), 2);
    assert.equal(active.reduce((sum, point) => sum + point.jobFailures, 0), 1);
    assert.equal(active.reduce((sum, point) => sum + point.total, 0), 4);
    assert.equal(result.notificationFailuresGlobal, 1);
  } finally {
    database.close();
  }
});

test("error analytics fills empty time buckets for stable charts", () => {
  const database = setupDatabase();
  try {
    const analytics = new ErrorAnalyticsService(database, () => NOW);
    const day = analytics.query("c1", "24h");
    const week = analytics.query("c1", "7d");

    assert.ok(day.points.length >= 24 && day.points.length <= 26);
    assert.ok(week.points.length >= 28 && week.points.length <= 30);
    assert.equal(day.points.every((point) => point.total === 0), true);
  } finally {
    database.close();
  }
});
