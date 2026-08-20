/** Real Surge HTTP API data shapes (verified against Surge manual + YASD). */

export interface FeatureState {
  mitm: boolean;
  rewrite: boolean;
  scripting: boolean;
  capture: boolean;
}

/** GET /v1/outbound -> {"mode": "rule"} */
export type OutboundMode = "direct" | "proxy" | "rule";

/** GET /v1/outbound/global -> {"policy": "..."} */
export interface GlobalOutbound {
  policy: string;
}

/**
 * GET /v1/traffic
 * Rates are per-connector/per-interface maps; in/out are cumulative bytes.
 */
export interface Traffic {
  startTime: number;
  interface: Record<string, ConnectorTraffic>;
  connector: Record<string, ConnectorTraffic>;
}

export interface ConnectorTraffic {
  outCurrentSpeed: number;
  in: number;
  inCurrentSpeed: number;
  outMaxSpeed: number;
  out: number;
  inMaxSpeed: number;
  statistics?: ConnectorStat[];
}

export interface ConnectorStat {
  rttcur: number;
  rttvar: number;
  srtt: number;
  txpackets: number;
  txretransmitpackets: number;
}

/** Aggregated traffic for display (summed over all interfaces). */
export interface TrafficSummary {
  uploadRate: number;
  downloadRate: number;
  totalUpload: number;
  totalDownload: number;
  /** Session start (epoch ms or s, raw from API — normalize before comparing). */
  startTime?: number;
}

/**
 * GET /v1/policies -> { "policy-groups": string[], proxies: string[] }
 */
export interface Policies {
  "policy-groups": string[];
  proxies: string[];
}

/**
 * GET /v1/policy_groups -> { [groupName]: Policy[] }
 */
export type PolicyGroups = Record<string, Policy[]>;

export interface Policy {
  name: string;
  typeDescription: string;
  isGroup?: boolean;
  lineHash?: string;
}

/** GET /v1/policy_groups/select?group_name=X -> {"policy": "..."} */
export interface GroupSelection {
  policy: string;
}

/** POST /v1/policy_groups/test -> {"available": [...]} */
export interface GroupTestResult {
  /** Reachable policy names derived from the POST response. */
  available: string[];
  /** Per-policy latency normalized from Surge's `receive` field. */
  results: Record<string, PolicyTestEntry>;
  /** URL-test groups may select and return a winner automatically. */
  winner?: string;
}

/**
 * GET /v1/policy_groups/test_results ->
 * { [groupName]: { [policyName]: { ok, latency } } }
 * Latency may be a number (ms) or a "Timeout"-like string on older Surge builds.
 */
export interface PolicyBenchmarkResult {
  lastTestScoreInMS: number;
  lastTestDate?: number;
  lastTestErrorMessage?: string | null;
  testing?: number;
}

export type PolicyBenchmarkResults = Record<string, PolicyBenchmarkResult>;

export interface PolicyTestEntry {
  ok?: boolean;
  latency?: number | string | null;
}

export type PolicyGroupTestResults = Record<string, Record<string, PolicyTestEntry>>;

/**
 * GET /v1/requests/recent | /v1/requests/active -> { requests: RequestItem[] }
 */
export interface RecentRequests {
  requests: RequestItem[];
}

export interface RequestItem {
  id: number;
  remoteAddress: string;
  inMaxSpeed: number;
  notes?: string[];
  inCurrentSpeed: number;
  failed: 1 | 0 | boolean;
  /** Free-form status string — Surge versions differ ("Active", "Completed", ...). */
  status?: string | null;
  outCurrentSpeed: number;
  completed: 1 | 0 | boolean;
  modified: 1 | 0 | boolean;
  sourcePort: number;
  completedDate: number;
  outBytes: number;
  sourceAddress: string;
  localAddress: string;
  requestHeader?: string;
  policyName: string;
  inBytes: number;
  method: string;
  pid: number;
  replica: 1 | 0 | boolean;
  rule: string;
  startDate: number;
  setupCompletedDate: number;
  outMaxSpeed: number;
  processPath?: string;
  URL: string;
  timingRecords?: Array<{ durationInMillisecond: number; name: string }>;
  lastUpdated?: string;
}

/**
 * GET /v1/events -> { events: [...] }
 * type: 0 = info, 1 = warn, 2 = error (per YASD rendering)
 */
export interface EventList {
  events: SurgeEventItem[];
}

export interface SurgeEventItem {
  identifier: string;
  date: string;
  type: number;
  allowDismiss: number;
  content: string;
}

export type EventLevel = "info" | "warn" | "error";

/** GET /v1/dns -> { local: [...], dnsCache: [...] } */
export interface DnsResult {
  local: DnsLocalEntry[];
  dnsCache: DnsCacheEntry[];
}

export interface DnsLocalEntry {
  data: string | null;
  comment: string | null;
  domain: string | null;
  source: string | null;
  server: string | null;
  /** Original API record — keeps platform-specific fields from being lost. */
  raw?: unknown;
}

export interface DnsCacheEntry {
  timeCost?: number;
  path?: string;
  data: string[];
  domain: string;
  server?: string;
  expiresTime?: number;
  /** Original API record — keeps platform-specific fields from being lost. */
  raw?: unknown;
}

/** GET /v1/modules -> { enabled: string[], available: string[] } */
export interface Modules {
  enabled: string[];
  available: string[];
}

export interface ModuleInfo {
  name: string;
  enabled: boolean;
}

/** GET /v1/scripting -> { scripts: [...] } */
export interface Scriptings {
  scripts: ScriptItem[];
}

export interface ScriptItem {
  name: string;
  type: string;
  path: string;
}

/** GET /v1/rules -> RuleInfo[] (normalized; extra fields kept as raw) */
export interface RuleInfo {
  type?: string;
  content?: string;
  policy?: string;
  /** Original API record — survives field drift across Surge builds. */
  raw?: unknown;
}

/**
 * GET /v1/profiles/current?sensitive=0
 * Modern Surge returns { name, profile, originalProfile }; some versions return raw text.
 */
export interface ProfileInfo {
  name: string;
  profile: string;
  originalProfile: string;
}