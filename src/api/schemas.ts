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

export const requestItemSchema = z.object({
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
});

export const eventItemSchema = z.object({
  identifier: z.string(),
  date: z.string(),
  type: z.number(),
  allowDismiss: z.number().optional().default(0),
  content: z.string(),
});

/** Validate unknown API data against a schema; throws a friendly SurgeError on mismatch. */
export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown, endpoint: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.slice(0, 3).map((i) => i.path.join(".") || "(root)");
    throw new SurgeError(
      "unsupported",
      "Surge 返回的数据结构与预期不符（" + endpoint + "）：" + issues.join(", "),
    );
  }
  return result.data;
}