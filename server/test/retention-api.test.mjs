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
      if (!app.server.listening) return;
      const closed = once(app.server, "close");
      app.server.close();
      await closed;
    },
  };
}

function sessionCookie(response) {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie);
  return setCookie.split(";", 1)[0];
}

test("retention settings API requires auth, validates bounds, persists updates, and resets defaults", async () => {
  const core = await startCore();
  try {
    const unauthenticated = await fetch(`${core.baseUrl}/api/settings/retention`);
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

    const initial = await fetch(`${core.baseUrl}/api/settings/retention`, { headers: { cookie } });
    assert.equal(initial.status, 200);
    const defaults = await initial.json();
    assert.deepEqual(defaults, {
      metricsRawDays: 2,
      policyTrafficDays: 30,
      healthRawDays: 7,
      trafficFiveMinuteDays: 30,
      trafficHourlyDays: 365,
      jobRunsDays: 30,
      notificationHistoryDays: 90,
    });

    const updated = await fetch(`${core.baseUrl}/api/settings/retention`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ metricsRawDays: 4, policyTrafficDays: 45, notificationHistoryDays: 120 }),
    });
    assert.equal(updated.status, 200);
    const settings = await updated.json();
    assert.equal(settings.metricsRawDays, 4);
    assert.equal(settings.policyTrafficDays, 45);
    assert.equal(settings.notificationHistoryDays, 120);
    assert.equal(settings.healthRawDays, 7);

    const persisted = await fetch(`${core.baseUrl}/api/settings/retention`, { headers: { cookie } });
    assert.equal(persisted.status, 200);
    assert.deepEqual(await persisted.json(), settings);

    const invalid = await fetch(`${core.baseUrl}/api/settings/retention`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ metricsRawDays: 99 }),
    });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, "invalid_retention_setting");

    const reset = await fetch(`${core.baseUrl}/api/settings/retention`, {
      method: "DELETE",
      headers: { cookie },
    });
    assert.equal(reset.status, 200);
    assert.deepEqual(await reset.json(), defaults);
  } finally {
    await core.close();
  }
});
