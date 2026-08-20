import { z } from "zod";
import { parseOrThrow, requestItemSchema } from "./schemas";
import { analyzeRules } from "./normalize/rules";
import { normalizeDns } from "./normalize/dns";
import { normalizeEvents } from "./normalize/events";

/**
 * Endpoint Adapter Registry (v0.2.1, T01).
 *
 * ONE parser per endpoint, shared by the pages and Diagnostics:
 *
 *   HTTP → probeEndpoint → adapter.normalize(raw) → summarize
 *                                        │
 *                                        └─ the same function SurgeClient
 *                                           calls for the real page
 *
 * Diagnostics must NEVER parse independently — "Diagnostics OK" is only
 * meaningful if the page would render the same payload. Every adapter's
 * `normalize` therefore IS the page's parser (rules/events/dns reuse the
 * exported normalizers; requests reuse the exact Zod schema the client runs).
 *
 * `normalize` throws a SurgeError on unrecognized structure — Diagnostics
 * maps that to the "parse-error" state, pages to their error view.
 */
export interface EndpointAdapter<T = unknown> {
  /** Surge HTTP API path, e.g. "/v1/rules". */
  endpoint: string;
  /** Same normalizer the page / SurgeClient uses. Throws SurgeError when the shape is unrecognized. */
  normalize: (raw: unknown) => T;
  /** Short human summary, e.g. "72 raw · 72 parsed · 0 invalid". */
  summarize(data: T): string;
}

/** Gives each inline adapter its concrete view-model type for summarize(). */
function adapter<T>(a: EndpointAdapter<T>): EndpointAdapter<T> {
  return a;
}

/** Probed by Diagnostics, in display order. */
export const ENDPOINT_REGISTRY: EndpointAdapter<unknown>[] = [
  adapter({
    endpoint: "/v1/outbound",
    normalize: (raw) => {
      const obj = asRecord(raw);
      if (typeof obj.mode !== "string") throwParse("Expected {mode}");
      return { mode: obj.mode };
    },
    summarize: (data) => data.mode,
  }),
  adapter({
    endpoint: "/v1/traffic",
    normalize: (raw) => {
      const obj = asRecord(raw);
      const iface = obj.interface;
      if (iface && typeof iface === "object") return { names: Object.keys(iface) };
      throwParse("Expected {interface}");
    },
    summarize: (data) => (data.names.length === 0 ? "0 interfaces" : `${data.names.length} interfaces`),
  }),
  adapter({
    endpoint: "/v1/requests/recent",
    // Same validation as SurgeClient.getRecentRequests (requestItemSchema).
    normalize: (raw) => {
      const obj = asRecord(raw);
      const requests = parseOrThrow(z.array(requestItemSchema), obj.requests ?? [], "/v1/requests/recent");
      return { requests };
    },
    summarize: (data) => `${data.requests.length} requests`,
  }),
  adapter({
    endpoint: "/v1/policy_groups",
    normalize: (raw) => {
      const obj = asRecord(raw);
      const names = Object.keys(obj);
      if (names.length > 0 && typeof obj[names[0]] === "object") return { groups: names };
      if (names.length === 0) return { groups: [] };
      throwParse("Expected {[groupName]: [...]}");
    },
    summarize: (data) => (data.groups.length === 0 ? "0 groups" : `${data.groups.length} groups`),
  }),
  adapter({
    endpoint: "/v1/rules",
    normalize: analyzeRules,
    summarize: (data) => `${data.rawCount} raw · ${data.validCount} parsed · ${data.invalidCount} invalid`,
  }),
  adapter({
    endpoint: "/v1/dns",
    normalize: normalizeDns,
    summarize: (data) => `${data.dnsCache.length} cache · ${data.local.length} local`,
  }),
  adapter({
    endpoint: "/v1/modules",
    normalize: (raw) => {
      const obj = asRecord(raw);
      if (!Array.isArray(obj.enabled)) throwParse("Expected {enabled: [...]}");
      return { enabled: obj.enabled as string[] };
    },
    summarize: (data) => `${data.enabled.length} enabled`,
  }),
  adapter({
    endpoint: "/v1/scripting",
    normalize: (raw) => {
      const obj = asRecord(raw);
      if (!Array.isArray(obj.scripts)) throwParse("Expected {scripts: [...]}");
      return { scripts: obj.scripts as unknown[] };
    },
    summarize: (data) => `${data.scripts.length} scripts`,
  }),
  adapter({
    endpoint: "/v1/events",
    normalize: normalizeEvents,
    summarize: (data) => `${data.rawCount} raw · ${data.validCount} parsed · ${data.invalidCount} invalid`,
  }),
];

function asRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  throwParse("Expected object");
}

function throwParse(reason: string): never {
  throw new Error(reason);
}
