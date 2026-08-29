import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { test } from "node:test";
import { AppDatabase } from "../dist/database.js";
import { EventBus } from "../dist/event-bus.js";
import { isForbiddenNotificationAddress, NotificationService } from "../dist/notification-service.js";
import { RuntimeVault } from "../dist/runtime-vault.js";
import { SecretVault } from "../dist/secret-vault.js";

function hhmm(totalMinutes) {
  const value = (totalMinutes + 1440) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

test("Bark target validation rejects local and link-local addresses", () => {
  assert.equal(isForbiddenNotificationAddress("127.0.0.1"), true);
  assert.equal(isForbiddenNotificationAddress("169.254.169.254"), true);
  assert.equal(isForbiddenNotificationAddress("::1"), true);
  assert.equal(isForbiddenNotificationAddress("fe80::1"), true);
  assert.equal(isForbiddenNotificationAddress("192.168.50.10"), false);
  assert.equal(isForbiddenNotificationAddress("192.0.2.10"), false);
});

test("quiet-hour failure does not create a standalone recovery notification", async () => {
  const db = new AppDatabase(":memory:");
  const vault = new SecretVault(db);
  const runtime = new RuntimeVault();
  const bus = new EventBus();
  const key = Buffer.alloc(32, 7);
  runtime.unlock(key);
  const service = new NotificationService(db, vault, runtime, bus);

  try {
    const channel = service.saveChannel({ name: "Bark", endpoint: "http://192.0.2.10:9/device-key" }, key);
    const rule = db.queryOne(
      "SELECT id FROM notification_rules WHERE channel_id = ? AND event_type = 'device-offline'",
      channel.id,
    );
    assert.ok(rule?.id);

    const now = new Date();
    const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
    service.updateRule(rule.id, {
      quietStart: hhmm(minute - 1),
      quietEnd: hhmm(minute + 2),
      timeZone: "UTC",
    });

    bus.publish({
      type: "device-offline",
      fingerprint: "device:test",
      title: "offline",
      body: "offline",
      severity: "error",
    });
    await sleep(25);

    const stateAfterFailure = db.queryOne(
      "SELECT active FROM event_states WHERE channel_id = ? AND fingerprint = ?",
      channel.id,
      "device:test",
    );
    assert.equal(stateAfterFailure, null, "quiet-hour failure must not mark the event as notified-active");

    bus.publish({
      type: "device-recovery",
      fingerprint: "device:test",
      title: "recovered",
      body: "recovered",
      severity: "info",
      recovery: true,
    });
    await sleep(25);

    const history = db.queryAll(
      "SELECT event_type, status, error_message FROM notification_history WHERE channel_id = ? ORDER BY created_at",
      channel.id,
    );
    assert.equal(history.length, 1);
    assert.equal(history[0].event_type, "device-offline");
    assert.equal(history[0].status, "suppressed");
    assert.equal(history[0].error_message, "quiet-hours");
  } finally {
    service.close();
    runtime.lock();
    key.fill(0);
    db.close();
  }
});
