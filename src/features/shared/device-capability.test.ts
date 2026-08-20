import { describe, expect, it } from "vitest";
import { resolveDeviceCapabilities } from "./device-capability";

describe("device capability model", () => {
  it("hides explicit unsupported APIs but keeps transient failures visible", () => {
    const c = resolveDeviceCapabilities({ platform: "tvos", platformDetected: true, probes: {}, latencyMs: null, probedAt: 1, features: { traffic: "supported", requests: "unknown", policies: "unreachable", dns: "supported", rules: "unsupported", modules: "unsupported", scripts: "unsupported", events: "supported" } });
    expect(c.features.modules).toBe(false);
    expect(c.features.requests).toBe(true);
    expect(c.reasons.modules).toContain("Apple TV");
  });
});
