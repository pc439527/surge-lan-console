import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { BackupService } from "../dist/backup-service.js";
import { AppDatabase } from "../dist/database.js";

function seedConnection(db, name) {
  const now = new Date().toISOString();
  db.execute(`
    INSERT INTO connections(id, name, protocol, host, port, platform, secret_id, created_at, updated_at)
    VALUES ('conn-restore', ?, 'http', '192.168.50.10', 6171, 'tvos', NULL, ?, ?)
  `, name, now, now);
}

function connectionName(databasePath) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const row = db.prepare("SELECT name FROM connections WHERE id = 'conn-restore'").get();
    return row?.name ?? null;
  } finally {
    db.close();
  }
}

test("restore stages a validated backup, creates a safety point, and atomically replaces the closed database", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "slc-restore-"));
  const databasePath = path.join(root, "surge-console.db");
  const db = new AppDatabase(databasePath);
  let closed = false;

  try {
    seedConnection(db, "Before Backup");
    const service = new BackupService(db);
    const selected = await service.create("manual");

    db.execute("UPDATE connections SET name = 'Current Before Restore', updated_at = ? WHERE id = 'conn-restore'", new Date().toISOString());

    const prepared = await service.prepareRestore(selected.id, selected.sha256);
    assert.equal(prepared.result.backup.id, selected.id);
    assert.equal(prepared.result.backup.sha256, selected.sha256);
    assert.equal(prepared.result.safetyBackup.source, "restore-point");
    assert.equal(prepared.result.safetyBackup.valid, true);
    assert.equal(prepared.result.restartRequired, true);

    const safetyPath = path.join(root, "backups", prepared.result.safetyBackup.id);
    assert.equal(connectionName(safetyPath), "Current Before Restore");

    db.close();
    closed = true;
    await prepared.apply();

    assert.equal(connectionName(databasePath), "Before Backup");
    assert.equal(
      readdirSync(root).some((name) => name.includes("restore-") && (name.endsWith(".pending") || name.includes("restore-rollback-"))),
      false,
    );
  } finally {
    if (!closed) db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("restore rejects a stale or incorrect SHA before creating a restore plan", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "slc-restore-sha-"));
  const db = new AppDatabase(path.join(root, "surge-console.db"));
  try {
    seedConnection(db, "SHA Guard");
    const service = new BackupService(db);
    const selected = await service.create("manual");

    await assert.rejects(
      () => service.prepareRestore(selected.id, "0".repeat(64)),
      (error) => error?.code === "restore_backup_changed",
    );
    assert.equal(service.list().filter((backup) => backup.source === "restore-point").length, 0);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});
