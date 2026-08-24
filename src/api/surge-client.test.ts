import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classifyError, isMixedContentBlocked, SurgeClient, type SurgeConnectionConfig } from "./surge-client";
import { SurgeError } from "./errors";

const CONFIG: SurgeConnectionConfig = {
  protocol: "http",
  host: "192.168.50.10",
  port: 6171,
  apiKey: "test-key",
  timeoutMs: 1000,
};

describe("SurgeClient", () => {
  let mock: MockAdapter;
  let client: SurgeClient;

  beforeEach(() => {
    // The client creates its own axios instance internally; create a fresh mock
    // attached to the default adapter used by axios.create (we use the shared
    // adapter registry by stubbing through the same module).
    mock = new MockAdapter(axios);
    client = new SurgeClient(CONFIG);
  });

  afterEach(() => mock.reset());

  it("sends X-Key header", async () => {
    mock.onGet("/v1/outbound").reply(200, { policy: "rule" });
    await client.getOutboundMode();
    const req = mock.history.get[0];
    expect(req.headers?.["X-Key"]).toBe("test-key");
  });

  it("reads outbound mode", async () => {
    mock.onGet("/v1/outbound").reply(200, { mode: "proxy" });
    expect(await client.getOutboundMode()).toBe("proxy");
  });

  it("sets outbound mode", async () => {
    mock.onPost("/v1/outbound").reply(200, {});
    await client.setOutboundMode("direct");
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ mode: "direct" });
  });

  it("maps 401 to authentication error", async () => {
    mock.onGet("/v1/outbound").reply(401, {});
    await expect(client.getOutboundMode()).rejects.toMatchObject({ kind: "authentication" });
  });

  it("maps network failure to connection error", async () => {
    mock.onGet("/v1/outbound").networkError();
    await expect(client.getOutboundMode()).rejects.toMatchObject({ kind: "connection" });
  });

  it("maps timeout to timeout error", async () => {
    mock.onGet("/v1/outbound").timeout();
    await expect(client.getOutboundMode()).rejects.toMatchObject({ kind: "timeout" });
  });

  it("maps 404 to unsupported feature error", async () => {
    mock.onGet("/v1/outbound").reply(404, {});
    await expect(client.getOutboundMode()).rejects.toMatchObject({ kind: "unsupported" });
  });

  it("maps 405 to unsupported, 408 to timeout, 5xx to server-error (T05)", async () => {
    mock.onGet("/v1/outbound").reply(405, {});
    await expect(client.getOutboundMode()).rejects.toMatchObject({ kind: "unsupported" });

    mock.onGet("/v1/outbound").reply(408, {});
    await expect(client.getOutboundMode()).rejects.toMatchObject({ kind: "timeout" });

    mock.onGet("/v1/outbound").reply(502, {});
    await expect(client.getOutboundMode()).rejects.toMatchObject({ kind: "server-error" });
  });

  it("getEvents normalizes drifted event rows (T03)", async () => {
    mock.onGet("/v1/events").reply(200, {
      events: [
        { identifier: "a", date: 1700000000, type: "2", content: "boom" },
        { identifier: "b", date: "2024-01-01T00:00:00.000Z", type: "1", content: "warn" },
      ],
    });
    const list = await client.getEvents();
    expect(list.events).toHaveLength(2);
    expect(list.events[0]).toMatchObject({ type: 2, date: new Date(1700000000 * 1000).toISOString() });
    expect(list.events[1].type).toBe(1);
  });

  it("getRules maps field-drift aliases (T02)", async () => {
    mock.onGet("/v1/rules").reply(200, [
      { rule_type: "DOMAIN", rule: "x.com", policy_name: "DIRECT" },
    ]);
    const rules = await client.getRules();
    expect(rules[0]).toMatchObject({ type: "DOMAIN", content: "x.com", policy: "DIRECT" });
  });

  it("testConnection reports reachable+authenticated on success", async () => {
    mock.onGet("/v1/outbound").reply(200, { policy: "rule" });
    const result = await client.testConnection();
    expect(result.reachable).toBe(true);
    expect(result.authenticated).toBe(true);
    expect(typeof result.latencyMs).toBe("number");
  });

  it("testConnection distinguishes reachable-but-unauthenticated", async () => {
    mock.onGet("/v1/outbound").reply(401, {});
    const result = await client.testConnection();
    expect(result.reachable).toBe(true);
    expect(result.authenticated).toBe(false);
    expect(result.error?.kind).toBe("authentication");
  });

  it.each([
    [404, "unsupported"],
    [408, "timeout"],
    [502, "server-error"],
  ] as const)(
    "testConnection treats an HTTP %i response as reachable (%s)",
    async (status, kind) => {
      mock.onGet("/v1/outbound").reply(status, {});

      const result = await client.testConnection();

      expect(result.reachable).toBe(true);
      expect(result.authenticated).toBe(false);
      expect(typeof result.latencyMs).toBe("number");
      expect(result.error?.kind).toBe(kind);
    },
  );

  it("testConnection reports unreachable on network failure", async () => {
    mock.onGet("/v1/outbound").networkError();
    const result = await client.testConnection();
    expect(result.reachable).toBe(false);
    expect(result.authenticated).toBe(false);
    expect(result.latencyMs).toBeNull();
    expect(result.error?.kind).toBe("connection");
  });

  it("fetching policy groups", async () => {
    mock.onGet("/v1/policy_groups").reply(200, {
      Proxy: [{ name: "HK 01", typeDescription: "ss" }],
    });
    const groups = await client.getPolicyGroups();
    expect(Object.keys(groups)).toContain("Proxy");
  });

  it("selecting a policy posts the right payload", async () => {
    mock.onPost("/v1/policy_groups/select").reply(200, {});
    await client.selectPolicy("Proxy", "HK 02");
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ group_name: "Proxy", policy: "HK 02" });
  });

  it("normalizes policy test receive timings from the POST response", async () => {
    mock.onPost("/v1/policy_groups/test").reply(200, {
      "HK 01": { tcp: 12, receive: 48.4 },
      "HK 02": { tcp: 15 },
    });
    await expect(client.testPolicyGroup("Proxy")).resolves.toEqual({
      available: ["HK 01"],
      results: {
        "HK 01": { ok: true, latency: 48 },
        "HK 02": { ok: false, latency: "Timeout" },
      },
    });
  });

  it("keeps available-only nodes reachable without inventing latency", async () => {
    mock.onPost("/v1/policy_groups/test").reply(200, { available: ["HK 01", "HK 02"] });
    await expect(client.testPolicyGroup("Proxy")).resolves.toEqual({
      available: ["HK 01", "HK 02"],
      results: {
        "HK 01": { ok: true, latency: null },
        "HK 02": { ok: true, latency: null },
      },
    });
  });

  it("normalizes wrapped URL-test results and winner", async () => {
    mock.onPost("/v1/policy_groups/test").reply(200, {
      winner: "HK 02",
      results: [{ data: { "HK 02": { receive: 35 } } }],
    });
    await expect(client.testPolicyGroup("Proxy")).resolves.toEqual({
      available: ["HK 02"],
      results: { "HK 02": { ok: true, latency: 35 } },
      winner: "HK 02",
    });
  });

  it("flushes DNS cache", async () => {
    mock.onPost("/v1/dns/flush").reply(200, {});
    await client.flushDns();
    expect(mock.history.post[0].url).toBe("/v1/dns/flush");
  });

  it("profile fetch passes sensitive=0 by default", async () => {
    mock.onGet("/v1/profiles/current").reply(200, { name: "Profile.conf", profile: "[General]" });
    await client.getCurrentProfile();
    expect(mock.history.get[0].params).toEqual({ sensitive: 0 });
  });
});

