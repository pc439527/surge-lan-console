import type { SurgeClient } from "@/api/surge-client";
import { SurgeError } from "@/api/errors";
import { normalizeRules } from "@/api/normalize/rules";
import { normalizeDns } from "@/api/normalize/dns";

/**
 * API Diagnostics (OPTIMIZATION_PLAN Task 04, §17–19).
 *
 * Probes every known Surge endpoint with a plain GET, then classifies the
 * result into a state the UI can explain:
 *   ok · empty · parse-error · unsupported · unauthorized · network-error
 * Raw responses are summarized (counts/types) and the full structure is only
 * kept for the Diagnostics page, with sensitive keys masked before display.
 */

export type DiagnosticState =
  | "ok"
  | "empty"
  | "parse-error"
  | "unsupported"
  | "unauthorized"
  | "network-error";

export interface EndpointDiagnostic {
  endpoint: string;
  state: DiagnosticState;
  httpStatus: number | null;
  latencyMs: number | null;
  /** Short human summary, e.g. "63 requests" / "21 groups". */
  summary: string;
  responseType: string;
  parseDetail?: string;
  errorMessage?: string;
  /** Masked raw response (sensitive keys redacted). */
  raw?: unknown;
}

export interface DiagnosticsReport {
  connectionLabel: string;
  ranAt: number;
  endpoints: EndpointDiagnostic[];
}

/** Endpoints probed by Diagnostics, in display order. */
const PROBE_ENDPOINTS: { endpoint: string; describe: (raw: unknown) => string }[] = [
  { endpoint: "/v1/outbound", describe: describeOutbound },
  { endpoint: "/v1/traffic", describe: describeTraffic },
  { endpoint: "/v1/requests/recent", describe: describeRequests },
  { endpoint: "/v1/policy_groups", describe: describePolicyGroups },
  { endpoint: "/v1/rules", describe: describeRules },
  { endpoint: "/v1/dns", describe: describeDns },
  { endpoint: "/v1/modules", describe: describeModules },
  { endpoint: "/v1/scripting", describe: describeScripts },
  { endpoint: "/v1/events", describe: describeEvents },
];

export async function runApiDiagnostics(
  client: SurgeClient,
  connectionLabel: string,
  signal?: AbortSignal,
): Promise<DiagnosticsReport> {
  const results: EndpointDiagnostic[] = [];
  for (const { endpoint, describe } of PROBE_ENDPOINTS) {
    const probe = await client.probeEndpoint(endpoint, signal);
    results.push(classifyProbe(endpoint, probe.raw, probe.status, probe.latencyMs, probe.error, describe));
  }
  return { connectionLabel, ranAt: Date.now(), endpoints: results };
}

function classifyProbe(
  endpoint: string,
  raw: unknown,
  status: number | null,
  latencyMs: number | null,
  error: SurgeError | undefined,
  describe: (raw: unknown) => string,
): EndpointDiagnostic {
  const base = {
    endpoint,
    httpStatus: status,
    latencyMs,
    responseType: raw === null ? "none" : Array.isArray(raw) ? "array" : typeof raw,
  };

  if (error) {
    switch (error.kind) {
      case "authentication":
        return { ...base, state: "unauthorized", summary: "认证失败", errorMessage: error.message };
      case "unsupported":
        return { ...base, state: "unsupported", summary: "平台不支持", errorMessage: error.message };
      case "connection":
      case "timeout":
      case "browser-security":
        return { ...base, state: "network-error", summary: "无法连接", errorMessage: error.message };
      case "api":
        return { ...base, state: "unsupported", summary: `HTTP ${status}`, errorMessage: error.message };
    }
  }

  try {
    const summary = describe(raw);
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

// ── Per-endpoint summarizers ─────────────────────────────────

function describeOutbound(raw: unknown): string {
  const obj = asRecord(raw);
  return typeof obj.mode === "string" ? obj.mode : throwParse("Expected {mode}");
}

function describeTraffic(raw: unknown): string {
  const obj = asRecord(raw);
  const iface = obj.interface;
  if (iface && typeof iface === "object") {
    const names = Object.keys(iface as object);
    return names.length === 0 ? "0 interfaces" : `${names.length} interfaces`;
  }
  throwParse("Expected {interface}");
}

function describeRequests(raw: unknown): string {
  const obj = asRecord(raw);
  const list = obj.requests;
  if (Array.isArray(list)) return `${list.length} requests`;
  throwParse("Expected {requests: [...]}");
}

function describePolicyGroups(raw: unknown): string {
  const obj = asRecord(raw);
  const names = Object.keys(obj);
  if (names.length > 0 && typeof obj[names[0]] === "object") {
    return `${names.length} groups`;
  }
  if (names.length === 0) return "0 groups";
  throwParse("Expected {[groupName]: [...]}");
}

function describeRules(raw: unknown): string {
  const rules = normalizeRules(raw);
  return `${rules.length} rules`;
}

function describeDns(raw: unknown): string {
  const dns = normalizeDns(raw);
  return `${dns.dnsCache.length} cache · ${dns.local.length} local`;
}

function describeModules(raw: unknown): string {
  const obj = asRecord(raw);
  if (!Array.isArray(obj.enabled)) throwParse("Expected {enabled: [...]}");
  return `${obj.enabled.length} enabled`;
}

function describeScripts(raw: unknown): string {
  const obj = asRecord(raw);
  const list = obj.scripts;
  if (Array.isArray(list)) return `${list.length} scripts`;
  throwParse("Expected {scripts: [...]}");
}

function describeEvents(raw: unknown): string {
  const obj = asRecord(raw);
  const list = obj.events;
  if (Array.isArray(list)) return `${list.length} events`;
  throwParse("Expected {events: [...]}");
}

// ── Helpers ──────────────────────────────────────────────────

function asRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  throwParse("Expected object");
}

function throwParse(reason: string): never {
  throw new Error(reason);
}

const SENSITIVE_KEYS = /password|authorization|token|key|secret|credential/i;

/** Deep-redact sensitive values (OPTIMIZATION_PLAN §17) before display. */
export function maskSensitive(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => maskSensitive(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.test(k) ? "••••••" : maskSensitive(v, depth + 1);
    }
    return out;
  }
  return value;
}
