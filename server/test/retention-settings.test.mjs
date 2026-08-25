import assert from "node:assert/strict";
import { test } from "node:test";
import { AppDatabase } from "../dist/database.js";
import { DEFAULT_RETENTION_SETTINGS, RetentionService } from "../dist/retention-service.js";

const NOW = Date.UTC(2026, 7, 25, 13, 30, 0);
const DAY = 24 * 60 * 60 * 1000;

function iso(ageDays) {
  return new Date(NOW - ageDays * DAY).toISOString();
}

function seedConnection(database) {
  const now = new Date(NOW).toISOString();
  database.execute(`
    INSERT INTO connections(id, name, protocol, host, port, platform, secret_id, created_at, updated_at)
    VALUES ('retention-c1', 'Retention Test', 'http', '192.168.50.10', 6171, 'tvos', NULL, ?, ?)
  `, now, now);
}

function sample(database, id, kind, ageDays) {
  database.execute(`
    INSERT INTO collector_samples(id, connection_id, kind, value_json, sampled_at)
    VALUES (?, 'retention-c1', ?, '{}', ?)
  `, id, kind, iso(ageDays));
}

test("retention settings default, persist, reset, and enforce safe bounds", () => {
  const database = new AppDatabase(":memory:");
  try {
    const service = new RetentionService(database, () => NOW);
    assert.deepEqual(service.getSettings(), DEFAULT_RETENTION_SETTINGS);

    const updated = service.updateSettings({ metricsRawDays: 4, notificationHistoryDays: 120 });
    assert.equal(updated.metricsRawDays, 4);
    assert.equal(updated.notificationHistoryDays, 120);
    assert.equal(new RetentionService(database, () => NOW).getSettings().metricsRawDays, 4);

    assert.throws(
      () => service.updateSettings({ metricsRawDays: 0 }),
      (error) => error?.code === "invalid_retention_setting",
    );
    assert.throws(
      () => service.updateSettings({ trafficHourlyDays: 731 }),
      (error) => error?.code === "invalid_retention_setting",
    );

    assert.deepEqual(service.resetSettings(), DEFAULT_RETENTION_SETTINGS);
    assert.deepEqual(service.getSettings(), DEFAULT_RETENTION_SETTINGS);
  } finally {
    database.close();
  }
});

test("custom retention windows drive cleanup without mixing policy traffic into generic health retention", () => {
  const database = new AppDatabase(":memory:");
  try {
    seedConnection(database);
    sample(database, "metrics-old", "metrics", 3);
    sample(database, "metrics-new", "metrics", 1);
    sample(database, "policy-old", "policy-traffic", 31);
    sample(database, "policy-new", "policy-traffic", 10);
    sample(database, "event-old", "events", 8);
    sample(database, "event-new", "events", 3);

    const service = new RetentionService(database, () => NOW);
    service.updateSettings({ metricsRawDays: 2, policyTrafficDays: 30, healthRawDays: 7 });
    service.runNow();

    const remaining = database.queryAll("SELECT id FROM collector_samples ORDER BY id").map((row) => row.id);
    assert.deepEqual(remaining, ["event-new", "metrics-new", "policy-new"]);
  } finally {
    database.close();
  }
});
