import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createCoreApp } from "../dist/app.js";

async function startCore() {
  const dir = mkdtempSync(path.join(tmpdir(), "slc-backup-api-"));
  const app = createCoreApp({
    databasePath: path.join(dir, "surge-console.db"),
    sessionIdleMs: 30 * 60_000,
    sessionAbsoluteMs: 12 * 60 * 60_000,
  });
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const address = app.address();
  assert.ok(address);
  return {
    app,
    dir,
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      app.server.close();
      await once(app.server, "close");
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function sessionCookie(response) {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie);
  return setCookie.split(";", 1)[0];
}

test("backup API requires a session and creates validated online backups", async () => {
  const core = await startCore();
  try {
    const unauthenticated = await fetch(`${core.baseUrl}/api/backups`);
    assert.equal(unauthenticated.status, 401);
    assert.equal((await unauthenticated.json()).error.code, "session_required");

    const setup = await fetch(`${core.baseUrl}/api/auth/setup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        password: "correct horse battery staple",
        confirmPassword: "correct horse battery staple",
      }),
    });
    assert.equal(setup.status, 201);
    const cookie = sessionCookie(setup);

    const empty = await fetch(`${core.baseUrl}/api/backups`, { headers: { cookie } });
    assert.equal(empty.status, 200);
    assert.deepEqual(await empty.json(), []);

    const missingId = await fetch(`${core.baseUrl}/api/backups/validate`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(missingId.status, 400);
    assert.equal((await missingId.json()).error.code, "backup_id_required");

    const created = await fetch(`${core.baseUrl}/api/backups`, {
      method: "POST",
      headers: { cookie },
    });
    assert.equal(created.status, 201);
    const backup = await created.json();
    assert.equal(backup.source, "manual");
    assert.equal(backup.valid, true);
    assert.equal(backup.quickCheck, "ok");
    assert.ok(Number.isInteger(backup.schemaVersion));
    assert.match(backup.sha256, /^[a-f0-9]{64}$/);
    assert.match(backup.id, /^surge-console-\d{8}T\d{6}Z-manual-[a-f0-9]{8}\.db$/);

    const list = await fetch(`${core.baseUrl}/api/backups`, { headers: { cookie } });
    assert.equal(list.status, 200);
    const backups = await list.json();
    assert.equal(backups.length, 1);
    assert.equal(backups[0].id, backup.id);
    assert.equal(backups[0].source, "manual");
    assert.ok(backups[0].sizeBytes > 0);

    const validated = await fetch(`${core.baseUrl}/api/backups/validate`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ id: backup.id }),
    });
    assert.equal(validated.status, 200);
    const validation = await validated.json();
    assert.equal(validation.valid, true);
    assert.equal(validation.sha256, backup.sha256);

    const traversal = await fetch(`${core.baseUrl}/api/backups/validate`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ id: "../surge-console.db" }),
    });
    assert.equal(traversal.status, 400);
    assert.equal((await traversal.json()).error.code, "invalid_backup_id");
  } finally {
    await core.close();
  }
});
