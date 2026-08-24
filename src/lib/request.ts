import type { PolicyTestEntry, RequestItem } from "@/api/types";
import { latencyTone } from "./latency";

/**
 * Request protocol model (Request Inspector V2).
 *
 * Surge does NOT always give us a URL with a scheme: Apple TV / iOS rows for
 * raw TCP/UDP/DNS connections carry `method: "UDP"` and
 * `remoteAddress: "203.0.113.53:53 (Port Map)"` instead of an http(s) URL.
 * Classifying by `new URL(url).protocol` alone therefore flakes to UNKNOWN.
 *
 * We distinguish two concepts:
 *  - app protocol — what the connection IS (HTTP / HTTPS / DNS / QUIC / STUN / WS / WSS)
 *  - transport     — the transport it rides on (TCP / UDP)
 *
 * Classification priority (never guess transports we were not told):
 *   1. explicit API `protocol` field (newer Surge builds)
 *   2. `request.method` (Surge uses "HTTPS" / "UDP" / "TCP" / "QUIC" here)
 *   3. URL scheme (https/http/ws/wss)
 *   4. destination port feature (53 → DNS, 3478/5349 → STUN)
 *   5. UNKNOWN
 *
 * Rules of thumb we deliberately do NOT apply:
 *   - `:443` UDP is never auto-promoted to QUIC — only Surge explicitly
 *     saying QUIC (protocol or method) yields a QUIC badge.
 *   - `:853` is never auto-promoted to DoT/DoQ.
 */

export type RequestAppProtocol =
  | "HTTP"
  | "HTTPS"
  | "TCP"
  | "UDP"
  | "QUIC"
  | "DNS"
  | "STUN"
  | "WS"
  | "WSS"
  | "UNKNOWN";

export type RequestTransport = "TCP" | "UDP" | null;

export interface RequestProtocolInfo {
  /** Application/service protocol shown in the badge. */
  app: RequestAppProtocol;
  /** Transport protocol when derivable (e.g. DNS rides UDP). */
  transport: RequestTransport;
  /** Uppercase badge label — equals `app`. */
  label: string;
  /** Destination port feature used by the classifier, if any. */
  destPort: number | null;
  /** True when Surge told us the protocol explicitly (protocol/method/scheme). */
  explicit: boolean;
}

/** App protocols Surge may report directly. */
const KNOWN_APP_PROTOCOLS: ReadonlySet<string> = new Set([
  "HTTP",
  "HTTPS",
  "TCP",
  "UDP",
  "QUIC",
  "DNS",
  "STUN",
  "WS",
  "WSS",
]);

/** Standard HTTP verbs — a request.method in this set is a real HTTP call. */
const HTTP_METHODS: ReadonlySet<string> = new Set([
  "GET",
  "POST",
  "HEAD",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "CONNECT",
  "TRACE",
]);

const URL_SCHEME_APPS: Record<string, RequestAppProtocol> = {
  https: "HTTPS",
  http: "HTTP",
  ws: "WS",
  wss: "WSS",
};

/** Transport inferred from an app protocol (never guessed from ports alone). */
function transportFor(app: RequestAppProtocol): RequestTransport {
  switch (app) {
    case "HTTP":
    case "HTTPS":
    case "WS":
    case "WSS":
    case "TCP":
      return "TCP";
    case "UDP":
    case "DNS":
    case "STUN":
    case "QUIC":
      return "UDP";
    default:
      return null;
  }
}

/** Port features that identify an app protocol with high confidence. */
const PORT_APP_HINTS: Record<number, RequestAppProtocol> = {
  53: "DNS",
  3478: "STUN",
  5349: "STUN",
};

/**
 * Strip Surge annotations such as " (Port Map)" from an address string so
 * `host:port` parsing is not confused — annotations never carry data.
 */
function stripAddressAnnotation(value: string): string {
  return value.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/**
 * Extract `{ host, port }` from a "host:port" address. Handles plain IPv4,
 * bracketed IPv6 and hostnames; a bare address yields `port: null`.
 * Returns null for empty/whitespace input.
 */
export function parseHostPort(raw: string | undefined | null): { host: string; port: number | null } | null {
  const text = stripAddressAnnotation((raw ?? "").trim());
  if (!text) return null;
  const match = /^(\[[^\]]+\]|[^:]+):(\d{1,5})$/.exec(text);
  if (match) {
    const port = Number.parseInt(match[2], 10);
    if (port > 0 && port <= 65535) {
      const host = match[1].startsWith("[") ? match[1].slice(1, -1) : match[1];
      return { host, port };
    }
  }
  return { host: text, port: null };
}

