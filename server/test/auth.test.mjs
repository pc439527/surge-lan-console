import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { createCoreApp } from "../dist/app.js";

async function startCore() {
  const app = createCoreApp({
    databasePath: ":memory:",
    sessionIdleMs: 30 * 60_000,
    sessionAbsoluteMs: 12 * 60 * 60_000,
  });
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const address = app.address();
  assert.ok(address);
  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      app.server.close();
      await once(app.server, "close");
    },
  };
}

function sessionCookie(response) {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "session cookie should be returned");
  return setCookie.split(";", 1)[0];
}

test("auth bootstrap, lock and unlock lifecycle", async () => {
  const core = await startCore();
  try {
    const initial = await fetch(`${core.baseUrl}/api/auth/state`);
    assert.equal(initial.status, 200);
    assert.deepEqual(await initial.json(), {
      initialized: false,
      authenticated: false,
      sessionExpiresAt: null,
    });

    const setup = await fetch(`${core.baseUrl}/api/auth/setup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        password: "4829",
        confirmPassword: "4829",
      }),
    });
    assert.equal(setup.status, 201);
    const cookie = sessionCookie(setup);
    const setupBody = await setup.json();
    assert.equal(setupBody.initialized, true);
    assert.equal(setupBody.authenticated, true);

    const authenticated = await fetch(`${core.baseUrl}/api/auth/state`, {
      headers: { cookie },
    });
    assert.equal((await authenticated.json()).authenticated, true);

    const lock = await fetch(`${core.baseUrl}/api/auth/lock`, {
      method: "POST",
      headers: { cookie },
    });
    assert.equal(lock.status, 200);
    assert.equal((await lock.json()).authenticated, false);

    const wrong = await fetch(`${core.baseUrl}/api/auth/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "0000" }),
    });
    assert.equal(wrong.status, 401);
    assert.equal((await wrong.json()).error.code, "invalid_password");

    // 4 位之外的输入直接按格式错误拒绝，不消耗解锁失败计数
    const malformed = await fetch(`${core.baseUrl}/api/auth/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "12" }),
    });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).error.code, "pin_format");

    const unlock = await fetch(`${core.baseUrl}/api/auth/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "4829" }),
    });
    assert.equal(unlock.status, 200);
    assert.equal((await unlock.json()).authenticated, true);
    sessionCookie(unlock);
  } finally {
    await core.close();
  }
});

test("setup rejects non-4-digit PINs and health reports SQLite", async () => {
  const core = await startCore();
  try {
    const health = await fetch(`${core.baseUrl}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
      status: "ok",
      database: "ok",
      initialized: false,
    });

    const setup = await fetch(`${core.baseUrl}/api/auth/setup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "123", confirmPassword: "123" }),
    });
    assert.equal(setup.status, 400);
    assert.equal((await setup.json()).error.code, "pin_format");

    const nonNumeric = await fetch(`${core.baseUrl}/api/auth/setup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "abcd", confirmPassword: "abcd" }),
    });
    assert.equal(nonNumeric.status, 400);
    assert.equal((await nonNumeric.json()).error.code, "pin_format");

    const mismatch = await fetch(`${core.baseUrl}/api/auth/setup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "1234", confirmPassword: "5678" }),
    });
    assert.equal(mismatch.status, 400);
    assert.equal((await mismatch.json()).error.code, "password_mismatch");
  } finally {
    await core.close();
  }
});
