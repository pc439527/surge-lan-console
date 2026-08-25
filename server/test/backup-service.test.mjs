import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { BackupService } from "../dist/backup-service.js";
import { AppDatabase } from "../dist/database.js";

function seedConnection(db) {
  const now = new Date().toISOString();
  db.execute(`
    INSERT INTO connections(id, name, protocol, host, port, platform, secret_id, created_at, updated_at)
    VALUES ('conn-backup', 'Backup Test', 'http', '192.168.50.10', 6171, 'tvos', NULL, ?, ?)
  `, now, now);
}

test("online backup produces an independent quick-check-valid sqlite database", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "slc-backup-"));
  const databasePath = path.join(root, "surge-console.db");
  const db = new AppDatabase(databasePath);

  try {
    seedConnection(db);
    const service = new BackupService(db);
    const created = await service.create("manual");

    assert.equal(created.valid, true);
    assert.equal(created.quickCheck, "ok");
    assert.ok((created.schemaVersion ?? 0) >= 7);
    assert.equal(created.sha256.length, 64);
    assert.equal(created.source, "manual");
    assert.equal(service.list().length, 1);

    db.execute("DELETE FROM connections WHERE id = 'conn-backup'");

    const backupPath = path.join(root, "backups", created.id);
    const snapshot = new DatabaseSync(backupPath, { readOnly: true });
    try {
      const row = snapshot.prepare("SELECT name FROM connections WHERE id = 'conn-backup'").get();
      assert.equal(row?.name, "Backup Test");
    } finally {
      snapshot.close();
    }

    const validation = await service.validate(created.id);
    assert.equal(validation.valid, true);
    assert.equal(validation.sha256, created.sha256);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("backup validation rejects traversal identifiers", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "slc-backup-path-"));
  const db = new AppDatabase(path.join(root, "surge-console.db"));
  try {
    const service = new BackupService(db);
    await assert.rejects(() => service.validate("../surge-console.db"), (error) => error?.code === "invalid_backup_id");
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});
