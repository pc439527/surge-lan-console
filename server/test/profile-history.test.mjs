import assert from "node:assert/strict";
import { test } from "node:test";
import { AppDatabase } from "../dist/database.js";
import { ProfileHistoryService, diffProfileText, parseProfilePayload } from "../dist/profile-history.js";

function seedConnection(db, id = "conn-1") {
  const now = new Date().toISOString();
  db.execute(`
    INSERT INTO connections(id, name, protocol, host, port, platform, secret_id, created_at, updated_at)
    VALUES (?, 'Test', 'http', '192.168.50.10', 6171, 'tvos', NULL, ?, ?)
  `, id, now, now);
}

test("profile payload parser accepts masked Surge JSON and plain text", () => {
  assert.deepEqual(
    parseProfilePayload(JSON.stringify({ name: "Main.conf", profile: "[General]\r\nloglevel = notify\r\n" })),
    { profileName: "Main.conf", content: "[General]\nloglevel = notify\n" },
  );
  assert.deepEqual(
    parseProfilePayload("[General]\nloglevel = notify\n"),
    { profileName: "Profile.conf", content: "[General]\nloglevel = notify\n" },
  );
});

test("profile history deduplicates identical SHA-256 snapshots", () => {
  const db = new AppDatabase(":memory:");
  try {
    seedConnection(db);
    let now = Date.parse("2026-08-25T12:00:00.000Z");
    const service = new ProfileHistoryService(db, () => now);
    const first = service.capture("conn-1", JSON.stringify({ name: "Main.conf", profile: "a=1\nb=2\n" }), "manual");
    assert.equal(first.created, true);
    assert.equal(first.snapshot.sha256.length, 64);

    now += 60_000;
    const duplicate = service.capture("conn-1", JSON.stringify({ name: "Main.conf", profile: "a=1\r\nb=2\r\n" }), "scheduled");
    assert.equal(duplicate.created, false);
    assert.equal(duplicate.snapshot.id, first.snapshot.id);
    assert.equal(service.list("conn-1").length, 1);
  } finally {
    db.close();
  }
});

test("profile history reports a bounded changed section", () => {
  const db = new AppDatabase(":memory:");
  try {
    seedConnection(db);
    let now = Date.parse("2026-08-25T12:00:00.000Z");
    const service = new ProfileHistoryService(db, () => now);
    const before = service.capture("conn-1", "[General]\nloglevel = notify\n[Proxy]\nA = direct\n", "manual").snapshot;
    now += 60_000;
    const after = service.capture("conn-1", "[General]\nloglevel = info\n[Proxy]\nA = direct\nB = direct\n", "manual").snapshot;

    const diff = service.diff("conn-1", before.id, after.id);
    assert.equal(diff.changed, true);
    assert.equal(diff.from.sha256, before.sha256);
    assert.equal(diff.to.sha256, after.sha256);
    assert.equal(diff.chunks.length, 1);
    assert.ok(diff.addedLines > 0);
    assert.ok(diff.removedLines > 0);
    assert.equal(diff.truncated, false);
  } finally {
    db.close();
  }
});

test("identical profile text has an empty diff", () => {
  assert.deepEqual(diffProfileText("a\nb\n", "a\nb\n"), {
    changed: false,
    addedLines: 0,
    removedLines: 0,
    truncated: false,
    chunks: [],
  });
});
