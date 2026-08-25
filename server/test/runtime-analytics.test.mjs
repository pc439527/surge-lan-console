import assert from "node:assert/strict";
import { test } from "node:test";
import { AppDatabase } from "../dist/database.js";
import { RuntimeAnalyticsService } from "../dist/runtime-analytics.js";

const NOW = Date.UTC(2026, 7, 25, 12, 0, 0);

function insertConnection(database) {
  const now = new Date(NOW).toISOString();
  database.execute(`
    INSERT INTO connections(id, name, protocol, host, port, platform, secret_id, created_at, updated_at)
    VALUES ('c1', 'Test', 'http', '192.168.50.10', 6171, 'tvos', NULL, ?, ?)
  `, now, now);
}

function insertSample(database, id, ageHours, payload) {
  database.execute(`
    INSERT INTO collector_samples(id, connection_id, kind, value_json, sampled_at)
    VALUES (?, 'c1', 'runtime-metrics', ?, ?)
  `, id, JSON.stringify(payload), new Date(NOW - ageHours * 60 * 60 * 1000).toISOString());
}

test("runtime analytics returns persisted memory and uptime samples", () => {
  const database = new AppDatabase(":memory:");
  try {
    insertConnection(database);
    insertSample(database, "m1", 2, {
      source: "metrics",
      uptimeSeconds: 3600,
      memoryBytes: 100 * 1024 * 1024,
      activeRequests: 5,
      dnsCacheEntries: 20,
      activeBans: 0,
    });
    insertSample(database, "m2", 1, {
      source: "traffic",
      uptimeSeconds: 7200,
      memoryBytes: null,
      activeRequests: null,
      dnsCacheEntries: null,
      activeBans: null,
    });

    const points = new RuntimeAnalyticsService(database, () => NOW).query("c1", "24h");
    assert.equal(points.length, 2);
    assert.equal(points[0]?.source, "metrics");
    assert.equal(points[0]?.memoryBytes, 100 * 1024 * 1024);
    assert.equal(points[1]?.source, "traffic");
    assert.equal(points[1]?.uptimeSeconds, 7200);
  } finally {
    database.close();
  }
});

test("runtime analytics ignores malformed and expired samples", () => {
  const database = new AppDatabase(":memory:");
  try {
    insertConnection(database);
    insertSample(database, "bad", 1, { source: "metrics", uptimeSeconds: "wrong" });
    insertSample(database, "old", 8 * 24, { source: "metrics", uptimeSeconds: 10, memoryBytes: 100 });
    const points = new RuntimeAnalyticsService(database, () => NOW).query("c1", "7d");
    assert.deepEqual(points, []);
  } finally {
    database.close();
  }
});
