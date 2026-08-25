import assert from "node:assert/strict";
import { test } from "node:test";
import { AppDatabase } from "../dist/database.js";
import { PolicyTrafficAnalyticsService } from "../dist/policy-traffic-analytics.js";

const NOW = Date.UTC(2026, 7, 25, 12, 0, 0);

function setup() {
  const db = new AppDatabase(":memory:");
  const now = new Date(NOW).toISOString();
  db.execute(`
    INSERT INTO connections(id, name, protocol, host, port, platform, secret_id, created_at, updated_at)
    VALUES ('c1', 'Test', 'http', '192.168.50.10', 6171, 'tvos', NULL, ?, ?)
  `, now, now);
  return db;
}

function sample(db, id, ageHours, policies) {
  db.execute(`
    INSERT INTO collector_samples(id, connection_id, kind, value_json, sampled_at)
    VALUES (?, 'c1', 'policy-traffic', ?, ?)
  `, id, JSON.stringify({ policies }), new Date(NOW - ageHours * 60 * 60 * 1000).toISOString());
}

test("policy traffic uses a pre-range baseline and handles counter resets", () => {
  const db = setup();
  try {
    sample(db, "baseline", 25, [{ name: "Proxy", downloadBytes: 1000, uploadBytes: 500 }]);
    sample(db, "one", 23, [
      { name: "Proxy", downloadBytes: 1600, uploadBytes: 700 },
      { name: "DIRECT", downloadBytes: 100, uploadBytes: 20 },
    ]);
    sample(db, "two", 2, [
      { name: "Proxy", downloadBytes: 200, uploadBytes: 50 },
      { name: "DIRECT", downloadBytes: 400, uploadBytes: 120 },
    ]);

    const rows = new PolicyTrafficAnalyticsService(db, () => NOW).query("c1", "24h");
    const proxy = rows.find((row) => row.name === "Proxy");
    const direct = rows.find((row) => row.name === "DIRECT");

    // Proxy: +600/+200 then engine reset, so +200/+50 after reset.
    assert.equal(proxy?.downloadBytes, 800);
    assert.equal(proxy?.uploadBytes, 250);
    assert.equal(proxy?.totalBytes, 1050);
    // DIRECT first appears in-range, so first observation is baseline; only later delta counts.
    assert.equal(direct?.downloadBytes, 300);
    assert.equal(direct?.uploadBytes, 100);
  } finally {
    db.close();
  }
});

test("policy traffic ranks policies by total bytes", () => {
  const db = setup();
  try {
    sample(db, "one", 2, [
      { name: "A", downloadBytes: 10, uploadBytes: 10 },
      { name: "B", downloadBytes: 20, uploadBytes: 20 },
    ]);
    sample(db, "two", 1, [
      { name: "A", downloadBytes: 110, uploadBytes: 10 },
      { name: "B", downloadBytes: 40, uploadBytes: 30 },
    ]);
    const rows = new PolicyTrafficAnalyticsService(db, () => NOW).query("c1", "7d");
    assert.deepEqual(rows.map((row) => row.name), ["A", "B"]);
  } finally {
    db.close();
  }
});
