import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classifyError, SurgeClient, type SurgeConnectionConfig } from "./surge-client";
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

  it("testConnection reports latency on success", async () => {
    mock.onGet("/v1/outbound").reply(200, { policy: "rule" });
    const result = await client.testConnection();
    expect(result.ok).toBe(true);
    expect(typeof result.latencyMs).toBe("number");
  });

  it("testConnection treats auth rejection as reachable", async () => {
    mock.onGet("/v1/outbound").reply(401, {});
    const result = await client.testConnection();
    expect(result.ok).toBe(true);
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

describe("classifyError", () => {
  it("classifies plain error as api", () => {
    const err = classifyError(new Error("boom"));
    expect(err).toBeInstanceOf(SurgeError);
    expect(err.kind).toBe("api");
  });
});