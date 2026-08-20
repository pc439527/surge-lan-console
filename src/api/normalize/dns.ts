import { SurgeError } from "@/api/errors";
import type { DnsCacheEntry, DnsLocalEntry } from "@/api/types";

/**
 * /v1/dns normalizer (OPTIMIZATION_PLAN Task 06, §20–24).
 *
 * Handles the known platform differences:
 *   - dnsCache entries may be missing fields (tvOS builds)
 *   - expiresTime may be epoch-seconds, epoch-ms, TTL-seconds or absent —
 *     the UI decides how to render it, we only keep the raw value.
 *   - local records may be absent entirely.
 *
 * Unknown ≠ empty: a response without dnsCache/local keys is a parse error,
 * not "no records".
 */
export interface NormalizedDns {
  dnsCache: DnsCacheEntry[];
  local: DnsLocalEntry[];
}

export function normalizeDns(raw: unknown): NormalizedDns {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new SurgeError("unsupported", "/v1/dns 返回了无法识别的结构。");
  }
  const rec = raw as Record<string, unknown>;
  const hasCache = "dnsCache" in rec;
  const hasLocal = "local" in rec;
  if (!hasCache && !hasLocal) {
    throw new SurgeError("unsupported", "/v1/dns 缺少 dnsCache / local 字段。");
  }
  return {
    dnsCache: normalizeCacheEntries(rec.dnsCache),
    local: normalizeLocalEntries(rec.local),
  };
}

function normalizeCacheEntries(raw: unknown): DnsCacheEntry[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new SurgeError("unsupported", "/v1/dns 的 dnsCache 字段不是数组。");
  }
  return raw.map((entry) => {
    const e = entry as Record<string, unknown> | null;
    return {
      domain: typeof e?.domain === "string" ? e.domain : "",
      data: Array.isArray(e?.data) ? e.data.map(String) : [],
      server: typeof e?.server === "string" ? e.server : undefined,
      path: typeof e?.path === "string" ? e.path : undefined,
      timeCost: typeof e?.timeCost === "number" ? e.timeCost : undefined,
      expiresTime: typeof e?.expiresTime === "number" ? e.expiresTime : undefined,
      raw: e,
    };
  });
}

function normalizeLocalEntries(raw: unknown): DnsLocalEntry[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new SurgeError("unsupported", "/v1/dns 的 local 字段不是数组。");
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
