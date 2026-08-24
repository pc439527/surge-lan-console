import { describe, expect, it } from "vitest";
import { connectorTrafficSchema, trafficSchema } from "./schemas";
import { normalizeEpoch } from "./normalize";

const FULL_PAYLOAD = {
  startTime: 1_755_000_000,
  interface: {
    pdp_ip0: {
      outCurrentSpeed: 7_320,
      in: 9_000_000_000,
      inCurrentSpeed: 1_630,
      outMaxSpeed: 760_720,
      out: 3_500_000_000,
      inMaxSpeed: 37_450_000,
    },
    en0: {
      outCurrentSpeed: 0,
      in: 0,
      inCurrentSpeed: 0,
      outMaxSpeed: 0,
      out: 0,
      inMaxSpeed: 0,
    },
  },
  connector: {
    DIRECT: {
      outCurrentSpeed: 100,
      in: 500,
      inCurrentSpeed: 200,
      outMaxSpeed: 300,
      out: 400,
      inMaxSpeed: 600,
    },
  },
};

describe("trafficSchema (raw GET /v1/traffic)", () => {
  it("parses a complete payload without losing fields", () => {
    const parsed = trafficSchema.parse(FULL_PAYLOAD);
    expect(parsed.startTime).toBe(1_755_000_000);
    expect(parsed.interface.pdp_ip0.outCurrentSpeed).toBe(7_320);
    expect(parsed.interface.pdp_ip0.inMaxSpeed).toBe(37_450_000);
    expect(parsed.connector.DIRECT.in).toBe(500);
    expect(parsed.connector.DIRECT.out).toBe(400);
    expect(Object.keys(parsed.interface)).toHaveLength(2);
  });

  it("defaults missing speed/cumulative fields to 0 (platform drift safety)", () => {
    const parsed = trafficSchema.parse({
      startTime: 1_755_000_000,
      interface: { pdp_ip0: { in: 1_000, outCurrentSpeed: 50 } },
      connector: { DIRECT: {} },
    });
    const iface = parsed.interface.pdp_ip0;
    expect(iface.inCurrentSpeed).toBe(0);
    expect(iface.outMaxSpeed).toBe(0);
    expect(iface.inMaxSpeed).toBe(0);
    expect(iface.out).toBe(0);
    expect(iface.in).toBe(1_000);
    expect(iface.outCurrentSpeed).toBe(50);
    // Empty connector stat object also survives with zeroed fields.
    expect(parsed.connector.DIRECT.in).toBe(0);
    expect(parsed.connector.DIRECT.outCurrentSpeed).toBe(0);
  });

  it("defaults missing interface/connector maps to empty objects", () => {
    const parsed = trafficSchema.parse({ startTime: 1_755_000_000 });
    expect(parsed.interface).toEqual({});
    expect(parsed.connector).toEqual({});
  });

  it("accepts startTime in seconds or milliseconds without coercion", () => {
    expect(trafficSchema.parse({ startTime: 1_755_000_000 }).startTime).toBe(1_755_000_000);
    expect(trafficSchema.parse({ startTime: 1_755_000_000_000 }).startTime).toBe(1_755_000_000_000);
    // Defaults to 0 when absent — consumers must not crash.
    expect(trafficSchema.parse({}).startTime).toBe(0);
  });

  it("rejects non-object payloads loudly (parseOrThrow surfaces friendly errors)", () => {
    expect(() => trafficSchema.parse(null)).toThrow();
    expect(() => trafficSchema.parse("nope")).toThrow();
    expect(() => trafficSchema.parse(42)).toThrow();
  });

  it("connectorTrafficSchema keeps the optional statistics array when present", () => {
    const parsed = connectorTrafficSchema.parse({
      outCurrentSpeed: 1,
      in: 2,
      inCurrentSpeed: 3,
      outMaxSpeed: 4,
      out: 5,
      inMaxSpeed: 6,
      statistics: [{ rttcur: 8, rttvar: 2, srtt: 40, txpackets: 9, txretransmitpackets: 1 }],
    });
    expect(parsed.statistics).toHaveLength(1);
    expect(parsed.statistics![0].srtt).toBe(40);
  });

  it("normalizes epoch-seconds startTime to ms (Surge uses unix seconds)", () => {
    expect(normalizeEpoch(1_755_000_000)).toBe(1_755_000_000_000);
    expect(normalizeEpoch(1_755_000_000_000)).toBe(1_755_000_000_000);
  });
});
