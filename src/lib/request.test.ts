import { describe, expect, it } from "vitest";
import type { RequestItem } from "@/api/types";
import {
  classifyRequestProtocol,
  noteTag,
  parseHostPort,
  parseRequestHeaders,
  policyLatencyMs,
  policyLatencyView,
  requestHostLabel,
  requestProtocol,
  requestSourceAddress,
  requestTargetAddress,
} from "./request";

function req(overrides: Partial<RequestItem>): RequestItem {
  return {
    id: 1,
    URL: "",
    method: "",
    policyName: "",
    rule: "",
    status: "Completed",
    startDate: 0,
    completedDate: 0,
    sourceAddress: "",
    sourcePort: 0,
    outBytes: 0,
    inBytes: 0,
    failed: false,
    completed: true,
    modified: false,
    replica: false,
    remoteAddress: "",
    localAddress: "",
    inCurrentSpeed: 0,
    outCurrentSpeed: 0,
    inMaxSpeed: 0,
    outMaxSpeed: 0,
    pid: 0,
    setupCompletedDate: 0,
    ...overrides,
  };
}

describe("classifyRequestProtocol (Request Inspector V2)", () => {
  it("trusts the explicit API protocol field above everything else", () => {
    const info = classifyRequestProtocol(
      req({ protocol: "QUIC", method: "UDP", URL: "https://edge.example.com/", remoteAddress: "1.2.3.4:443" }),
    );
    expect(info.app).toBe("QUIC");
    expect(info.transport).toBe("UDP");
    expect(info.explicit).toBe(true);
  });

  it("uses request.method when Surge reports the app protocol there", () => {
    const info = classifyRequestProtocol(req({ method: "HTTPS", URL: "https://api.example.com/x", remoteAddress: "1.2.3.4:443" }));
    expect(info.app).toBe("HTTPS");
    expect(info.transport).toBe("TCP");
  });

  it("classifies UDP on :53 as DNS (Apple TV port-map rows)", () => {
    const info = classifyRequestProtocol(
      req({ method: "UDP", remoteAddress: "203.0.113.53:53 (Port Map)" }),
    );
    expect(info.app).toBe("DNS");
    expect(info.transport).toBe("UDP");
    expect(info.destPort).toBe(53);
  });

  it("classifies TCP on :53 as the DNS-over-TCP fallback, not DoT", () => {
    const info = classifyRequestProtocol(req({ method: "TCP", destPort: 53 }));
    expect(info.app).toBe("DNS");
    expect(info.transport).toBe("TCP");
  });

  it("keeps a plain UDP row as UDP — never guesses QUIC from :443", () => {
    const info = classifyRequestProtocol(req({ method: "UDP", destPort: 443 }));
    expect(info.app).toBe("UDP");
    expect(info.transport).toBe("UDP");
  });

  it("never promotes :853 to DoT/DoQ", () => {
    const info = classifyRequestProtocol(req({ method: "TCP", destPort: 853 }));
    expect(info.app).toBe("TCP");
    expect(info.transport).toBe("TCP");
  });

  it("method QUIC → QUIC over UDP", () => {
    const info = classifyRequestProtocol(req({ method: "QUIC", URL: "https://www.gstatic.com/generate_204" }));
    expect(info.app).toBe("QUIC");
    expect(info.transport).toBe("UDP");
  });

  it("HTTP verb falls back to the URL scheme for HTTP vs HTTPS", () => {
    expect(classifyRequestProtocol(req({ method: "GET", URL: "https://a.com/x" })).app).toBe("HTTPS");
    expect(classifyRequestProtocol(req({ method: "POST", URL: "http://a.com/x" })).app).toBe("HTTP");
    expect(classifyRequestProtocol(req({ method: "GET", URL: "wss://a.com/x" })).app).toBe("WSS");
  });

  it("uses the URL scheme when method carries no protocol signal", () => {
    expect(classifyRequestProtocol(req({ URL: "https://a.com/x" })).app).toBe("HTTPS");
    expect(classifyRequestProtocol(req({ URL: "ws://a.com/x" })).app).toBe("WS");
  });

  it("falls back to a port-only hint for bare addresses", () => {
    const info = classifyRequestProtocol(req({ URL: "203.0.113.53:53" }));
    expect(info.app).toBe("DNS");
    expect(info.explicit).toBe(false);
  });

  it("resolves STUN from :3478 without Surge saying so", () => {
    const info = classifyRequestProtocol(req({ method: "UDP", remoteAddress: "203.0.113.127:3478" }));
    expect(info.app).toBe("STUN");
    expect(info.transport).toBe("UDP");
  });

  it("returns UNKNOWN when no signal exists", () => {
    const info = classifyRequestProtocol(req({ URL: "not-a-url" }));
    expect(info.app).toBe("UNKNOWN");
    expect(info.transport).toBeNull();
    expect(info.explicit).toBe(false);
  });
});

