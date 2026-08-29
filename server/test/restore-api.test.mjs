import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createCoreApp } from "../dist/app.js";

const PASSWORD = "4829";

async function listen(app) {
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const address = app.address();
  assert.ok(address);
  return `http://127.0.0.1:${address.port}`;
}

function sessionCookie(response) {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie);
  return setCookie.split(";", 1)[0];
}

async function setup(baseUrl) {
  const response = await fetch(`${baseUrl}/api/auth/setup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: PASSWORD, confirmPassword: PASSWORD }),
  });
  assert.equal(response.status, 201);
  return sessionCookie(response);
}

async function unlock(baseUrl) {
  const response = await fetch(`${baseUrl}/api/auth/unlock`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  assert.equal(response.status, 200);
  return sessionCookie(response);
}

async function closeServer(app) {
  if (!app.server.listening) return;
  const closed = once(app.server, "close");
  app.server.close();
  await closed;
}

test("restore API returns 202, closes Core, restores the selected snapshot, and requests restart", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "slc-restore-api-"));
  const databasePath = path.join(root, "surge-console.db");
  let resolveRestart;
  const restartRequested = new Promise((resolve) => { resolveRestart = resolve; });
  const first = createCoreApp({
    databasePath,
    sessionIdleMs: 30 * 60_000,
    sessionAbsoluteMs: 12 * 60 * 60_000,
    onRestartRequested: (success) => resolveRestart(success),
  });
  let second = null;

  try {
    const baseUrl = await listen(first);
    const cookie = await setup(baseUrl);

    const createdConnection = await fetch(`${baseUrl}/api/connections`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ name: "Snapshot Name", protocol: "http", host: "192.168.50.10", port: 6171, platform: "tvos", apiKey: "secret-key" }),
    });
    assert.equal(createdConnection.status, 201);
    const connection = await createdConnection.json();

    const createdBackup = await fetch(`${baseUrl}/api/backups`, { method: "POST", headers: { cookie } });
    assert.equal(createdBackup.status, 201);
    const backup = await createdBackup.json();

    const changed = await fetch(`${baseUrl}/api/connections/${encodeURIComponent(connection.id)}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ name: "Changed After Backup" }),
    });
    assert.equal(changed.status, 200);

    const staleSha = await fetch(`${baseUrl}/api/backups/restore`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ id: backup.id, expectedSha256: "0".repeat(64) }),
    });
    assert.equal(staleSha.status, 409);
    assert.equal((await staleSha.json()).error.code, "restore_backup_changed");
    assert.equal(first.server.listening, true);

    const restore = await fetch(`${baseUrl}/api/backups/restore`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ id: backup.id, expectedSha256: backup.sha256 }),
    });
    assert.equal(restore.status, 202);
    const accepted = await restore.json();
    assert.equal(accepted.backup.id, backup.id);
    assert.equal(accepted.backup.sha256, backup.sha256);
    assert.equal(accepted.safetyBackup.source, "restore-point");
    assert.equal(accepted.safetyBackup.valid, true);
    assert.equal(accepted.restartRequired, true);

    assert.equal(await restartRequested, true);
    assert.equal(first.server.listening, false);

    second = createCoreApp({
      databasePath,
      sessionIdleMs: 30 * 60_000,
      sessionAbsoluteMs: 12 * 60 * 60_000,
    });
    const restoredBaseUrl = await listen(second);
    const restoredCookie = await unlock(restoredBaseUrl);

    const connections = await fetch(`${restoredBaseUrl}/api/connections`, { headers: { cookie: restoredCookie } });
    assert.equal(connections.status, 200);
    const restoredConnections = await connections.json();
    assert.equal(restoredConnections.find((item) => item.id === connection.id)?.name, "Snapshot Name");

    const backups = await fetch(`${restoredBaseUrl}/api/backups`, { headers: { cookie: restoredCookie } });
    assert.equal(backups.status, 200);
    const backupList = await backups.json();
    assert.ok(backupList.some((item) => item.source === "restore-point"));
  } finally {
    await closeServer(first);
    if (second) await closeServer(second);
    rmSync(root, { recursive: true, force: true });
  }
});
