import { describe, expect, it } from "vitest";
import {
  hasRuntimeBuildChanged,
  parseRuntimeBuildInfo,
  shortCommit,
  type BuildInfo,
  type RuntimeBuildInfo,
} from "./version";

const current: BuildInfo = {
  version: "0.5.0",
  commit: "abcdef1",
  branch: "main",
  buildTime: "2026-08-26T10:00:00.000Z",
  environment: "production",
};

function runtime(overrides: Partial<RuntimeBuildInfo> = {}): RuntimeBuildInfo {
  return {
    version: "0.5.0",
    commit: "abcdef1",
    branch: "main",
    buildTime: "2026-08-26T10:00:00.000Z",
    environment: "production",
    ...overrides,
  };
}

describe("runtime build identity", () => {
  it("accepts short and full forms of the same git commit", () => {
    expect(hasRuntimeBuildChanged(current, runtime({ commit: "abcdef1234567890" }))).toBe(false);
  });

  it("detects a different known git commit", () => {
    expect(hasRuntimeBuildChanged(current, runtime({ commit: "1234567" }))).toBe(true);
  });

  it("falls back to build time when commit metadata is unknown", () => {
    const unknownCurrent = { ...current, commit: "unknown" };
    expect(
      hasRuntimeBuildChanged(
        unknownCurrent,
        runtime({ commit: "unknown", buildTime: "2026-08-26T10:01:00.000Z" }),
      ),
    ).toBe(true);
  });

  it("falls back to version when both commit and build time are unavailable", () => {
    const weakCurrent = { ...current, commit: "unknown", buildTime: "" };
    expect(
      hasRuntimeBuildChanged(
        weakCurrent,
        runtime({ commit: "unknown", buildTime: "", version: "0.6.0" }),
      ),
    ).toBe(true);
  });

  it("parses the emitted version.json shape", () => {
    expect(
      parseRuntimeBuildInfo({
        version: "0.5.0",
        commit: "abc1234",
        branch: "main",
        build: "2026-08-26T10:00:00.000Z",
        environment: "production",
      }),
    ).toEqual({
      version: "0.5.0",
      commit: "abc1234",
      branch: "main",
      buildTime: "2026-08-26T10:00:00.000Z",
      environment: "production",
    });
  });

  it("rejects invalid payloads and normalizes compact SHAs", () => {
    expect(parseRuntimeBuildInfo(null)).toBeNull();
    expect(parseRuntimeBuildInfo([])).toBeNull();
    expect(shortCommit("abcdef123456")).toBe("abcdef1");
    expect(shortCommit("unknown")).toBe("unknown");
  });
});
