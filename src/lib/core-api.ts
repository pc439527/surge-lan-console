import axios from "axios";
import { z } from "zod";

const authStateSchema = z.object({ initialized: z.boolean(), authenticated: z.boolean(), sessionExpiresAt: z.string().nullable() });
const healthSchema = z.object({ status: z.literal("ok"), database: z.enum(["ok", "error"]), initialized: z.boolean() });
const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
const connectionSchema = z.object({ id: z.string(), name: z.string(), protocol: z.enum(["http", "https"]), host: z.string(), port: z.number(), platform: z.enum(["ios", "tvos", "macos"]).nullable(), hasApiKey: z.boolean(), createdAt: z.string(), updatedAt: z.string() });
const connectionTestSchema = z.object({ reachable: z.boolean(), authenticated: z.boolean(), latencyMs: z.number().nullable(), statusCode: z.number().nullable() });
const channelSchema = z.object({ id: z.string(), provider: z.literal("bark"), name: z.string(), enabled: z.boolean(), configured: z.boolean(), createdAt: z.string(), updatedAt: z.string() });
const ruleSchema = z.object({ id: z.string(), channelId: z.string(), eventType: z.string(), enabled: z.boolean(), cooldownSeconds: z.number(), quietStart: z.string().nullable(), quietEnd: z.string().nullable(), timeZone: z.string(), updatedAt: z.string() });
const historySchema = z.object({ id: z.string(), channelId: z.string().nullable(), eventType: z.string(), fingerprint: z.string(), title: z.string(), body: z.string(), status: z.enum(["sent", "error", "suppressed"]), errorMessage: z.string().nullable(), createdAt: z.string() });
const jobSchema = z.object({ id: z.string(), type: z.string(), connectionId: z.string().nullable(), enabled: z.boolean(), intervalSeconds: z.number(), nextRunAt: z.string(), lastRunAt: z.string().nullable() });
const runSchema = z.object({ id: z.string(), jobId: z.string(), status: z.enum(["success", "error", "skipped"]), startedAt: z.string(), finishedAt: z.string(), durationMs: z.number(), message: z.string().nullable() });
const trafficRangeSchema = z.enum(["24h", "7d", "30d"]);
const trafficRollupPointSchema = z.object({
  bucketSeconds: z.number(),
  bucketStart: z.string(),
  sampleCount: z.number(),
  avgUploadRate: z.number(),
  avgDownloadRate: z.number(),
  maxUploadRate: z.number(),
  maxDownloadRate: z.number(),
  uploadBytesDelta: z.number(),
  downloadBytesDelta: z.number(),
});
const trafficAnalyticsSchema = z.object({
  connectionId: z.string(),
  range: trafficRangeSchema,
  points: z.array(trafficRollupPointSchema),
});

export type CoreAuthState = z.infer<typeof authStateSchema>;
export type CoreHealth = z.infer<typeof healthSchema>;
export type CoreConnection = z.infer<typeof connectionSchema>;
export type CoreConnectionTest = z.infer<typeof connectionTestSchema>;
export type NotificationChannel = z.infer<typeof channelSchema>;
export type NotificationRule = z.infer<typeof ruleSchema>;
export type NotificationHistory = z.infer<typeof historySchema>;
export type ScheduledJob = z.infer<typeof jobSchema>;
export type JobRun = z.infer<typeof runSchema>;
export type TrafficAnalyticsRange = z.infer<typeof trafficRangeSchema>;
export type TrafficRollupPoint = z.infer<typeof trafficRollupPointSchema>;
export type TrafficAnalytics = z.infer<typeof trafficAnalyticsSchema>;

export interface CoreConnectionInput { id?: string; name: string; protocol: "http" | "https"; host: string; port: number; platform?: "ios" | "tvos" | "macos" | null; apiKey?: string }
export class CoreApiError extends Error { constructor(public readonly code: string, public readonly status: number | null, message: string) { super(message); this.name = "CoreApiError"; } }

const client = axios.create({ baseURL: "/api", timeout: 15_000, withCredentials: true, headers: { Accept: "application/json" } });
function normalizeError(error: unknown): CoreApiError {
  if (axios.isAxiosError(error)) { const parsed = errorSchema.safeParse(error.response?.data); if (parsed.success) return new CoreApiError(parsed.data.error.code, error.response?.status ?? null, parsed.data.error.message); if (!error.response) return new CoreApiError("core_unavailable", null, "无法连接 Surge LAN Console Core。"); return new CoreApiError("core_request_failed", error.response.status, "Core 请求失败。"); }
  return new CoreApiError("core_unknown_error", null, "Core 请求发生未知错误。");
}
async function request<T>(work: () => Promise<{ data: unknown }>, schema: z.ZodType<T>): Promise<T> {
  try { const response = await work(); return schema.parse(response.data); }
  catch (error) { if (error instanceof CoreApiError) throw error; if (error instanceof z.ZodError) throw new CoreApiError("core_invalid_response", null, "Core 返回了无法识别的数据格式。"); throw normalizeError(error); }
}

