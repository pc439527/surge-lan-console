import { describe, expect, it } from "vitest";
import { healthFromCapability, healthStatusFromCapability, summarizeHealth, SLOW_ENDPOINT_MS } from "./health-service";
import type { CapabilityReport } from "@/api/capability";

describe("health domain (P0-4)", () => {
  it("maps capability states: unsupported → N/A (platform difference, NOT an anomaly)", () => {
    expect(healthStatusFromCapability("supported")).toBe("healthy");
    expect(healthStatusFromCapability("unsupported")).toBe("na");
    expect(healthStatusFromCapability("parse-error")).toBe("warning");
    expect(healthStatusFromCapability("unreachable")).toBe("unavailable");
    expect(healthStatusFromCapability("unauthorized")).toBe("unavailable");
    expect(healthStatusFromCapability("unknown")).toBe("unknown");
  });

  it("never degrades overall health because a platform lacks an endpoint (N/A)", () => {
    const checks = [
      { id: "api", label: "API", status: "healthy" as const, latencyMs: 12, detail: "ok", checkedAt: 1 },
      { id: "modules", label: "Modules", status: "na" as const, latencyMs: null, detail: "platform gap", checkedAt: 1 },
    ];
    expect(summarizeHealth(checks, 1)).toMatchObject({ status: "healthy", healthy: 1, total: 2 });
  });

  it("flags warning when a reachable endpoint cannot be parsed", () => {
    const checks = [
      { id: "api", label: "API", status: "healthy" as const, latencyMs: 12, detail: "ok", checkedAt: 1 },
      { id: "rules", label: "Rules", status: "warning" as const, latencyMs: null, detail: "parse error", checkedAt: 1 },
    ];
    expect(summarizeHealth(checks, 1)).toMatchObject({ status: "warning", healthy: 1 });
  });

  it("unavailable outranks warning outranks healthy", () => {
    const warningChecks = [
      { id: "api", label: "API", status: "healthy" as const, latencyMs: 10, detail: "ok", checkedAt: 1 },
      { id: "x", label: "X", status: "warning" as const, latencyMs: null, detail: "w", checkedAt: 1 },
      { id: "y", label: "Y", status: "unavailable" as const, latencyMs: null, detail: "down", checkedAt: 1 },
    ];
    expect(summarizeHealth(warningChecks, 1).status).toBe("unavailable");
  });

  it("derives the report directly from a capability probe", () => {
    const report: CapabilityReport = {
      platform: "unknown",
      platformDetected: true,
      latencyMs: 8,
      probedAt: 1234,
      probes: {
        "/v1/traffic": { endpoint: "/v1/traffic", status: "supported", latencyMs: 20 },
        "/v1/modules": { endpoint: "/v1/modules", status: "unsupported", latencyMs: null },
        "/v1/rules": { endpoint: "/v1/rules", status: "supported", latencyMs: 14 },
        "/v1/policy_groups": { endpoint: "/v1/policy_groups", status: "supported", latencyMs: 9 },
      },
      features: {
        // Full probe outcome — only Modules is a normal platform gap.
        traffic: "supported",
        requests: "supported",
        policies: "supported",
        dns: "supported",
        rules: "supported",
        modules: "unsupported",
        scripts: "supported",
        events: "supported",
      },
    };
    const summary = healthFromCapability(report);
    expect(summary.checkedAt).toBe(1234);
    const api = summary.checks.find((c) => c.id === "api");
    expect(api?.status).toBe("healthy");
    expect(api?.latencyMs).toBe(8);
    const modules = summary.checks.find((c) => c.id === "modules");
    expect(modules?.status).toBe("na");
    expect(modules?.label).toBe("Modules");
    const rules = summary.checks.find((c) => c.id === "rules");
    expect(rules?.latencyMs).toBe(14);
    // Overall: an N/A check must NOT downgrade the result.
    expect(summary.status).toBe("healthy");
  });

  it("marks a supported but very slow endpoint as warning", () => {
    const slow = SLOW_ENDPOINT_MS + 250;
    const report: CapabilityReport = {
      platform: "tvos",
      platformDetected: true,
      latencyMs: 15,
      probedAt: 4567,
      probes: {
        "/v1/dns": { endpoint: "/v1/dns", status: "supported", latencyMs: slow },
      },
      features: {
        traffic: "supported",
        requests: "supported",
        policies: "supported",
        dns: "supported",
        rules: "supported",
        modules: "unsupported",
        scripts: "supported",
        events: "supported",
      },
    };

    const summary = healthFromCapability(report);
    const dns = summary.checks.find((check) => check.id === "dns");
    expect(dns?.status).toBe("warning");
    expect(dns?.detail).toContain("响应较慢");
    expect(summary.status).toBe("warning");
  });

  it("marks the base API probe as warning when latency crosses the threshold", () => {
    const report: CapabilityReport = {
      platform: "unknown",
      platformDetected: true,
      latencyMs: SLOW_ENDPOINT_MS + 1,
      probedAt: 7890,
      probes: {},
      features: {
        traffic: "unknown",
        requests: "unknown",
        policies: "unknown",
        dns: "unknown",
        rules: "unknown",
        modules: "unknown",
        scripts: "unknown",
        events: "unknown",
      },
    };

    const summary = healthFromCapability(report);
    expect(summary.checks.find((check) => check.id === "api")?.status).toBe("warning");
    expect(summary.status).toBe("warning");
  });
});