/** Destination port of a request: explicit field → remoteAddress → URL → raw address. */
export function requestDestPort(request: Pick<RequestItem, "destPort" | "remoteAddress" | "URL">): number | null {
  if (request.destPort != null && request.destPort > 0 && request.destPort <= 65535) {
    return request.destPort;
  }
  const fromRemote = parseHostPort(request.remoteAddress);
  if (fromRemote?.port != null) return fromRemote.port;
  try {
    const parsed = new URL(request.URL);
    // Only trust URL ports when the URL actually carries a hostname —
    // "203.0.113.53:53" parses with an empty host and must not be skipped.
    if (parsed.hostname && parsed.port) {
      const port = Number.parseInt(parsed.port, 10);
      if (port > 0 && port <= 65535) return port;
    }
  } catch {
    /* not a URL — fall through to the raw-address parse below */
  }
  const fromRaw = parseHostPort(request.URL);
  if (fromRaw?.port != null) return fromRaw.port;
  return null;
}

/**
 * Unified protocol classification.
 *
 * Priority: explicit API `protocol` → `method` → URL scheme → port feature.
 * The explicit/method paths only promote (e.g. UDP on :53 → DNS); they never
 * demote or invent QUIC/DoT/DoQ from a port.
 */
export function classifyRequestProtocol(
  request: Pick<RequestItem, "protocol" | "method" | "URL" | "destPort" | "remoteAddress">,
): RequestProtocolInfo {
  const destPort = requestDestPort(request);
  const portHint = destPort != null ? PORT_APP_HINTS[destPort] : undefined;

  // 1) Explicit API protocol field — Surge's own word is final.
  const explicit = (request.protocol ?? "").trim().toUpperCase();
  if (explicit && KNOWN_APP_PROTOCOLS.has(explicit)) {
    return infoFor(explicit as RequestAppProtocol, destPort, portHint, true);
  }

  // 2) request.method — Surge reports "HTTPS"/"UDP"/"TCP"/"QUIC" here on
  //    devices without the explicit protocol field.
  const method = (request.method ?? "").trim().toUpperCase();
  if (method && KNOWN_APP_PROTOCOLS.has(method)) {
    return infoFor(method as RequestAppProtocol, destPort, portHint, true);
  }

  // 2b) HTTP verb ("GET"/"POST"/…) — the URL decides HTTP vs HTTPS.
  if (method && HTTP_METHODS.has(method)) {
    const app = appFromUrl(request.URL) ?? "UNKNOWN";
    return { app, transport: transportFor(app), label: app, destPort, explicit: app !== "UNKNOWN" };
  }

  // 3) URL scheme.
  const schemeApp = appFromUrl(request.URL);
  if (schemeApp) {
    return { app: schemeApp, transport: transportFor(schemeApp), label: schemeApp, destPort, explicit: true };
  }

  // 4) Port feature — last resort, and only high-confidence hints (53, 3478).
  if (portHint) {
    return {
      app: portHint,
      transport: "UDP",
      label: portHint,
      destPort,
      explicit: false,
    };
  }

  // 5) Unknown.
  return { app: "UNKNOWN", transport: null, label: "UNKNOWN", destPort, explicit: false };
}

/** Apply an app protocol, refining UDP/TCP toward a port hint (53→DNS). */
function infoFor(
  app: RequestAppProtocol,
  destPort: number | null,
  portHint: RequestAppProtocol | undefined,
  explicit: boolean,
): RequestProtocolInfo {
  // UDP on :53 is DNS traffic per Surge's own port-map rows; TCP on :53 is
  // the DNS-over-TCP fallback. 3478/5349 → STUN. Never refine TCP on 853.
  if ((app === "UDP" || app === "TCP") && portHint) {
    const transport = app === "UDP" ? "UDP" : "TCP";
    return { app: portHint, transport, label: portHint, destPort, explicit };
  }
  return { app, transport: transportFor(app), label: app, destPort, explicit };
}

function appFromUrl(url: string): RequestAppProtocol | null {
  try {
    const scheme = new URL(url).protocol.replace(":", "").toLowerCase();
    return URL_SCHEME_APPS[scheme] ?? null;
  } catch {
    return null;
  }
}

// ── Display helpers ─────────────────────────────────────────────

