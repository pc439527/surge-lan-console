import { describe, expect, it } from "vitest";
import { maskSensitive, runApiDiagnostics } from "./diagnostics";
import { SurgeError } from "@/api/errors";
import { ENDPOINT_REGISTRY } from "@/api/registry";
import { analyzeRules, normalizeRules } from "@/api/normalize/rules";
import { normalizeEvents } from "@/api/normalize/events";
import type { SurgeClient } from "@/api/surge-client";

type ProbeResult = { status: number | null; latencyMs: number | null; raw: unknown; error?: SurgeError };

const ok = (raw: unknown): ProbeResult => ({ status: 200, latencyMs: 12, raw });
const err = (e: SurgeError): ProbeResult => ({ status: e.status ?? null, latencyMs: 5, raw: null, error: e });

function fakeClientWith(overrides: Record<string, ProbeResult>): SurgeClient {
  const responses: Record<string, ProbeResult> = {
    "/v1/outbound": ok({ mode: "rule" }),
    "/v1/traffic": ok({ interface: { en0: {} } }),
    "/v1/requests/recent": ok({ requests: [] }),
    "/v1/policy_groups": ok({}),
    "/v1/rules": ok([]),
    "/v1/dns": ok({ dnsCache: [], local: [] }),
    "/v1/modules": ok({ enabled: [] }),
    "/v1/scripting": ok({ scripts: [] }),
    "/v1/events": ok({ events: [] }),
  };
  Object.assign(responses, overrides);
  return {
    probeEndpoint: async (endpoint: string) =>
      responses[endpoint] ?? { status: 200, latencyMs: 1, raw: null },
  } as unknown as SurgeClient;
}

function probe(report: Awaited<ReturnType<typeof runApiDiagnostics>>, endpoint: string) {
  const hit = report.endpoints.find((e) => e.endpoint === endpoint);
  if (!hit) throw new Error("endpoint not probed: " + endpoint);
  return hit;
}

describe("runApiDiagnostics · registry-driven (T01)", () => {
  it("uses the SAME parser as the page — rules 72/72/0 is OK", async () => {
    const raw = Array.from({ length: 72 }, (_, i) => ({
      type: "DOMAIN",
      content: `x${i}.com`,
      policy: "DIRECT",
    }));
    const report = await runApiDiagnostics(fakeClientWith({ "/v1/rules": ok(raw) }), "t");
    const rules = probe(report, "/v1/rules");
    expect(rules.state).toBe("ok");
    expect(rules.summary).toBe("72 raw · 72 parsed · 0 invalid");
    expect(rules.rawRecords).toBe(72);
  });

  it("rules with 0 recognized rows is a parse-error, never '72 rules OK'", async () => {
    const raw = [{ foo: 1 }, { bar: 2 }];
    const report = await runApiDiagnostics(fakeClientWith({ "/v1/rules": ok(raw) }), "t");
    const rules = probe(report, "/v1/rules");
    expect(rules.state).toBe("parse-error");
    expect(rules.summary).toBe("解析失败");
    expect(rules.parseDetail).toContain("0 条被识别");
    expect(rules.rawRecords).toBe(2);
  });

  it("empty events is 'empty', not an error", async () => {
    const report = await runApiDiagnostics(fakeClientWith({ "/v1/events": ok({ events: [] }) }), "t");
    const events = probe(report, "/v1/events");
    expect(events.state).toBe("empty");
    expect(events.summary).toBe("0 raw · 0 parsed · 0 invalid");
  });

  it("events with drifted rows still reports parsed/invalid counts", async () => {
    const raw = {
      events: [
        { identifier: "a", date: 1700000000, type: "1", content: "warn" },
        { foo: 1 },
      ],
    };
    const report = await runApiDiagnostics(fakeClientWith({ "/v1/events": ok(raw) }), "t");
    const events = probe(report, "/v1/events");
    expect(events.state).toBe("ok");
    expect(events.summary).toBe("2 raw · 1 parsed · 1 invalid");
  });
});

