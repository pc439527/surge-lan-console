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

test("traffic analytics API requires session and validates ranges", async () => {
  const core = await startCore();
  try {
    const unauthenticated = await fetch(`${core.baseUrl}/api/analytics/traffic?connectionId=c1&range=24h`);
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
    assert.ok(connection.id);

    const analytics = await fetch(
      `${core.baseUrl}/api/analytics/traffic?connectionId=${encodeURIComponent(connection.id)}&range=24h`,
      { headers: { cookie } },
    );
    assert.equal(analytics.status, 200);
    assert.deepEqual(await analytics.json(), {
      connectionId: connection.id,
      range: "24h",
      points: [],
    });

    const invalidRange = await fetch(
      `${core.baseUrl}/api/analytics/traffic?connectionId=${encodeURIComponent(connection.id)}&range=1y`,
      { headers: { cookie } },
    );
    assert.equal(invalidRange.status, 400);
    assert.equal((await invalidRange.json()).error.code, "invalid_analytics_range");

    const missingConnection = await fetch(`${core.baseUrl}/api/analytics/traffic?range=7d`, {
      headers: { cookie },
    });
    assert.equal(missingConnection.status, 400);
    assert.equal((await missingConnection.json()).error.code, "connection_required");
  } finally {
    await core.close();
  }
});