/** Leading hostname/IP shown in the host column & drawer header. */
export function requestHostLabel(
  request: Pick<RequestItem, "hostname" | "URL" | "remoteAddress">,
): string {
  if (request.hostname?.trim()) return request.hostname.trim();
  try {
    const host = new URL(request.URL).host;
    if (host) return host;
  } catch {
    /* not a URL */
  }
  const fromRemote = parseHostPort(request.remoteAddress);
  if (fromRemote?.host) return fromRemote.host;
  return request.URL || "—";
}

/** Full "host:port" target — prefer the remote address, else compose. */
export function requestTargetAddress(
  request: Pick<RequestItem, "hostname" | "URL" | "remoteAddress" | "destPort">,
): string {
  const cleaned = stripAddressAnnotation((request.remoteAddress ?? "").trim());
  if (cleaned) return cleaned;
  const host = requestHostLabel(request);
  const port = requestDestPort(request);
  return port != null && host !== "—" ? `${host}:${port}` : host;
}

/** "sourceAddress:sourcePort" for the source column. */
export function requestSourceAddress(
  request: Pick<RequestItem, "sourceAddress" | "sourcePort">,
): string {
  if (request.sourceAddress && request.sourcePort) return `${request.sourceAddress}:${request.sourcePort}`;
  return request.sourceAddress || "—";
}

// ── Request header parsing ──────────────────────────────────────

export interface ParsedHeader {
  name: string;
  value: string;
}

export interface ParsedRequestHeaders {
  /** First line, e.g. "GET /v1/outbound HTTP/1.1" — null when absent. */
  requestLine: string | null;
  headers: ParsedHeader[];
}

/**
 * Parse a raw Surge `requestHeader` block into a request line + header rows.
 * Malformed lines and folded (continuation) lines are handled gracefully.
 */
export function parseRequestHeaders(raw: string | undefined | null): ParsedRequestHeaders {
  if (!raw) return { requestLine: null, headers: [] };
  const lines = raw.split(/\r?\n/);
  const headers: ParsedHeader[] = [];
  let requestLine: string | null = null;
  for (const line of lines) {
    const text = line.trimEnd();
    if (!text) continue;
    if (requestLine === null && !text.includes(":") && !text.startsWith(" ")) {
      requestLine = text;
      continue;
    }
    if (text.startsWith(" ") || text.startsWith("\t")) {
      const last = headers[headers.length - 1];
      if (last) last.value = `${last.value} ${text.trim()}`;
      continue;
    }
    const colon = text.indexOf(":");
    if (colon > 0) {
      headers.push({ name: text.slice(0, colon).trim(), value: text.slice(colon + 1).trim() });
    }
  }
  return { requestLine, headers };
}

/** Extract `[Tag]` metadata from a Surge note line, e.g. "[Rule] evaluating…". */
export function noteTag(note: string): { tag: string | null; text: string } {
  const match = /^\[([^\]]+)\]\s*(.*)$/.exec(note.trim());
  if (match) return { tag: match[1].trim(), text: match[2] || match[1].trim() };
  return { tag: null, text: note.trim() };
}

// ── Legacy helpers ──────────────────────────────────────────────

/** Derive the scheme (http/https/ws/wss/…) from a request URL. */
export function requestProtocol(url: string): string {
  try {
    const scheme = new URL(url).protocol.replace(":", "").toLowerCase();
    return scheme || "unknown";
  } catch {
    return "unknown";
  }
}

/** Normalize a policy test latency to ms, or null when unknown/failed. */
export function policyLatencyMs(entry: PolicyTestEntry | undefined): number | null {
  if (!entry || entry.ok === false) return null;
  const raw = entry.latency;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export interface PolicyLatencyView {
  tone: "success" | "warning" | "danger" | "muted";
  label: string;
}

/** §6.3 grading: <100 green, 100–250 orange, >250 red, timeout/unknown gray. */
export function policyLatencyView(entry: PolicyTestEntry | undefined): PolicyLatencyView {
  const ms = policyLatencyMs(entry);
  if (ms === null) {
    // ok:false after a test reads as a timeout; an absent entry as unknown.
    if (entry?.ok === true) return { tone: "success", label: "可达" };
    return entry && entry.ok === false ? { tone: "muted", label: "超时" } : { tone: "muted", label: "—" };
  }
  return { tone: latencyTone(ms), label: `${Math.round(ms)}ms` };
}