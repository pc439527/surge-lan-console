import type { SurgeClient } from "@/api/surge-client";
import type { SurgeError } from "@/api/errors";
import { ENDPOINT_REGISTRY, type EndpointAdapter } from "@/api/registry";

/**
 * API Diagnostics (v0.2.1, T01/T04/T05 — replaces the hand-rolled probe list).
 *
 * Drives the SAME parser the real pages use: every endpoint is normalized
 * through its registry adapter (rules → analyzeRules, events → normalizeEvents,
 * requests → requestItemSchema, ...), so "Diagnostics OK" implies the page
 * can render the payload. It never parses independently.
 *
 * Error taxonomy (T05): 401/403 → unauthorized · 404/405 → unsupported ·
 * 408/timeout → timeout · 5xx → server-error · network → network-error ·
 * normalize-throw → parse-error.
 *
 * Raw responses are masked (T04): sensitive keys (headers/cookies/tokens) are
 * redacted, string values are scrubbed for "Authorization: …", "token=…" and
 * sensitive URL query params, and long arrays are truncated to a preview.
 */
export type DiagnosticState =
  | "ok"
  | "empty"
  | "parse-error"
  | "unsupported"
  | "unauthorized"
  | "network-error"
  | "timeout"
  | "server-error"
  | "api-error";

export interface EndpointDiagnostic {
  endpoint: string;
  state: DiagnosticState;
  httpStatus: number | null;
  latencyMs: number | null;
  /** Short human summary, e.g. "72 raw · 72 parsed · 0 invalid". */
  summary: string;
  responseType: string;
  parseDetail?: string;
  errorMessage?: string;
  /** Masked raw response (sensitive keys + values redacted, arrays sampled). */
  raw?: unknown;
  /** Number of records in the raw response (for "N records · preview first 3"). */
  rawRecords?: number;
}

export interface DiagnosticsReport {
  connectionLabel: string;
  ranAt: number;
  endpoints: EndpointDiagnostic[];
}

export async function runApiDiagnostics(
  client: SurgeClient,
  connectionLabel: string,
  signal?: AbortSignal,
): Promise<DiagnosticsReport> {
  const results: EndpointDiagnostic[] = [];
  for (const adapter of ENDPOINT_REGISTRY) {
    const probe = await client.probeEndpoint(adapter.endpoint, signal);
    results.push(classifyProbe(adapter, probe.raw, probe.status, probe.latencyMs, probe.error));
  }
  return { connectionLabel, ranAt: Date.now(), endpoints: results };
}

function classifyProbe(
  adapter: EndpointAdapter<unknown>,
  raw: unknown,
  status: number | null,
  latencyMs: number | null,
  error: SurgeError | undefined,
): EndpointDiagnostic {
  const base = {
    endpoint: adapter.endpoint,
    httpStatus: status,
    latencyMs,
    responseType: raw === null ? "none" : Array.isArray(raw) ? "array" : typeof raw,
    rawRecords: countRecords(raw),
  };

  if (error) {
    switch (error.kind) {
      case "authentication":
        return { ...base, state: "unauthorized", summary: "认证失败", errorMessage: error.message };
      case "unsupported":
        return { ...base, state: "unsupported", summary: "平台不支持", errorMessage: error.message };
      case "server-error":
        return { ...base, state: "server-error", summary: `HTTP ${status}`, errorMessage: error.message };
      case "timeout":
        return { ...base, state: "timeout", summary: "请求超时", errorMessage: error.message };
      case "connection":
      case "browser-security":
        return { ...base, state: "network-error", summary: "无法连接", errorMessage: error.message };
      case "api":
        return { ...base, state: "api-error", summary: `HTTP ${status}`, errorMessage: error.message };
    }
  }

  try {
    // The adapter's normalize IS the page's parser — never a second one.
    const data = adapter.normalize(raw);
    const summary = adapter.summarize(data);
    const isEmpty = summary.startsWith("0 ");
    return { ...base, state: isEmpty ? "empty" : "ok", summary, raw: maskSensitive(raw) };
  } catch (parseError) {
    return {
      ...base,
      state: "parse-error",
      summary: "解析失败",
      parseDetail: parseError instanceof Error ? parseError.message : "Unknown parse error",
      raw: maskSensitive(raw),
    };
  }
}

/** First array field's length — used for the "N records" raw preview note. */
function countRecords(raw: unknown): number | undefined {
  if (Array.isArray(raw)) return raw.length;
  if (raw && typeof raw === "object") {
    for (const value of Object.values(raw as Record<string, unknown>)) {
      if (Array.isArray(value)) return value.length;
    }
  }
  return undefined;
}

// ── Redaction (T04) ────────────────────────────────────────────

/** Long arrays are sampled — the Diagnostics page shows "N records · preview first 3". */
const MAX_ARRAY_PREVIEW = 3;

/**
 * Keys matching these tokens are redacted entirely. Substring match on purpose:
 * it covers camelCase ("requestHeader", "responseHeader") and multi-word keys.
 */
const SENSITIVE_KEY_RE = /password|passwd|authorization|token|secret|credential|cookie|header|api[-_]?key/i;
/** Short tokens ("key", "auth") only match as whole words to avoid "monkey" / "authority". */
const SENSITIVE_BOUNDED_KEY_RE = /(^|[^a-z0-9_-])key([^a-z0-9_-]|$)|(^|[^a-z0-9_-])auth([^a-z0-9_-]|$)/i;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_RE.test(key) || SENSITIVE_BOUNDED_KEY_RE.test(key);
}

/**
 * Deep-redact a raw response before it ever reaches the browser:
 *  - sensitive keys → "••••••"
 *  - string values → header lines, token=…, key=… and sensitive URL query
 *    params scrubbed
 *  - arrays longer than MAX_ARRAY_PREVIEW → first-3 sample + truncation marker
 */
export function maskSensitive(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    const masked = value.map((v) => maskSensitive(v, depth + 1));
    if (masked.length > MAX_ARRAY_PREVIEW) {
      return [
        ...masked.slice(0, MAX_ARRAY_PREVIEW),
        { __truncated: `${masked.length - MAX_ARRAY_PREVIEW} more records omitted` },
      ];
    }
    return masked;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSensitiveKey(k) ? "••••••" : maskSensitive(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") return maskStringValue(value);
  return value;
}

/** Scrub credentials embedded in strings: "Authorization: Bearer x", "token=abc", "?key=…". */
function maskStringValue(value: string): string {
  let out = value;
  // Header lines: "Authorization: Bearer xyz" / "Cookie: a=b" / "Set-Cookie: …"
  out = out.replace(
    /(authorization|proxy-authorization|set-cookie|cookie|x-api-key|api-key)\s*[:=]\s*[^\r\n]*/gi,
    (_match, name: string) => `${name}: ******`,
  );
  // Sensitive URL query params: ?token=… &key=… &access_token=…
  out = out.replace(
    /([?&](?:access_token|auth|token|key|password|secret|api_key|apikey|credential)=)[^&#\s]*/gi,
    "$1******",
  );
  // Bare token=value / secret=value inside arbitrary text
  out = out.replace(
    /\b(?:token|secret|password|passwd|credential|api[-_]?key)\s*=\s*[^\s&,;"']+/gi,
    (match) => match.replace(/=.*$/, "=******"),
  );
  return out;
}
