/**
 * Surge HTTP API Descriptor Registry (v0.6.0, P0-2).
 *
 * Single source of truth for every Surge endpoint this console knows about:
 * method, path, official platform availability, minimum build, response type
 * and — for probed endpoints — the EXACT parser that pages, API Diagnostics
 * and the Capability engine share.
 *
 * Consumers derive from this ONE table (never hand-maintained separately):
 *   - ENDPOINT_REGISTRY  (Diagnostics probe list)  → ./registry.ts
 *   - CAPABILITY_ENDPOINTS / ENDPOINT_FEATURE     → ./capability.ts
 *   - platforms / minVersion metadata              → future version-compat UI
 *
 * Parser rule: an adapter's `normalize` IS the page parser — "Diagnostics OK"
 * therefore guarantees the page would render the same payload. Unrecognized
 * 200 payloads THROW SurgeError("parse-error"), never "unsupported":
 * "unsupported" is reserved exclusively for HTTP 404/405 platform gaps.
 */
import { z } from "zod";
import { ENDPOINTS } from "./endpoints";
import { parseOrThrow, requestItemSchema, trafficSchema } from "./schemas";
import { analyzeRules } from "./normalize/rules";
import { normalizeDns } from "./normalize/dns";
import { normalizeEvents } from "./normalize/events";

/** Official Surge platforms (display-only — see capability.ts detectPlatform). */
export type ApiPlatform = "ios" | "tvos" | "macos";

export type ApiMethod = "GET" | "POST";

export type ApiResponseType = "json" | "text" | "binary";

/** Capability features gated by endpoints — imported by nav / pages / health. */
export const CAPABILITY_FEATURES = [
  "traffic",
  "requests",
  "policies",
  "dns",
  "rules",
  "modules",
  "scripts",
  "events",
] as const;

export type CapabilityFeature = (typeof CAPABILITY_FEATURES)[number];

export const FEATURE_LABEL: Record<CapabilityFeature, string> = {
  traffic: "Traffic",
  requests: "Requests",
  policies: "Policies",
  dns: "DNS",
  rules: "Rules",
  modules: "Modules",
  scripts: "Scripts",
  events: "Events",
};

export interface ApiDescriptor<T = unknown> {
  /** Stable logical id, e.g. "policyGroups.list". */
  id: string;
  method: ApiMethod;
  /** Surge HTTP API path (indexed against ENDPOINTS). */
  path: string;
  /** Official availability; omitted = all platforms. ["macos"] = Mac-only. */
  platforms?: readonly ApiPlatform[];
  /** First Surge build exposing this endpoint (e.g. "4.0.6"). */
  minVersion?: string;
  responseType: ApiResponseType;
  /** Capability feature gated by this endpoint (nav/health/assertions). */
  feature?: CapabilityFeature;
  /**
   * Response parser — the SAME one the page / SurgeClient runs. Only
   * descriptors with a normalize function are probed by Diagnostics and the
   * Capability engine. Throws SurgeError("parse-error") on unrecognized shape.
   */
  normalize?: (raw: unknown) => T;
  /** Short diagnostics summary of a normalized payload. (Method syntax keeps
   *  T bivariant — same trick as EndpointAdapter.summarize — so instances stay
   *  assignable to ApiDescriptor<unknown>.) */
  summarize?(data: T): string;
}

/** Gives each inline descriptor its concrete type for normalize/summarize. */
function descriptor<T>(d: ApiDescriptor<T>): ApiDescriptor<T> {
  return d;
}

/**
 * Probed endpoints expose normalize+summarize; metadata-only descriptors
 * (platforms/minVersion/responseType) document capabilities for future work
 * without being probed.
 */