export const coreApi = {
  getHealth: (): Promise<CoreHealth> => request(() => client.get("/health"), healthSchema),
  getAuthState: (): Promise<CoreAuthState> => request(() => client.get("/auth/state"), authStateSchema),
  setup: (password: string, confirmPassword: string): Promise<CoreAuthState> => request(() => client.post("/auth/setup", { password, confirmPassword }), authStateSchema),
  unlock: (password: string): Promise<CoreAuthState> => request(() => client.post("/auth/unlock", { password }), authStateSchema),
  lock: (): Promise<CoreAuthState> => request(() => client.post("/auth/lock"), authStateSchema),
  listConnections: (): Promise<CoreConnection[]> => request(() => client.get("/connections"), z.array(connectionSchema)),
  createConnection: (input: CoreConnectionInput): Promise<CoreConnection> => request(() => client.post("/connections", input), connectionSchema),
  updateConnection: (id: string, input: Partial<CoreConnectionInput>): Promise<CoreConnection> => request(() => client.patch(`/connections/${encodeURIComponent(id)}`, input), connectionSchema),
  deleteConnection: (id: string): Promise<{ deleted: boolean }> => request(() => client.delete(`/connections/${encodeURIComponent(id)}`), z.object({ deleted: z.boolean() })),
  importConnections: (connections: CoreConnectionInput[]): Promise<{ imported: number; skipped: number }> => request(() => client.post("/connections/import", { connections }), z.object({ imported: z.number(), skipped: z.number() })),
  testConnection: (id: string): Promise<CoreConnectionTest> => request(() => client.post(`/connections/${encodeURIComponent(id)}/test`), connectionTestSchema),

  listNotificationChannels: (): Promise<NotificationChannel[]> => request(() => client.get("/notifications/channels"), z.array(channelSchema)),
  createNotificationChannel: (input: { name: string; endpoint: string; enabled?: boolean }): Promise<NotificationChannel> => request(() => client.post("/notifications/channels", input), channelSchema),
  updateNotificationChannel: (id: string, input: { name?: string; endpoint?: string; enabled?: boolean }): Promise<NotificationChannel> => request(() => client.patch(`/notifications/channels/${encodeURIComponent(id)}`, input), channelSchema),
  deleteNotificationChannel: (id: string): Promise<{ deleted: boolean }> => request(() => client.delete(`/notifications/channels/${encodeURIComponent(id)}`), z.object({ deleted: z.boolean() })),
  testNotificationChannel: (id: string): Promise<{ sent: boolean }> => request(() => client.post(`/notifications/channels/${encodeURIComponent(id)}/test`), z.object({ sent: z.boolean() })),
  listNotificationRules: (channelId?: string): Promise<NotificationRule[]> => request(() => client.get("/notifications/rules", { params: channelId ? { channelId } : undefined }), z.array(ruleSchema)),
  updateNotificationRule: (id: string, input: { enabled?: boolean; cooldownSeconds?: number; quietStart?: string | null; quietEnd?: string | null; timeZone?: string }): Promise<NotificationRule> => request(() => client.patch(`/notifications/rules/${encodeURIComponent(id)}`, input), ruleSchema),
  listNotificationHistory: (limit = 100): Promise<NotificationHistory[]> => request(() => client.get("/notifications/history", { params: { limit } }), z.array(historySchema)),

  listJobs: (): Promise<ScheduledJob[]> => request(() => client.get("/automation/jobs"), z.array(jobSchema)),
  updateJob: (id: string, input: { enabled?: boolean; intervalSeconds?: number }): Promise<ScheduledJob> => request(() => client.patch(`/automation/jobs/${encodeURIComponent(id)}`, input), jobSchema),
  runJob: (id: string): Promise<JobRun> => request(() => client.post(`/automation/jobs/${encodeURIComponent(id)}/run`), runSchema),
  listJobRuns: (limit = 100): Promise<JobRun[]> => request(() => client.get("/automation/runs", { params: { limit } }), z.array(runSchema)),

  getTrafficAnalytics: (connectionId: string, range: TrafficAnalyticsRange = "24h"): Promise<TrafficAnalytics> =>
    request(() => client.get("/analytics/traffic", { params: { connectionId, range } }), trafficAnalyticsSchema),
};
