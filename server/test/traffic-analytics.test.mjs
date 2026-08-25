import assert from "node:assert/strict";
import { test } from "node:test";
import { AppDatabase } from "../dist/database.js";
import { TrafficAnalyticsService, parseTrafficSnapshot } from "../dist/traffic-analytics.js";

const NOW = Date.parse("2026-08-25T12:04:00.000Z");

function traffic({ startTime = 1000, a, b }) {
  return Buffer.from(JSON.stringify({
    startTime,
    interface: {
      en0: {
        outCurrentSpeed: a.uploadRate,
        inCurrentSpeed: a.downloadRate,
        out: a.totalUpload,
        in: a.totalDownload,
      },
      ...(b ? {
        utun0: {
          outCurrentSpeed: b.uploadRate,
          inCurrentSpeed: b.downloadRate,
          out: b.totalUpload,
          in: b.totalDownload,
        },
      } : {}),
    },
  }));
}

function addConnection(db) {
  const now = new Date(NOW).toISOString();
  db.execute(`
    INSERT INTO connections(id, name, protocol, host, port, platform, secret_id, created_at, updated_at)
    VALUES ('conn-test', 'Test', 'http', '192.168.50.2', 6171, NULL, NULL, ?, ?)
  `, now, now);
}

test("traffic parser sums all interfaces", () => {
  const result = parseTrafficSnapshot(traffic({
    a: { uploadRate: 100, downloadRate: 200, totalUpload: 1000, totalDownload: 2000 },
    b: { uploadRate: 50, downloadRate: 75, totalUpload: 500, totalDownload: 750 },
  }));
  assert.deepEqual(result, {
    uploadRate: 150,
    downloadRate: 275,
    totalUpload: 1500,
    totalDownload: 2750,
    startTime: 1000,
  });
});

test("traffic analytics builds 5m and 1h rollups with counter deltas", () => {
  const db = new AppDatabase(":memory:");
  try {
    addConnection(db);
    const analytics = new TrafficAnalyticsService(db, () => NOW);
    analytics.ingest("conn-test", traffic({
      a: { uploadRate: 100, downloadRate: 200, totalUpload: 1000, totalDownload: 2000 },
    }), Date.parse("2026-08-25T12:01:00.000Z"));
    analytics.ingest("conn-test", traffic({
      a: { uploadRate: 300, downloadRate: 400, totalUpload: 1600, totalDownload: 2900 },
    }), Date.parse("2026-08-25T12:02:00.000Z"));

    const fiveMinute = analytics.query("conn-test", "24h");
    assert.equal(fiveMinute.length, 1);
    assert.equal(fiveMinute[0].bucketSeconds, 300);
    assert.equal(fiveMinute[0].bucketStart, "2026-08-25T12:00:00.000Z");
    assert.equal(fiveMinute[0].sampleCount, 2);
    assert.equal(fiveMinute[0].avgUploadRate, 200);
    assert.equal(fiveMinute[0].avgDownloadRate, 300);
    assert.equal(fiveMinute[0].maxUploadRate, 300);
    assert.equal(fiveMinute[0].uploadBytesDelta, 600);
    assert.equal(fiveMinute[0].downloadBytesDelta, 900);

    const hourly = analytics.query("conn-test", "7d");
    assert.equal(hourly.length, 1);
    assert.equal(hourly[0].bucketSeconds, 3600);
    assert.equal(hourly[0].bucketStart, "2026-08-25T12:00:00.000Z");
    assert.equal(hourly[0].sampleCount, 2);
    assert.equal(hourly[0].uploadBytesDelta, 600);
  } finally {
    db.close();
  }
});

test("traffic counter reset never creates a false traffic spike", () => {
  const db = new AppDatabase(":memory:");
  try {
    addConnection(db);
    const analytics = new TrafficAnalyticsService(db, () => NOW);
    analytics.ingest("conn-test", traffic({
      startTime: 1000,
      a: { uploadRate: 10, downloadRate: 20, totalUpload: 9000, totalDownload: 12000 },
    }), Date.parse("2026-08-25T12:01:00.000Z"));
    analytics.ingest("conn-test", traffic({
      startTime: 2000,
      a: { uploadRate: 15, downloadRate: 25, totalUpload: 100, totalDownload: 200 },
    }), Date.parse("2026-08-25T12:02:00.000Z"));

    const point = analytics.query("conn-test", "24h")[0];
    assert.equal(point.uploadBytesDelta, 0);
    assert.equal(point.downloadBytesDelta, 0);
  } finally {
    db.close();
  }
});
