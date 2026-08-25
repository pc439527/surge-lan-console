import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { createCoreApp } from "../dist/app.js";

async function startCore() {
  const app = createCoreApp({
    databasePath: ":memory:",
    sessionIdleMs: 30 * 60_000,
    sessionAbsoluteMs: 12 * 60 * 60_000,
    updateCheck: {},
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
  assert.ok(setCookie);
  return setCookie.split(";", 1)[0];
}

test("update-check API requires authentication and reports unconfigured source", async () => {
  const core = await startCore();
  try {
    const unauthenticated = await fetch(`${core.baseUrl}/api/update-check?version=0.5.0&commit=abcdef1&branch=main`);
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

    const checked = await fetch(`${core.baseUrl}/api/update-check?version=0.5.0&commit=abcdef1&branch=main`, {
      headers: { cookie },
    });
    assert.equal(checked.status, 200);
    const result = await checked.json();
    assert.equal(result.status, "unconfigured");
    assert.equal(result.source, null);
    assert.deepEqual(result.current, { version: "0.5.0", commit: "abcdef1", branch: "main" });
    assert.equal(result.latest, null);
    assert.equal(result.checkedAt, null);
  } finally {
    await core.close();
  }
});
