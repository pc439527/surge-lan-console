import { z } from "zod";
import { SurgeError } from "./errors";

/**
 * Zod schemas for real Surge HTTP API responses (Fix 11).
 * Client-side runtime validation catches version/platform drift early:
 * `safeParse` instead of trusting TypeScript's compile-time shapes.
 *
 * Schemas are intentionally lenient (optional fields, loose unions) because
 * Surge on iOS / tvOS / macOS exposes slightly different payloads.
 */

export const trafficSummarySchema = z.object({
  uploadRate: z.number(),
  downloadRate: z.number(),
  totalUpload: z.number(),
  totalDownload: z.number(),
  startTime: z.number().optional(),
});

/**
 * Per-interface / per-connector stats from GET /v1/traffic. Every numeric
 * field defaults to 0 when the platform omits it (macOS / iOS / tvOS payloads
 * differ), so a missing field never crashes the Traffic page. The statistics
 * array is optional and only present on connectors in newer Surge builds.
 */
export const connectorTrafficSchema = z.object({
  outCurrentSpeed: z.number().optional().default(0),
  in: z.number().optional().default(0),
  inCurrentSpeed: z.number().optional().default(0),
  outMaxSpeed: z.number().optional().default(0),
  out: z.number().optional().default(0),
  inMaxSpeed: z.number().optional().default(0),
  statistics: z
    .array(
      z.object({
        rttcur: z.number().optional().default(0),
        rttvar: z.number().optional().default(0),
        srtt: z.number().optional().default(0),
        txpackets: z.number().optional().default(0),
        txretransmitpackets: z.number().optional().default(0),
      }),
    )
    .optional(),
});

/**
 * Raw GET /v1/traffic payload - the single cache source for every traffic
 * consumer (Dashboard summary + Traffic page tables).
 */
export const trafficSchema = z.object({
  startTime: z.number().optional().default(0),
  interface: z.record(z.string(), connectorTrafficSchema).optional().default({}),
  connector: z.record(z.string(), connectorTrafficSchema).optional().default({}),
});

/**
 * RequestItem schema (Request Inspector V2).
 *
 * `.passthrough()` is intentional: Surge on iOS / tvOS / macOS returns a
 * superset of fields across builds (e.g. `protocol`, `hostname`, `destPort`
 * on newer tvOS). Unmodelled fields survive the parse and are kept on
 * `RequestItem.raw` so no platform-specific data is ever lost.
 */
export const requestItemSchema = z
  .object({
  id: z.number(),
  URL: z.string(),
  method: z.string().optional().default(""),
  policyName: z.string().optional().default(""),
  rule: z.string().optional().default(""),
  status: z.string().optional().nullable(),
  startDate: z.number().optional().default(0),
  completedDate: z.number().optional().default(0),
  sourceAddress: z.string().optional().default(""),
  sourcePort: z.number().optional().default(0),
  outBytes: z.number().optional().default(0),
  inBytes: z.number().optional().default(0),
  failed: z.union([z.literal(0), z.literal(1), z.boolean()]).optional().default(0),
  completed: z.union([z.literal(0), z.literal(1), z.boolean()]).optional().default(0),
  modified: z.union([z.literal(0), z.literal(1), z.boolean()]).optional().default(0),
  replica: z.union([z.literal(0), z.literal(1), z.boolean()]).optional().default(0),
  remoteAddress: z.string().optional().default(""),
  localAddress: z.string().optional().default(""),
  inCurrentSpeed: z.number().optional().default(0),
  outCurrentSpeed: z.number().optional().default(0),
  inMaxSpeed: z.number().optional().default(0),
  outMaxSpeed: z.number().optional().default(0),
  pid: z.number().optional().default(0),
  setupCompletedDate: z.number().optional().default(0),
  notes: z.array(z.string()).optional().default([]),
  requestHeader: z.string().optional(),
  processPath: z.string().optional(),
  lastUpdated: z.string().optional(),
  timingRecords: z
    .array(z.object({ durationInMillisecond: z.number(), name: z.string() }))
    .optional()
    .default([]),
  // Platform-drift fields: present on newer Surge builds, absent on others.
  protocol: z.string().optional(),
  hostname: z.string().optional(),
  destPort: z.number().optional(),
})
  .passthrough();

export const eventItemSchema = z.object({
  identifier: z.string(),
  date: z.string(),
  type: z.number(),
  allowDismiss: z.number().optional().default(0),
  content: z.string(),
});

/**
 * Validate unknown API data against a schema; throws a friendly SurgeError on
 * mismatch. The kind is "parse-error" (NOT "unsupported"): the endpoint
 * responded 200, so the platform DID expose it — its structure is just not
 * what this console understands (Surge build drift). "unsupported" is
 * reserved exclusively for HTTP 404/405 platform gaps.
 */
export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown, endpoint: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.slice(0, 3).map((i) => i.path.join(".") || "(root)");
    throw new SurgeError(
      "parse-error",
      "API 返回的结构无法识别（" + endpoint + "）：" + issues.join(", ") + "。可能是 Surge 新版本调整了响应结构。",
    );
  }
  return result.data;
}