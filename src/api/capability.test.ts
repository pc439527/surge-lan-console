import { describe, expect, it, vi } from "vitest";
import {
  CAPABILITY_ENDPOINTS,
  classifyEndpointProbe,
  detectPlatform,
  isFeatureUnsupported,
  probeCapabilities,
  supportedFeatures,
  unsupportedFeatures,
  type CapabilityFeature,
  type CapabilityReport,
} from "./capability";
import { SurgeError, type SurgeErrorKind } from "./errors";
import type { SurgeClient } from "./surge-client";

function okProbe(raw: unknown, latencyMs = 12) {
  return { status: 200, latencyMs, raw, error: undefined };
}

function errProbe(kind: SurgeErrorKind, status?: number) {
  return {
    status: status ?? null,
    latencyMs: 5,
    raw: null,
    error: new SurgeError(kind, "boom", status !== undefined ? { status } : undefined),
  };
}

describe("classifyEndpointProbe", () => {
  it("classifies a healthy probe as supported", () => {
    const probe = classifyEndpointProbe("/v1/traffic", okProbe({ interface: { en0: {} } }));
    expect(probe.status).toBe("supported");
    expect(probe.latencyMs).toBe(12);
  });

  it("classifies 404/405 as unsupported (platform gap)", () => {
    expect(classifyEndpointProbe("/v1/modules", errProbe("unsupported", 404)).status).toBe("unsupported");
    expect(classifyEndpointProbe("/v1/scripting", errProbe("unsupported", 405)).status).toBe("unsupported");
  });

  it("classifies a parse-error kind distinctly from unsupported (P0-3)", () => {
    expect(classifyEndpointProbe("/v1/rules", errProbe("parse-error")).status).toBe("parse-error");
  });

  it("classifies 401/403 as unauthorized — NOT a platform gap", () => {
    expect(classifyEndpointProbe("/v1/traffic", errProbe("authentication", 401)).status).toBe("unauthorized");
  });

  it("classifies timeout/network as unreachable — feature stays visible", () => {
    expect(classifyEndpointProbe("/v1/traffic", errProbe("timeout")).status).toBe("unreachable");
    expect(classifyEndpointProbe("/v1/traffic", errProbe("connection")).status).toBe("unreachable");
    expect(classifyEndpointProbe("/v1/traffic", errProbe("server-error", 503)).status).toBe("unreachable");
  });

  it("classifies a 200 with an unparseable payload as parse-error (unknown ≠ empty)", () => {
    expect(classifyEndpointProbe("/v1/rules", okProbe({ foo: "bar" })).status).toBe("parse-error");
  });

  it("keeps latency from the probe", () => {
    const probe = classifyEndpointProbe("/v1/outbound", okProbe({ mode: "rule" }, 42));
    expect(probe).toMatchObject({ status: "supported", latencyMs: 42 });
  });
});

function featuresOf(partial: Partial<Record<CapabilityFeature, CapabilityReport["features"][CapabilityFeature]>>) {
  const all = {} as Record<CapabilityFeature, CapabilityReport["features"][CapabilityFeature]>;
  for (const f of ["traffic", "requests", "policies", "dns", "rules", "modules", "scripts", "events"] as const) {
    all[f] = "unknown";
  }
  return { ...all, ...partial };
}

describe("detectPlatform (P0-2 — platform is display-only, never guessed from a few endpoints)", () => {
  it("detects macOS only when the FULL probed surface is supported", () => {
    expect(
      detectPlatform(
        featuresOf({ traffic: "supported", requests: "supported", policies: "supported", dns: "supported", rules: "supported", modules: "supported", scripts: "supported", events: "supported" }),
      ),
    ).toBe("macos");
  });

  it("returns unknown when ANY endpoint is missing — Apple TV / iOS share the same core", () => {
    // This is the exact tvOS profile from the user's screenshots:
    // rules + scripts supported, modules NOT — previously mislabeled "iOS".
    expect(
      detectPlatform(featuresOf({ rules: "supported", scripts: "supported", modules: "unsupported", traffic: "supported" })),
    ).toBe("unknown");
    // A single transient failure must not flip the platform either.
    expect(detectPlatform(featuresOf({ traffic: "unreachable" }))).toBe("unknown");
    expect(detectPlatform(featuresOf({}))).toBe("unknown");
  });
});

