import { describe, expect, it } from "vitest";
import { normalizeEpoch, normalizeDurationMs } from "./timestamp";

describe("normalizeEpoch", () => {
  it("treats unix-seconds as seconds and converts to ms", () => {
    expect(normalizeEpoch(1_700_000_000)).toBe(1_700_000_000_000);
  });

  it("treats unix-milliseconds as ms (unchanged)", () => {
    expect(normalizeEpoch(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  it("returns undefined for zero", () => {
    expect(normalizeEpoch(0)).toBeUndefined();
  });

  it("returns undefined for undefined / null / NaN", () => {
    expect(normalizeEpoch(undefined)).toBeUndefined();
    expect(normalizeEpoch(null)).toBeUndefined();
    expect(normalizeEpoch(Number.NaN)).toBeUndefined();
    expect(normalizeEpoch(Number.POSITIVE_INFINITY)).toBeUndefined();
  });

  it("returns undefined for out-of-range values", () => {
    expect(normalizeEpoch(1e15)).toBeUndefined();
    expect(normalizeEpoch(5_000_000_000_000_000)).toBeUndefined();
  });
});

describe("normalizeDurationMs", () => {
  it("computes duration between two epoch-seconds timestamps", () => {
    expect(normalizeDurationMs(1_700_000_000, 1_700_000_005)).toBe(5000);
  });

  it("handles mixed units (start seconds, end ms)", () => {
    expect(normalizeDurationMs(1_700_000_000, 1_700_000_005_000)).toBe(5000);
  });

  it("returns undefined when completed < start", () => {
    expect(normalizeDurationMs(1_700_000_005, 1_700_000_000)).toBeUndefined();
  });

  it("returns undefined when either value is invalid", () => {
    expect(normalizeDurationMs(undefined, 1_700_000_000)).toBeUndefined();
    expect(normalizeDurationMs(1_700_000_000, undefined)).toBeUndefined();
    expect(normalizeDurationMs(0, 1_700_000_000)).toBeUndefined();
    expect(normalizeDurationMs(1_700_000_000, Number.NaN)).toBeUndefined();
  });
});
