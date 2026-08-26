import { SurgeError } from "@/api/errors";
import type { DnsCacheEntry, DnsLocalEntry } from "@/api/types";

/**
 * /v1/dns normalizer (OPTIMIZATION_PLAN Task 06, §20–24).
 *
 * Known platform differences:
 *   - dnsCache entries may be missing fields (tvOS builds)
 *   - timeCost is commonly exposed as seconds on tvOS/macOS, while some
 *     builds return millisecond-like values; normalize it to milliseconds.
 *   - expiresTime may be epoch-seconds, epoch-ms, TTL-seconds or absent;
 *     normalize recognized values to an absolute epoch-millisecond timestamp.
 *   - local records may be absent entirely.
 *
 * Unknown ≠ empty: a response without dnsCache/local keys is a parse error,
 * not "no records".
 */
export interface NormalizedDns {
  dnsCache: DnsCacheEntry[];
  local: DnsLocalEntry[];
}

const EPOCH_SECONDS_MIN = 1_000_000_000;
const EPOCH_MILLISECONDS_MIN = 1_000_000_000_000;
const MAX_RELATIVE_TTL_SECONDS = 31 * 24 * 60 * 60;

export function normalizeDns(raw: unknown): NormalizedDns {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new SurgeError("parse-error", "/v1/dns 返回了无法识别的结构。");
  }
  const rec = raw as Record<string, unknown>;
  const hasCache = "dnsCache" in rec;
  const hasLocal = "local" in rec;
  if (!hasCache && !hasLocal) {
    throw new SurgeError("parse-error", "/v1/dns 缺少 dnsCache / local 字段。");
  }
  return {
    dnsCache: normalizeCacheEntries(rec.dnsCache),
    local: normalizeLocalEntries(rec.local),
  };
}

/**
 * Convert Surge DNS query duration into milliseconds.
 *
 * Real-device captures commonly expose sub-second values such as 0.014217,
 * which represent seconds (14.217ms). Integer / larger values are preserved as
 * milliseconds to stay compatible with builds that already expose ms.
 */
export function normalizeDnsTimeCost(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return value > 0 && value < 1 ? value * 1000 : value;
}

/**
 * Convert a recognized Surge expiry representation to epoch milliseconds.
 * Unknown / ambiguous values are discarded instead of being rendered as an
 * incorrect "expired" state.
 */
export function normalizeDnsExpiry(value: unknown, nowMs: number = Date.now()): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;

  if (value >= EPOCH_MILLISECONDS_MIN) return value;
  if (value >= EPOCH_SECONDS_MIN) return value * 1000;

  if (value <= MAX_RELATIVE_TTL_SECONDS) return nowMs + value * 1000;

  return undefined;
}

function normalizeCacheEntries(raw: unknown): DnsCacheEntry[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new SurgeError("parse-error", "/v1/dns 的 dnsCache 字段不是数组。");
  }
  return raw.map((entry) => {
    const e = entry as Record<string, unknown> | null;
    return {
      domain: typeof e?.domain === "string" ? e.domain : "",
      data: Array.isArray(e?.data) ? e.data.map(String) : [],
      server: typeof e?.server === "string" ? e.server : undefined,
      path: typeof e?.path === "string" ? e.path : undefined,
      timeCost: normalizeDnsTimeCost(e?.timeCost),
      expiresTime: normalizeDnsExpiry(e?.expiresTime),
      raw: e,
    };
  });
}

function normalizeLocalEntries(raw: unknown): DnsLocalEntry[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new SurgeError("parse-error", "/v1/dns 的 local 字段不是数组。");
  }
  return raw.map((entry) => {
    const e = entry as Record<string, unknown> | null;
    return {
      domain: typeof e?.domain === "string" ? e.domain : null,
      data: typeof e?.data === "string" ? e.data : null,
      source: typeof e?.source === "string" ? e.source : null,
      server: typeof e?.server === "string" ? e.server : null,
      comment: typeof e?.comment === "string" ? e.comment : null,
      raw: e,
    };
  });
}
