import { describe, expect, it } from "vitest";
import { findFastestPolicy } from "./fastest-policy";
describe("findFastestPolicy", () => {
  it("selects the lowest reachable group member", () => {
    expect(findFastestPolicy(["A", "B", "C"], { A: { latency: 180 }, B: { latency: 42 }, C: { latency: "Timeout" } })).toEqual({ name: "B", latencyMs: 42 });
  });
  it("excludes unavailable and out-of-group results", () => {
    expect(findFastestPolicy(["A"], { A: { ok: false, latency: 10 }, Other: { latency: 1 } })).toBeNull();
  });
});