describe("runApiDiagnostics · error taxonomy (T05)", () => {
  it("maps authentication / server-error / timeout / unsupported / api / connection", async () => {
    const report = await runApiDiagnostics(
      fakeClientWith({
        "/v1/outbound": err(new SurgeError("authentication", "401", { status: 401 })),
        "/v1/traffic": err(new SurgeError("server-error", "500", { status: 500 })),
        "/v1/requests/recent": err(new SurgeError("timeout", "408", { status: 408 })),
        "/v1/policy_groups": err(new SurgeError("unsupported", "404", { status: 404 })),
        "/v1/rules": err(new SurgeError("api", "400", { status: 400 })),
        "/v1/dns": err(new SurgeError("connection", "net")),
      }),
      "t",
    );
    expect(probe(report, "/v1/outbound").state).toBe("unauthorized");
    expect(probe(report, "/v1/traffic").state).toBe("server-error");
    expect(probe(report, "/v1/requests/recent").state).toBe("timeout");
    expect(probe(report, "/v1/policy_groups").state).toBe("unsupported");
    expect(probe(report, "/v1/rules").state).toBe("api-error");
    expect(probe(report, "/v1/dns").state).toBe("network-error");
  });
});

describe("registry parity (T01)", () => {
  it("rules adapter === normalizeRules (page parser)", () => {
    const adapter = ENDPOINT_REGISTRY.find((a) => a.endpoint === "/v1/rules")!;
    const raw = [
      { type: "DOMAIN", content: "x.com", policy: "DIRECT" },
      { rule_type: "GEOIP", rule: "CN", policy_name: "DIRECT" },
    ];
    const analysis = adapter.normalize(raw) as ReturnType<typeof analyzeRules>;
    expect(analysis.rules).toEqual(normalizeRules(raw));
  });

  it("events adapter === normalizeEvents (page parser)", () => {
    const adapter = ENDPOINT_REGISTRY.find((a) => a.endpoint === "/v1/events")!;
    const raw = { events: [{ identifier: "a", date: 1700000000, type: "1", content: "x" }] };
    const analysis = adapter.normalize(raw) as ReturnType<typeof normalizeEvents>;
    expect(analysis.events).toEqual(normalizeEvents(raw).events);
  });
});

describe("maskSensitive (T04)", () => {
  it("redacts header / cookie / token / api-key keys", () => {
    const masked = maskSensitive({
      requestHeader: "Authorization: Bearer abc123",
      responseHeader: "Set-Cookie: sid=secret",
      headers: { "X-API-Key": "k" },
      apiKey: "abc",
      cookie: "a=b",
      items: [{ token: "t" }],
    }) as Record<string, unknown>;
    expect(masked.requestHeader).toBe("••••••");
    expect(masked.responseHeader).toBe("••••••");
    expect(masked.headers).toBe("••••••");
    expect(masked.apiKey).toBe("••••••");
    expect(masked.cookie).toBe("••••••");
    expect((masked.items as Record<string, unknown>[])[0].token).toBe("••••••");
  });

  it("does NOT redact benign keys like monkey / authority", () => {
    const masked = maskSensitive({ monkey: 1, authority: "x" }) as Record<string, unknown>;
    expect(masked.monkey).toBe(1);
    expect(masked.authority).toBe("x");
  });

  it("scrubs Authorization / Cookie header lines inside string values", () => {
    const masked = maskSensitive({
      text: "Authorization: Bearer abc123\nCookie: sid=zzz",
    }) as Record<string, unknown>;
    const text = masked.text as string;
    expect(text).not.toContain("abc123");
    expect(text).not.toContain("sid=zzz");
    expect(text).toContain("******");
  });

  it("scrubs sensitive URL query params", () => {
    const masked = maskSensitive({
      url: "https://example.com/login?token=abc&key=def&access_token=zzz#frag",
    }) as Record<string, unknown>;
    const url = masked.url as string;
    expect(url).not.toContain("token=abc");
    expect(url).not.toContain("key=def");
    expect(url).not.toContain("access_token=zzz");
    expect(url).toContain("token=******");
  });

  it("truncates long arrays to a 3-item preview", () => {
    const masked = maskSensitive(Array.from({ length: 50 }, (_, i) => ({ id: i }))) as unknown[];
    expect(masked).toHaveLength(4);
    expect((masked[3] as Record<string, string>).__truncated).toContain("47 more records");
  });

  it("keeps short arrays intact", () => {
    const masked = maskSensitive([{ id: 1 }, { id: 2 }]);
    expect(masked).toHaveLength(2);
  });
});
