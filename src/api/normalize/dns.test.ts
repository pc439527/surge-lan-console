import { describe, expect, it } from "vitest";
import { normalizeDns, normalizeDnsExpiry, normalizeDnsTimeCost } from "./dns";
import { SurgeError } from "@/api/errors";

describe("normalizeDns", () => {
  it("parses dnsCache entries", () => {
    const dns = normalizeDns({
      dnsCache: [{ domain: "apple.com", data: ["17.1.1.1"], server: "223.5.5.5", path: "SYSTEM → DIRECT", timeCost: 12, expiresTime: 9_999_999_999 }],
      local: [],
    });
    expect(dns.dnsCache).toHaveLength(1);
    expect(dns.dnsCache[0].domain).toBe("apple.com");
    expect(dns.dnsCache[0].data).toEqual(["17.1.1.1"]);
    expect(dns.dnsCache[0].timeCost).toBe(12);
    expect(dns.dnsCache[0].expiresTime).toBe(9_999_999_999_000);
  });

  it("parses local records", () => {
    const dns = normalizeDns({ dnsCache: [], local: [{ domain: "nas.local", data: "192.168.50.2", source: "hosts", server: null, comment: "test" }] });
    expect(dns.local).toHaveLength(1);
    expect(dns.local[0].domain).toBe("nas.local");
  });

  it("tolerates missing optional fields (tvOS differences)", () => {
    const dns = normalizeDns({ dnsCache: [{ domain: "x.com" }] });
    expect(dns.dnsCache[0].server).toBeUndefined();
    expect(dns.dnsCache[0].expiresTime).toBeUndefined();
    expect(dns.dnsCache[0].data).toEqual([]);
  });

  it("accepts missing local", () => {
    const dns = normalizeDns({ dnsCache: [] });
    expect(dns.local).toEqual([]);
  });

  it("throws when neither key exists", () => {
    expect(() => normalizeDns({ foo: 1 })).toThrow(SurgeError);
  });

  it("throws for null", () => {
    expect(() => normalizeDns(null)).toThrow(SurgeError);
  });
});

describe("DNS unit normalization", () => {
  it("converts sub-second timeCost values to milliseconds", () => {
    expect(normalizeDnsTimeCost(0.014217)).toBeCloseTo(14.217, 3);
    expect(normalizeDnsTimeCost(0.025105)).toBeCloseTo(25.105, 3);
  });

  it("preserves values already expressed as milliseconds", () => {
    expect(normalizeDnsTimeCost(12)).toBe(12);
    expect(normalizeDnsTimeCost(0)).toBe(0);
  });

  it("normalizes epoch seconds and epoch milliseconds", () => {
    expect(normalizeDnsExpiry(1_800_000_000, 1_700_000_000_000)).toBe(1_800_000_000_000);
    expect(normalizeDnsExpiry(1_800_000_000_000, 1_700_000_000_000)).toBe(1_800_000_000_000);
  });

  it("normalizes relative TTL seconds", () => {
    const now = 1_700_000_000_000;
    expect(normalizeDnsExpiry(300, now)).toBe(now + 300_000);
  });

  it("drops ambiguous expiry values instead of showing a false expired state", () => {
    expect(normalizeDnsExpiry(50_000_000, 1_700_000_000_000)).toBeUndefined();
  });
});