describe("probeCapabilities", () => {
  function stubClient(overrides: Record<string, unknown>) {
    const probeEndpoint = vi.fn(async (endpoint: string) => {
      const value = overrides[endpoint];
      if (value === undefined) return errProbe("unsupported", 404);
      if (value && typeof value === "object" && "raw" in value && "error" in value) {
        return value as { status: number | null; latencyMs: number | null; raw: unknown; error?: unknown };
      }
      if (value instanceof SurgeError) return errProbe(value.kind, value.status);
      return okProbe(value);
    });
    return { probeEndpoint } as unknown as SurgeClient;
  }

  const fullPayloads: Record<string, unknown> = {
    "/v1/outbound": { mode: "rule" },
    "/v1/traffic": { interface: { en0: {} } },
    "/v1/requests/recent": { requests: [] },
    "/v1/policy_groups": { Proxy: [{ name: "HK 01", typeDescription: "ss" }] },
    "/v1/dns": { dnsCache: [], local: [] },
    "/v1/rules": [{ type: "DOMAIN", content: "x.com", policy: "DIRECT" }],
    "/v1/modules": { enabled: [], available: [] },
    "/v1/scripting": { scripts: [] },
    "/v1/events": { events: [] },
  };

  it("builds a full supported report for a macOS-like device", async () => {
    const report = await probeCapabilities(stubClient(fullPayloads));
    expect(report.platform).toBe("macos");
    expect(report.platformDetected).toBe(true);
    for (const f of ["traffic", "requests", "policies", "dns", "rules", "modules", "scripts", "events"] as const) {
      expect(report.features[f]).toBe("supported");
    }
    expect(report.latencyMs).toBe(12);
    expect(Object.keys(report.probes)).toHaveLength(CAPABILITY_ENDPOINTS.length);
  });

  it("flags unsupported endpoints per capability WITHOUT mislabeling the platform (tvOS profile)", async () => {
    const payloads = {
      ...fullPayloads,
      "/v1/rules": errProbe("unsupported", 404),
      "/v1/modules": errProbe("unsupported", 404),
      "/v1/scripting": errProbe("unsupported", 404),
    };
    const report = await probeCapabilities(stubClient(payloads));
    // Rules/scripts/modules gate nothing about the platform — see P0-2.
    expect(report.platform).toBe("unknown");
    expect(report.features.rules).toBe("unsupported");
    expect(report.features.modules).toBe("unsupported");
    expect(report.features.scripts).toBe("unsupported");
    expect(report.features.traffic).toBe("supported");
    expect(unsupportedFeatures(report)).toEqual(["rules", "modules", "scripts"]);
    expect(supportedFeatures(report)).toContain("traffic");
  });

  it("honours a manual platform override", async () => {
    const report = await probeCapabilities(stubClient(fullPayloads), "tvos");
    expect(report.platform).toBe("tvos");
    expect(report.platformDetected).toBe(false);
  });

  it("marks an unrecognized 200 payload as parse-error without hiding the feature", async () => {
    const payloads = { ...fullPayloads, "/v1/rules": { unexpected: true } };
    const report = await probeCapabilities(stubClient(payloads));
    expect(report.features.rules).toBe("parse-error");
    expect(isFeatureUnsupported(report, "rules")).toBe(false);
  });

  it("keeps the whole report usable when an endpoint is unreachable", async () => {
    const payloads = { ...fullPayloads, "/v1/dns": errProbe("timeout") };
    const report = await probeCapabilities(stubClient(payloads));
    expect(report.features.dns).toBe("unreachable");
    expect(report.platform).toBe("unknown"); // transient failure ≠ full mac surface
    expect(isFeatureUnsupported(report, "dns")).toBe(false);
  });

  it("drops latency when /v1/outbound is not supported", async () => {
    const payloads = { ...fullPayloads, "/v1/outbound": errProbe("unsupported", 404) };
    const report = await probeCapabilities(stubClient(payloads));
    expect(report.latencyMs).toBeNull();
  });
});
