import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { createCoreApp } from "../dist/app.js";

async function startCore() {
  const app = createCoreApp({ databasePath: ":memory:", sessionIdleMs: 30 * 60_000, sessionAbsoluteMs: 12 * 60 * 60_000 });
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const address = app.address();
  assert.ok(address);
  return { app, baseUrl: `http://127.0.0.1:${address.port}`, async close() { app.server.close(); await once(app.server, "close"); } };
}

function cookie(response) {
  const value = response.headers.get("set-cookie");
  assert.ok(value);
  return value.split(";", 1)[0];
}

test("policy traffic analytics requires session and accepts 30d range", async () => {
  const core = await startCore();
  try {
    const unauth = await fetch(`${core.baseUrl}/api/analytics/policy-traffic?connectionId=c1&range=24h`);
    assert.equal(unauth.status, 401);

    const setup = await fetch(`${core.baseUrl}/api/auth/setup`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "correct horse battery staple", confirmPassword: "correct horse battery staple" }),
    });
    const session = cookie(setup);
    const create = await fetch(`${core.baseUrl}/api/connections`, {
      method: "POST", headers: { cookie: session, "content-type": "application/json" },
      body: JSON.stringify({ name: "Test", protocol: "http", host: "192.168.50.10", port: 6171, platform: "tvos", apiKey: "key" }),
    });
    const connection = await create.json();

    const response = await fetch(`${core.baseUrl}/api/analytics/policy-traffic?connectionId=${encodeURIComponent(connection.id)}&range=30d`, { headers: { cookie: session } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { connectionId: connection.id, range: "30d", policies: [] });
  } finally {
    await core.close();
  }
});
