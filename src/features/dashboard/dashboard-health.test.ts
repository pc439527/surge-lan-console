import { describe, expect, it } from "vitest";
import type { CapabilityReport, CapabilityStatus } from "@/api/capability";
import { ENDPOINTS } from "@/api/endpoints";
import { buildDashboardHealth } from "./dashboard-health";

function makeReport(input: {
  outbound?: CapabilityStatus;
  traffic?: CapabilityStatus;
  dns?: CapabilityStatus;
  policies?: CapabilityStatus;
  latencies?: Partial<Record<string, number>>;
} = {}): CapabilityReport {
  const outbound = input.outbound ?? "supported";
  const traffic = input.traffic ?? "supported";
  const dns = input.dns ?? "supported";
  const policies = input.policies ?? "supported";
  const latency = (endpoint: string) => input.latencies?.[endpoint] ?? 20;
  return {
    platform: "unknown",
    platformDetected: true,
    probes: {
      [ENDPOINTS.outbound]: { endpoint: ENDPOINTS.outbound, status: outbound, latencyMs: latency(ENDPOINTS.outbound) },
      [ENDPOINTS.traffic]: { endpoint: ENDPOINTS.traffic, status: traffic, latencyMs: latency(ENDPOINTS.traffic) },
      [ENDPOINTS.dns]: { endpoint: ENDPOINTS.dns, status: dns, latencyMs: latency(ENDPOINTS.dns) },
      [ENDPOINTS.policyGroups]: { endpoint: ENDPOINTS.policyGroups, status: policies, latencyMs: latency(ENDPOINTS.policyGroups) },
    },
    features: {
      traffic,
      requests: "supported",
      policies,
      dns,
      rules: "supported",
      modules: "unsupported",
      scripts: "supported",
      events: "supported",
    },
    latencyMs: outbound === "supported" ? latency(ENDPOINTS.outbound) : null,
    probedAt: 1,
  };
}

describe("dashboard health", () => {
  it("treats unsupported platform capabilities as N/A rather than failures", () => {
    const health = buildDashboardHealth(makeReport({ dns: "unsupported" }));
    expect(health.items.find((item) => item.key === "dns")).toMatchObject({ text: "N/A", tone: "muted" });
    expect(health.label).toBe("运行正常");
  });

  it("makes outbound probe failure a connection-level error", () => {
    const health = buildDashboardHealth(makeReport({ outbound: "unreachable" }));
    expect(health.apiReady).toBe(false);
    expect(health.label).toBe("连接需要检查");
    expect(health.tone).toBe("danger");
  });

  it("reports feature parse errors without hiding the healthy base API", () => {
    const health = buildDashboardHealth(makeReport({ policies: "parse-error" }));
    expect(health.apiReady).toBe(true);
    expect(health.label).toBe("部分服务异常");
    expect(health.items.find((item) => item.key === "policies")?.text).toBe("解析异常");
  });

  it("surfaces slow supported endpoints as performance warnings", () => {
    const health = buildDashboardHealth(makeReport({ latencies: { [ENDPOINTS.dns]: 1_500 } }));
    expect(health.label).toBe("运行偏慢");
    expect(health.items.find((item) => item.key === "dns")).toMatchObject({ tone: "warning", text: "较慢 1500ms" });
  });

  it("stays neutral while capability probes are not available", () => {
    const health = buildDashboardHealth(undefined);
    expect(health.apiReady).toBe(false);
    expect(health.label).toBe("状态探测中");
    expect(health.items.every((item) => item.status === "unknown")).toBe(true);
  });
});