describe("parseHostPort", () => {
  it("parses host:port and strips Surge annotations", () => {
    expect(parseHostPort("203.0.113.53:53 (Port Map)")).toEqual({ host: "203.0.113.53", port: 53 });
  });

  it("parses hostnames and bracketed IPv6", () => {
    expect(parseHostPort("example.com:443")).toEqual({ host: "example.com", port: 443 });
    expect(parseHostPort("[::1]:8080")).toEqual({ host: "::1", port: 8080 });
  });

  it("returns a bare host with null port", () => {
    expect(parseHostPort("192.168.50.10")).toEqual({ host: "192.168.50.10", port: null });
  });

  it("rejects empty input", () => {
    expect(parseHostPort("")).toBeNull();
    expect(parseHostPort(undefined)).toBeNull();
  });
});

describe("display address helpers", () => {
  it("requestHostLabel prefers hostname, then URL host, then remote host", () => {
    expect(requestHostLabel(req({ hostname: "api.example.com", URL: "https://x/", remoteAddress: "1.2.3.4:443" }))).toBe("api.example.com");
    expect(requestHostLabel(req({ URL: "https://github.com/x" }))).toBe("github.com");
    expect(requestHostLabel(req({ remoteAddress: "203.0.113.53:53 (Port Map)" }))).toBe("203.0.113.53");
    expect(requestHostLabel(req({}))).toBe("—");
  });

  it("requestTargetAddress returns the cleaned remote address", () => {
    expect(requestTargetAddress(req({ remoteAddress: "203.0.113.53:53 (Port Map)" }))).toBe("203.0.113.53:53");
    expect(requestTargetAddress(req({ hostname: "a.com", destPort: 443 }))).toBe("a.com:443");
  });

  it("requestSourceAddress joins address and port", () => {
    expect(requestSourceAddress(req({ sourceAddress: "192.168.50.20", sourcePort: 51496 }))).toBe("192.168.50.20:51496");
    expect(requestSourceAddress(req({}))).toBe("—");
  });
});

describe("parseRequestHeaders", () => {
  it("parses a request line and header rows", () => {
    const parsed = parseRequestHeaders([
      "GET /openapi.json HTTP/1.1",
      "Host: docs.example.com",
      "User-Agent: ExampleClient/1.0",
      "Accept: application/json",
    ].join("\n"));
    expect(parsed.requestLine).toBe("GET /openapi.json HTTP/1.1");
    expect(parsed.headers).toEqual([
      { name: "Host", value: "docs.example.com" },
      { name: "User-Agent", value: "ExampleClient/1.0" },
      { name: "Accept", value: "application/json" },
    ]);
  });

  it("folds continuation lines into the previous header", () => {
    const parsed = parseRequestHeaders("X-Long: a\n  b\nY: 1");
    expect(parsed.headers[0]).toEqual({ name: "X-Long", value: "a b" });
  });

  it("returns empty structure for missing input", () => {
    expect(parseRequestHeaders(undefined)).toEqual({ requestLine: null, headers: [] });
  });
});

describe("noteTag", () => {
  it("extracts the bracket tag", () => {
    expect(noteTag("[Rule] Rule evaluating...")).toEqual({ tag: "Rule", text: "Rule evaluating..." });
  });

  it("keeps untagged lines intact", () => {
    expect(noteTag("plain note")).toEqual({ tag: null, text: "plain note" });
  });
});

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
    expect(policyLatencyView({ ok: true, latency: 42 })).toEqual({ tone: "success", label: "42ms" });
  });

  it("orange between 100 and 250ms", () => {
    expect(policyLatencyView({ ok: true, latency: 168 })).toEqual({ tone: "warning", label: "168ms" });
  });

  it("red above 250ms", () => {
    expect(policyLatencyView({ ok: true, latency: 420 })).toEqual({ tone: "danger", label: "420ms" });
  });

  it("gray for timeout and unknown", () => {
    expect(policyLatencyView({ ok: false, latency: "Timeout" })).toEqual({ tone: "muted", label: "超时" });
    expect(policyLatencyView({ ok: true, latency: null })).toEqual({ tone: "success", label: "可达" });
    expect(policyLatencyView(undefined)).toEqual({ tone: "muted", label: "—" });
  });
});