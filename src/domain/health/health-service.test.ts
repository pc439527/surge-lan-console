import { describe, expect, it } from "vitest";
import { healthStatusFromCapability, summarizeHealth } from "./health-service";

describe("health domain", () => {
  it("maps capability states without treating unsupported as healthy", () => {
    expect(healthStatusFromCapability("supported")).toBe("healthy");
    expect(healthStatusFromCapability("unsupported")).toBe("unsupported");
    expect(healthStatusFromCapability("unreachable")).toBe("unavailable");
  });

  it("reduces checks to the most actionable overall status", () => {
    const checks = [{ id: "api", label: "API", status: "healthy" as const, latencyMs: 12, detail: "ok", checkedAt: 1 }, { id: "rules", label: "Rules", status: "unsupported" as const, latencyMs: null, detail: "unsupported", checkedAt: 1 }];
    expect(summarizeHealth(checks, 1)).toMatchObject({ status: "degraded", healthy: 1, total: 2 });
  });
});
