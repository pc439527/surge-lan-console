import { describe, expect, it } from "vitest";
import { normalizeDns } from "./dns";
import { SurgeError } from "@/api/errors";

describe("normalizeDns", () => {
  it("parses dnsCache entries", () => {
    const dns = normalizeDns({
      dnsCache: [{ domain: "apple.com", data: ["17.1.1.1"], server: "223.5.5.5", path: "SYSTEM → DIRECT", timeCost: 12, expiresTime: 9999999999 }],
      local: [],
    });
    expect(dns.dnsCache).toHaveLength(1);
    expect(dns.dnsCache[0].domain).toBe("apple.com");
    expect(dns.dnsCache[0].data).toEqual(["17.1.1.1"]);
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
