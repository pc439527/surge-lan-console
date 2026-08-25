import assert from "node:assert/strict";
import { test } from "node:test";
import { UpdateCheckService } from "../dist/update-check-service.js";

test("update checker reports unconfigured without any remote request", async () => {
  const service = new UpdateCheckService();
  const result = await service.check({ version: "0.5.0", commit: "abcdef1", branch: "main" });
  assert.equal(result.status, "unconfigured");
  assert.equal(result.source, null);
  assert.equal(result.latest, null);
});

test("manifest update checker compares commits and caches remote metadata", async (t) => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({
      version: "0.6.0",
      commit: "1234567890abcdef",
      branch: "main",
      publishedAt: "2026-08-25T12:00:00.000Z",
      url: "https://example.com/releases/0.6.0",
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const service = new UpdateCheckService({ manifestUrl: "https://updates.example.com/latest.json", cacheMs: 60_000 });
  const outdated = await service.check({ version: "0.5.0", commit: "abcdef1", branch: "main" });
  assert.equal(outdated.status, "update-available");
  assert.equal(outdated.source, "manifest");
  assert.equal(outdated.latest?.version, "0.6.0");
  assert.equal(calls, 1);

  const cached = await service.check({ version: "0.6.0", commit: "1234567", branch: "main" });
  assert.equal(cached.status, "current");
  assert.equal(calls, 1);

  await service.check({ version: "0.6.0", commit: "1234567", branch: "main" }, true);
  assert.equal(calls, 2);
});

test("update checker returns a sanitized error for inaccessible private GitHub", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
  t.after(() => { globalThis.fetch = originalFetch; });

  const service = new UpdateCheckService({
    githubRepo: "owner/private-repo",
    githubToken: "super-secret-token",
    branch: "main",
  });
  const result = await service.check({ version: "0.5.0", commit: "abcdef1", branch: "main" });
  assert.equal(result.status, "error");
  assert.equal(result.source, "github");
  assert.match(result.message, /HTTP 404/);
  assert.equal(result.message.includes("super-secret-token"), false);
});
