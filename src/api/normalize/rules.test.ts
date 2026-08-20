import { describe, expect, it } from "vitest";
import { analyzeRules, extractRuleList, normalizeRules } from "./rules";
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

describe("normalizeRules · field-drift calibration (T02)", () => {
  it("maps alternate field names (rule_type / rule / policy_name)", () => {
    const [rule] = normalizeRules([{ rule_type: "DOMAIN-SUFFIX", rule: "apple.com", policy_name: "DIRECT" }]);
    expect(rule).toMatchObject({ type: "DOMAIN-SUFFIX", content: "apple.com", policy: "DIRECT" });
  });

  it("maps ruleType / payload / target aliases", () => {
    const [rule] = normalizeRules([{ ruleType: "IP-CIDR", payload: "10.0.0.0/8", target: "Proxy" }]);
    expect(rule).toMatchObject({ type: "IP-CIDR", content: "10.0.0.0/8", policy: "Proxy" });
  });

  it("keeps a FINAL rule (empty content) as valid", () => {
    const [rule] = normalizeRules([{ type: "FINAL", content: "", policy: "Proxy" }]);
    expect(rule.type).toBe("FINAL");
    expect(rule.policy).toBe("Proxy");
  });

  it("throws when N>0 raw rows are all unrecognized (no fake '— — —' rows)", () => {
    const raw = [
      { foo: "1" },
      { bar: "2" },
    ];
    expect(() => normalizeRules(raw)).toThrow(SurgeError);
    expect(() => normalizeRules(raw)).toThrow(/0 条被识别/);
  });

  it("analyzeRules reports raw/parsed/invalid counts", () => {
    const analysis = analyzeRules([
      { type: "DOMAIN", content: "x.com", policy: "DIRECT" },
      { rule_type: "GEOIP", rule: "CN", policy_name: "DIRECT" },
      { junk: true },
      null,
    ]);
    expect(analysis).toMatchObject({ rawCount: 4, validCount: 2, invalidCount: 2 });
    expect(analysis.rules).toHaveLength(2);
  });

  it("empty rule list is a legitimate empty result, not an error", () => {
    const analysis = analyzeRules([]);
    expect(analysis).toMatchObject({ rawCount: 0, validCount: 0, invalidCount: 0 });
    expect(analysis.rules).toEqual([]);
    expect(analyzeRules({ rules: [] }).rules).toEqual([]);
  });

  it("extractRuleList is the same extractor for both shapes", () => {
    const list = [{ type: "FINAL", content: "", policy: "Proxy" }];
    expect(extractRuleList(list)).toBe(list);
    expect(extractRuleList({ rules: list })).toBe(list);
  });
});
