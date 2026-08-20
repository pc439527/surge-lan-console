import { describe, expect, it } from "vitest";
import { normalizeRules } from "./rules";
import { SurgeError } from "@/api/errors";

describe("normalizeRules", () => {
  it("accepts a bare array", () => {
    const rules = normalizeRules([
      { type: "RULE-SET", content: "LAN", policy: "DIRECT" },
    ]);
    expect(rules).toHaveLength(1);
    expect(rules[0].type).toBe("RULE-SET");
  });

  it("accepts an envelope { rules: [...] }", () => {
    const rules = normalizeRules({ rules: [{ type: "DOMAIN", content: "x.com", policy: "Proxy" }] });
    expect(rules).toHaveLength(1);
    expect(rules[0].content).toBe("x.com");
  });

  it("keeps unknown fields in raw", () => {
    const rules = normalizeRules([{ type: "DOMAIN", content: "x.com", policy: "Proxy", newField: 42 }]);
    expect(rules[0].raw).toMatchObject({ newField: 42 });
  });

  it("throws for an invalid object", () => {
    expect(() => normalizeRules({ foo: "bar" })).toThrow(SurgeError);
  });

  it("throws for null", () => {
    expect(() => normalizeRules(null)).toThrow(SurgeError);
  });

  it("throws for a string", () => {
    expect(() => normalizeRules("nope")).toThrow(SurgeError);
  });
});
