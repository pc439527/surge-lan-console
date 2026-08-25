import assert from "node:assert/strict";
import { test } from "node:test";
import { AppDatabase } from "../dist/database.js";
import { HealthAnalyticsService } from "../dist/health-analytics.js";

const NOW = Date.UTC(2026, 7, 25, 12, 0, 0);

function databaseWithConnection() {
  const database = new AppDatabase(":memory:");
  const now = new Date(NOW).toISOString();
  database.execute(`
    INSERT INTO connections(id, name, protocol, host, port, platform, secret_id, created_at, updated_at)
    VALUES ('c1', 'Test', 'http', '192.168.50.10', 6171, 'tvos', NULL, ?, ?)
  `, now, now);
  return database;
}

function sample(database, id, kind, value, ageMs) {
  database.execute(`
    INSERT INTO collector_samples(id, connection_id, kind, value_json, sampled_at)
    VALUES (?, 'c1', ?, ?, ?)
  `, id, kind, JSON.stringify(value), new Date(NOW - ageMs).toISOString());
}

test("DNS analytics returns valid recent delay samples and skips malformed history", () => {
  const database = databaseWithConnection();
  try {
    sample(database, "dns-1", "dns-health", { domain: "example.com", delayMs: 40, apiLatencyMs: 12 }, 20 * 60 * 60 * 1000);
    sample(database, "dns-2", "dns-health", { domain: "example.com", delayMs: 65, apiLatencyMs: 15 }, 2 * 60 * 60 * 1000);
    sample(database, "dns-old", "dns-health", { domain: "old.test", delayMs: 999, apiLatencyMs: 20 }, 8 * 24 * 60 * 60 * 1000);
    database.execute(`
      INSERT INTO collector_samples(id, connection_id, kind, value_json, sampled_at)
      VALUES ('dns-bad', 'c1', 'dns-health', 'not-json', ?)
    `, new Date(NOW - 60_000).toISOString());

    const analytics = new HealthAnalyticsService(database, () => NOW);
    assert.deepEqual(analytics.queryDns("c1", "24h").map((point) => point.delayMs), [40, 65]);
    assert.equal(analytics.queryDns("c1", "7d").length, 2);
  } finally {
    database.close();
  }
});

test("policy analytics calculates node P50, P95 and availability without group duplication", () => {
  const database = databaseWithConnection();
  try {
    sample(database, "node-1", "node-quality", {
      Proxy: {
        "HK-01": { ok: true, latency: 40 },
        "JP-01": { ok: false, latency: "Timeout" },
      },
      Streaming: {
        "HK-01": { ok: true, latency: 50 },
      },
    }, 6 * 60 * 60 * 1000);
    sample(database, "node-2", "node-quality", {
      Proxy: {
        "HK-01": { ok: true, latency: 60 },
        "JP-01": { ok: true, latency: 100 },
      },
      Streaming: {
        "HK-01": { ok: true, latency: 70 },
      },
    }, 60 * 60 * 1000);

    const analytics = new HealthAnalyticsService(database, () => NOW);
    const rows = analytics.queryPolicy("c1", "24h");
    const hk = rows.find((row) => row.name === "HK-01");
    const jp = rows.find((row) => row.name === "JP-01");

    assert.deepEqual(hk?.groups, ["Proxy", "Streaming"]);
    assert.equal(hk?.sampleCount, 2);
    assert.equal(hk?.reachableCount, 2);
    assert.equal(hk?.availabilityPercent, 100);
    assert.equal(hk?.p50Ms, 45);
    assert.equal(hk?.p95Ms, 65);
    assert.equal(hk?.lastLatencyMs, 65);

    assert.equal(jp?.sampleCount, 2);
    assert.equal(jp?.reachableCount, 1);
    assert.equal(jp?.availabilityPercent, 50);
    assert.equal(jp?.p50Ms, 100);
    assert.equal(jp?.p95Ms, 100);
    assert.equal(jp?.lastReachable, true);
  } finally {
    database.close();
  }
});

test("health analytics rejects unsupported ranges", () => {
  const database = databaseWithConnection();
  try {
    const analytics = new HealthAnalyticsService(database, () => NOW);
    assert.throws(
      () => analytics.queryDns("c1", "30d"),
      (error) => error?.code === "invalid_health_range",
    );
  } finally {
    database.close();
  }
});
