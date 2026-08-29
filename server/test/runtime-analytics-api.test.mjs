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
  assert.ok(setCookie);
  return setCookie.split(";", 1)[0];
}

test("runtime analytics API requires session and validates range", async () => {
  const core = await startCore();
  try {
    const unauthenticated = await fetch(`${core.baseUrl}/api/analytics/runtime?connectionId=c1&range=24h`);
    assert.equal(unauthenticated.status, 401);
    assert.equal((await unauthenticated.json()).error.code, "session_required");

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

    const create = await fetch(`${core.baseUrl}/api/connections`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        name: "Test Surge",
        protocol: "http",
        host: "192.168.50.10",
        port: 6171,
        platform: "tvos",
        apiKey: "test-key",
      }),
    });
    assert.equal(create.status, 201);
    const connection = await create.json();

    const runtime = await fetch(
      `${core.baseUrl}/api/analytics/runtime?connectionId=${encodeURIComponent(connection.id)}&range=24h`,
      { headers: { cookie } },
    );
    assert.equal(runtime.status, 200);
    assert.deepEqual(await runtime.json(), {
      connectionId: connection.id,
      range: "24h",
      points: [],
    });

    const invalid = await fetch(
      `${core.baseUrl}/api/analytics/runtime?connectionId=${encodeURIComponent(connection.id)}&range=30d`,
      { headers: { cookie } },
    );
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, "invalid_health_range");
  } finally {
    await core.close();
  }
});