export const API_DESCRIPTORS: readonly ApiDescriptor<unknown>[] = [
  // ── Outbound / connection ──────────────────────────────────
  descriptor({
    id: "outbound.get",
    method: "GET",
    path: ENDPOINTS.outbound,
    responseType: "json",
    // Lightest endpoint — also supplies the API latency metric.
    normalize: (raw) => {
      const obj = asRecord(raw);
      if (typeof obj.mode !== "string") throwParse("Expected {mode}");
      return { mode: obj.mode };
    },
    summarize: (data) => data.mode,
  }),
  descriptor({
    id: "outbound.set",
    method: "POST",
    path: ENDPOINTS.outbound,
    responseType: "json",
  }),
  descriptor({
    id: "outbound.global",
    method: "GET",
    path: ENDPOINTS.outboundGlobal,
    responseType: "json",
  }),

  // ── Features (toggle capabilities) ─────────────────────────
  descriptor({ id: "features.mitm", method: "GET", path: ENDPOINTS.featuresMitm, responseType: "json" }),
  descriptor({ id: "features.mitm.set", method: "POST", path: ENDPOINTS.featuresMitm, responseType: "json" }),
  descriptor({ id: "features.capture", method: "GET", path: ENDPOINTS.featuresCapture, responseType: "json" }),
  descriptor({ id: "features.capture.set", method: "POST", path: ENDPOINTS.featuresCapture, responseType: "json" }),
  descriptor({ id: "features.rewrite", method: "GET", path: ENDPOINTS.featuresRewrite, responseType: "json" }),
  descriptor({ id: "features.rewrite.set", method: "POST", path: ENDPOINTS.featuresRewrite, responseType: "json" }),
  descriptor({ id: "features.scripting", method: "GET", path: ENDPOINTS.featuresScripting, responseType: "json" }),
  descriptor({ id: "features.scripting.set", method: "POST", path: ENDPOINTS.featuresScripting, responseType: "json" }),

  // ── Traffic ─────────────────────────────────────────────────
  descriptor({
    id: "traffic.get",
    method: "GET",
    path: ENDPOINTS.traffic,
    responseType: "json",
    feature: "traffic",
    // THE page parser (getTraffic uses trafficSchema too) — ensures
    // "Diagnostics OK" ⇔ "Traffic page renders" (review #15 drift fix).
    normalize: (raw) => parseOrThrow(trafficSchema, raw, ENDPOINTS.traffic),
    summarize: (data) => {
      const names = Object.keys(data.interface ?? {});
      return names.length === 0 ? "0 interfaces" : names.length === 1 ? "1 interface" : names.length + " interfaces";
    },
  }),

  // ── Requests ────────────────────────────────────────────────
  descriptor({
    id: "requests.recent",
    method: "GET",
    path: ENDPOINTS.requestsRecent,
    responseType: "json",
    feature: "requests",
    // Same validation as SurgeClient.getRecentRequests (requestItemSchema).
    normalize: (raw) => {
      const obj = asRecord(raw);
      const requests = parseOrThrow(z.array(requestItemSchema), obj.requests ?? [], ENDPOINTS.requestsRecent);
      return { requests };
    },
    summarize: (data) => data.requests.length + " requests",
  }),
  descriptor({ id: "requests.active", method: "GET", path: ENDPOINTS.requestsActive, responseType: "json" }),
  descriptor({ id: "requests.kill", method: "POST", path: ENDPOINTS.requestsKill, responseType: "json" }),

  // ── Policies ────────────────────────────────────────────────
  descriptor({
    id: "policyGroups.list",
    method: "GET",
    path: ENDPOINTS.policyGroups,
    responseType: "json",
    feature: "policies",
    normalize: (raw) => {
      const obj = asRecord(raw);
      const names = Object.keys(obj);
      if (names.length > 0 && typeof obj[names[0]] === "object") return { groups: names };
      if (names.length === 0) return { groups: [] };
      throwParse("Expected {[groupName]: [...]}");
    },
    summarize: (data) => (data.groups.length === 0 ? "0 groups" : data.groups.length + " groups"),
  }),
  descriptor({ id: "policies.list", method: "GET", path: ENDPOINTS.policies, responseType: "json" }),
  descriptor({
    id: "policies.detail",
    method: "GET",
    path: ENDPOINTS.policyDetail,
    responseType: "json",
  }),
  descriptor({ id: "policies.test", method: "POST", path: ENDPOINTS.policiesTest, responseType: "json" }),
  descriptor({
    id: "policies.benchmarkResults",
    method: "GET",
    path: ENDPOINTS.policyBenchmarkResults,
    responseType: "json",
  }),
  descriptor({ id: "policyGroups.test", method: "POST", path: ENDPOINTS.policyGroupsTest, responseType: "json" }),
  descriptor({ id: "policyGroups.testResults", method: "GET", path: ENDPOINTS.policyGroupsTestResults, responseType: "json" }),
  descriptor({ id: "policyGroups.select", method: "GET", path: ENDPOINTS.policyGroupsSelect, responseType: "json" }),
  descriptor({ id: "policyGroups.select.set", method: "POST", path: ENDPOINTS.policyGroupsSelect, responseType: "json" }),

  // ── Rules ───────────────────────────────────────────────────
  descriptor({
    id: "rules.list",
    method: "GET",
    path: ENDPOINTS.rules,
    responseType: "json",
    feature: "rules",
    normalize: analyzeRules,
    summarize: (data) => data.rawCount + " raw · " + data.validCount + " parsed · " + data.invalidCount + " invalid",
  }),

  // ── DNS ─────────────────────────────────────────────────────
  descriptor({
    id: "dns.cache",
    method: "GET",
    path: ENDPOINTS.dns,
    responseType: "json",
    feature: "dns",
    normalize: normalizeDns,
    summarize: (data) => data.dnsCache.length + " cache · " + data.local.length + " local",
  }),
  descriptor({ id: "dns.flush", method: "POST", path: ENDPOINTS.dnsFlush, responseType: "json" }),
  descriptor({ id: "dns.delayTest", method: "POST", path: ENDPOINTS.dnsDelayTest, responseType: "json" }),

  // ── Modules ─────────────────────────────────────────────────
  descriptor({
    id: "modules.list",
    method: "GET",
    path: ENDPOINTS.modules,
    responseType: "json",
    feature: "modules",
    normalize: (raw) => {
      const obj = asRecord(raw);
      if (!Array.isArray(obj.enabled)) throwParse("Expected {enabled: [...]}");
      return { enabled: obj.enabled as string[] };
    },
    summarize: (data) => data.enabled.length + " enabled",
  }),
  descriptor({ id: "modules.set", method: "POST", path: ENDPOINTS.modules, responseType: "json" }),

  // ── Scripting ───────────────────────────────────────────────
  descriptor({
    id: "scripting.list",
    method: "GET",
    path: ENDPOINTS.scripting,
    responseType: "json",
    feature: "scripts",
    normalize: (raw) => {
      const obj = asRecord(raw);
      if (!Array.isArray(obj.scripts)) throwParse("Expected {scripts: [...]}");
      return { scripts: obj.scripts as unknown[] };
    },
    summarize: (data) => data.scripts.length + " scripts",
  }),
  descriptor({ id: "scripting.evaluate", method: "POST", path: ENDPOINTS.scriptingEvaluate, responseType: "json" }),
  descriptor({ id: "scripting.cronEvaluate", method: "POST", path: ENDPOINTS.scriptingCronEvaluate, responseType: "json" }),

  // ── Profiles (Mac) ──────────────────────────────────────────
  descriptor({ id: "profiles.current", method: "GET", path: ENDPOINTS.profilesCurrent, responseType: "json" }),
  descriptor({ id: "profiles.reload", method: "POST", path: ENDPOINTS.profilesReload, responseType: "json" }),
  descriptor({ id: "profiles.list", method: "GET", path: "/v1/profiles", responseType: "json", platforms: ["macos"], minVersion: "4.0.6" }),
  descriptor({ id: "profiles.check", method: "POST", path: "/v1/profiles/check", responseType: "json", platforms: ["macos"], minVersion: "4.0.6" }),
  descriptor({ id: "profiles.switch", method: "POST", path: "/v1/profiles/switch", responseType: "json", platforms: ["macos"] }),

  // ── Devices (Mac, 4.0.6+) ───────────────────────────────────
  descriptor({ id: "devices.list", method: "GET", path: "/v1/devices", responseType: "json", platforms: ["macos"], minVersion: "4.0.6" }),
  descriptor({ id: "devices.update", method: "POST", path: "/v1/devices", responseType: "json", platforms: ["macos"], minVersion: "4.0.6" }),
  descriptor({ id: "devices.icon", method: "GET", path: "/v1/resources/devices-icon", responseType: "binary", platforms: ["macos"], minVersion: "4.0.6" }),

  // ── Events ──────────────────────────────────────────────────
  descriptor({
    id: "events.list",
    method: "GET",
    path: ENDPOINTS.events,
    responseType: "json",
    feature: "events",
    normalize: normalizeEvents,
    summarize: (data) => data.rawCount + " raw · " + data.validCount + " parsed · " + data.invalidCount + " invalid",
  }),

  // ── Metrics / diagnostics / advanced (documented for future P1/P2 UI) ──
  descriptor({
    id: "metrics.get",
    method: "GET",
    path: ENDPOINTS.metrics,
    responseType: "text",
    // Prometheus text format (iOS 5.22.0+ / Mac 6.9.0+) — NOT JSON.
    minVersion: "5.22.0",
  }),
  descriptor({ id: "log.level", method: "POST", path: "/v1/log/level", responseType: "json" }),
  descriptor({ id: "mitm.ca", method: "GET", path: "/v1/mitm/ca", responseType: "binary" }),
  descriptor({ id: "engine.stop", method: "POST", path: "/v1/stop", responseType: "json", platforms: ["ios", "macos"] }),
  descriptor({ id: "features.systemProxy", method: "GET", path: "/v1/features/system_proxy", responseType: "json", platforms: ["macos"] }),
  descriptor({ id: "features.enhancedMode", method: "GET", path: "/v1/features/enhanced_mode", responseType: "json", platforms: ["macos"] }),
];

function asRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  throwParse("Expected object");
}

function throwParse(reason: string): never {
  throw new Error(reason);
}