describe("SurgeClient proxy mode", () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(axios);
  });

  afterEach(() => mock.reset());

  it("targets the console origin and keeps the device as proxyTarget", async () => {
    const proxyClient = new SurgeClient({
      ...CONFIG,
      proxyBaseUrl: "https://console.example.ts.net:8080",
      proxyTarget: "192.168.50.10:6171",
    });
    mock.onGet("/v1/outbound").reply(200, { mode: "rule" });
    await proxyClient.getOutboundMode();
    const req = mock.history.get[0];
    expect(req.baseURL).toBe("https://console.example.ts.net:8080");
    expect(req.headers?.["X-Key"]).toBe("test-key");
  });

  it("sends X-Surge-Target per request so nginx can route among devices (P0-5)", async () => {
    const proxyClient = new SurgeClient({
      ...CONFIG,
      proxyBaseUrl: "http://console.local:8080",
      proxyTarget: "192.168.50.11:6171",
    });
    mock.onGet("/v1/outbound").reply(200, { mode: "rule" });
    await proxyClient.getOutboundMode();
    const req = mock.history.get[0];
    // The header is exactly the allowlist key used by nginx.conf's
    // map $http_x_surge_target — unknown targets get 403.
    expect(req.headers?.["X-Surge-Target"]).toBe("192.168.50.11:6171");
    expect(req.baseURL).toBe("http://console.local:8080");
  });

  it("does not send X-Surge-Target without proxyTarget (direct mode)", async () => {
    mock.onGet("/v1/outbound").reply(200, { mode: "rule" });
    await new SurgeClient(CONFIG).getOutboundMode();
    expect(mock.history.get[0].headers?.["X-Surge-Target"]).toBeUndefined();
  });
});

describe("classifyError", () => {
  it("classifies plain error as api", () => {
    const err = classifyError(new Error("boom"));
    expect(err).toBeInstanceOf(SurgeError);
    expect(err.kind).toBe("api");
  });

  it("detects mixed content: HTTPS page + HTTP target (pure helper)", () => {
    expect(isMixedContentBlocked("http://192.168.50.10:6171", "https:")).toBe(true);
    expect(isMixedContentBlocked("http://192.168.50.10:6171", "http:")).toBe(false);
    expect(isMixedContentBlocked(undefined, "https:")).toBe(false);
    expect(isMixedContentBlocked("https://192.168.50.10:6171", "https:")).toBe(false);
  });

  it("keeps connection error for HTTP page + HTTP target", () => {
    const ax = {
      isAxiosError: true,
      code: "ERR_NETWORK",
      message: "Network Error",
      response: undefined,
      config: { baseURL: "http://192.168.50.10:6171" },
    } as never;
    const err = classifyError(ax);
    expect(err.kind).toBe("connection");
  });
});
