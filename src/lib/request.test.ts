import { describe, expect, it } from "vitest";
import {
  policyLatencyMs,
  policyLatencyView,
  requestProtocol,
} from "./request";

describe("requestProtocol", () => {
  it("derives the scheme from a request URL", () => {
    expect(requestProtocol("https://api.github.com/x")).toBe("https");
    expect(requestProtocol("http://example.com")).toBe("http");
    expect(requestProtocol("ws://stream.example.com")).toBe("ws");
    expect(requestProtocol("wss://stream.example.com")).toBe("wss");
  });

  it("falls back to unknown for malformed URLs", () => {
    expect(requestProtocol("not-a-url")).toBe("unknown");
    expect(requestProtocol("")).toBe("unknown");
  });
});

describe("policyLatencyMs", () => {
  it("accepts numeric latency", () => {
    expect(policyLatencyMs({ ok: true, latency: 42 })).toBe(42);
  });

  it("parses string latency", () => {
    expect(policyLatencyMs({ ok: true, latency: "168" })).toBe(168);
  });

  it("returns null for failed or unknown entries", () => {
    expect(policyLatencyMs({ ok: false, latency: "Timeout" })).toBeNull();
    expect(policyLatencyMs(undefined)).toBeNull();
    expect(policyLatencyMs({ ok: true, latency: "Timeout" })).toBeNull();
  });
});

describe("policyLatencyView (§6.3 grading)", () => {
  it("green under 100ms", () => {
    expect(policyLatencyView({ ok: true, latency: 42 })).toEqual({
      tone: "success",
      label: "42ms",
    });
  });

  it("orange between 100 and 250ms", () => {
    expect(policyLatencyView({ ok: true, latency: 168 })).toEqual({
      tone: "warning",
      label: "168ms",
    });
  });

  it("red above 250ms", () => {
    expect(policyLatencyView({ ok: true, latency: 420 })).toEqual({
      tone: "danger",
      label: "420ms",
    });
  });

  it("gray for timeout and unknown", () => {
    expect(policyLatencyView({ ok: false, latency: "Timeout" })).toEqual({
      tone: "muted",
      label: "超时",
    });
    expect(policyLatencyView({ ok: true, latency: null })).toEqual({ tone: "success", label: "可达" });
    expect(policyLatencyView(undefined)).toEqual({ tone: "muted", label: "—" });
  });
});
