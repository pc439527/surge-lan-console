import assert from "node:assert/strict";
import { test } from "node:test";
import { AppDatabase } from "../dist/database.js";
import { SchedulerService } from "../dist/scheduler-service.js";

function seedConnection(db, id = "conn-snapshot") {
  const now = new Date().toISOString();
  db.execute(`
    INSERT INTO connections(id, name, protocol, host, port, platform, secret_id, created_at, updated_at)
    VALUES (?, 'Snapshot Test', 'http', '192.168.50.10', 6171, 'tvos', NULL, ?, ?)
  `, id, now, now);
}

test("scheduler creates an enabled six-hour masked profile snapshot job", () => {
  const db = new AppDatabase(":memory:");
  seedConnection(db);
  const scheduler = new SchedulerService(
    db,
    { list: () => [{ id: "conn-snapshot" }] },
    {},
    { publish: () => undefined },
    { isUnlocked: () => false },
  );

  try {
    scheduler.start();
    const job = scheduler.listJobs().find((item) => item.type === "profile-snapshot");
    assert.ok(job);
    assert.equal(job.connectionId, "conn-snapshot");
    assert.equal(job.enabled, true);
    assert.equal(job.intervalSeconds, 21_600);
  } finally {
    scheduler.stop();
    db.close();
  }
});
