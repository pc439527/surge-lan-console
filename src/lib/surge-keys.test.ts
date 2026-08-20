import { describe, expect, it } from "vitest";
import { surgeKeys } from "./surge-keys";

describe("surgeKeys multi-instance isolation", () => {
  it("produces different keys for different connections", () => {
    const a = surgeKeys.rules("conn-a");
    const b = surgeKeys.rules("conn-b");
    expect(a).not.toEqual(b);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it("namespaces every feature", () => {
    const id = "conn-1";
    const all = [
      surgeKeys.traffic(id),
      surgeKeys.activeRequests(id),
      surgeKeys.recentRequests(id),
      surgeKeys.events(id),
      surgeKeys.outbound(id),
      surgeKeys.policyGroups(id),
      surgeKeys.dns(id),
      surgeKeys.modules(id),
      surgeKeys.scripts(id),
      surgeKeys.profile(id),
      surgeKeys.rules(id),
    ];
    const unique = new Set(all.map((k) => JSON.stringify(k)));
    expect(unique.size).toBe(all.length);
    for (const key of all) {
      expect(key[0]).toBe("surge");
      expect(key[1]).toBe(id);
    }
  });

  it("reserves __demo__ as the demo-mode namespace (null maps to it)", () => {
    expect(JSON.stringify(surgeKeys.dns(null))).toBe(JSON.stringify(surgeKeys.dns("__demo__")));
    // A real connection id can never collide with the reserved demo namespace.
    expect(JSON.stringify(surgeKeys.dns("conn-1"))).not.toBe(JSON.stringify(surgeKeys.dns("__demo__")));
  });
});