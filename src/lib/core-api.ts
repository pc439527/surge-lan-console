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
const backupInfoSchema = z.object({ id: z.string(), source: z.enum(["scheduled", "manual", "restore-point"]), createdAt: z.string(), sizeBytes: z.number() });
const backupValidationSchema = backupInfoSchema.extend({ valid: z.boolean(), quickCheck: z.string(), schemaVersion: z.number().nullable(), sha256: z.string().length(64) });
const restorePreparationSchema = z.object({ backup: backupValidationSchema, safetyBackup: backupValidationSchema, restartRequired: z.literal(true) });
const trafficRangeSchema = z.enum(["24h", "7d", "30d"]);
const trafficRollupPointSchema = z.object({
  bucketSeconds: z.number(), bucketStart: z.string(), sampleCount: z.number(), avgUploadRate: z.number(), avgDownloadRate: z.number(),
  maxUploadRate: z.number(), maxDownloadRate: z.number(), uploadBytesDelta: z.number(), downloadBytesDelta: z.number(),
});
const trafficAnalyticsSchema = z.object({ connectionId: z.string(), range: trafficRangeSchema, points: z.array(trafficRollupPointSchema) });
const policyTrafficStatSchema = z.object({
  name: z.string(), downloadBytes: z.number(), uploadBytes: z.number(), totalBytes: z.number(), sampleCount: z.number(), lastSeenAt: z.string(),
});
const policyTrafficAnalyticsSchema = z.object({ connectionId: z.string(), range: trafficRangeSchema, policies: z.array(policyTrafficStatSchema) });
const healthRangeSchema = z.enum(["24h", "7d"]);
const dnsTrendPointSchema = z.object({ sampledAt: z.string(), domain: z.string(), delayMs: z.number(), apiLatencyMs: z.number().nullable() });
const dnsAnalyticsSchema = z.object({ connectionId: z.string(), range: healthRangeSchema, points: z.array(dnsTrendPointSchema) });
const policyHealthStatSchema = z.object({
  key: z.string(), name: z.string(), groups: z.array(z.string()), sampleCount: z.number(), reachableCount: z.number(),
  availabilityPercent: z.number(), p50Ms: z.number().nullable(), p95Ms: z.number().nullable(), lastLatencyMs: z.number().nullable(),
  lastReachable: z.boolean(), lastSampledAt: z.string(),
});
const policyHealthAnalyticsSchema = z.object({ connectionId: z.string(), range: healthRangeSchema, nodes: z.array(policyHealthStatSchema) });
const errorTrendPointSchema = z.object({ bucketStart: z.string(), surgeWarnings: z.number(), surgeErrors: z.number(), jobFailures: z.number(), total: z.number() });
const errorAnalyticsSchema = z.object({ connectionId: z.string(), range: healthRangeSchema, points: z.array(errorTrendPointSchema), notificationFailuresGlobal: z.number() });
const runtimeTrendPointSchema = z.object({
  sampledAt: z.string(), source: z.enum(["metrics", "traffic"]), uptimeSeconds: z.number().nullable(), memoryBytes: z.number().nullable(),
  activeRequests: z.number().nullable(), dnsCacheEntries: z.number().nullable(), activeBans: z.number().nullable(),
});
const runtimeAnalyticsSchema = z.object({ connectionId: z.string(), range: healthRangeSchema, points: z.array(runtimeTrendPointSchema) });
const profileSnapshotSchema = z.object({
  id: z.string(), connectionId: z.string(), sha256: z.string().length(64), profileName: z.string(),
  source: z.enum(["scheduled", "manual", "reload"]), capturedAt: z.string(), sizeBytes: z.number(),
});
const profileSnapshotDetailSchema = profileSnapshotSchema.extend({ content: z.string() });
const profileCaptureSchema = z.object({ snapshot: profileSnapshotSchema, created: z.boolean() });
const profileDiffChunkSchema = z.object({ oldStartLine: z.number(), newStartLine: z.number(), removed: z.array(z.string()), added: z.array(z.string()) });
const profileDiffSchema = z.object({
  from: profileSnapshotSchema, to: profileSnapshotSchema, changed: z.boolean(), addedLines: z.number(), removedLines: z.number(),
  truncated: z.boolean(), chunks: z.array(profileDiffChunkSchema),
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
export type BackupInfo = z.infer<typeof backupInfoSchema>;
export type BackupValidation = z.infer<typeof backupValidationSchema>;
export type RestorePreparation = z.infer<typeof restorePreparationSchema>;
export type TrafficAnalyticsRange = z.infer<typeof trafficRangeSchema>;
export type TrafficRollupPoint = z.infer<typeof trafficRollupPointSchema>;
export type TrafficAnalytics = z.infer<typeof trafficAnalyticsSchema>;
export type PolicyTrafficStat = z.infer<typeof policyTrafficStatSchema>;
export type PolicyTrafficAnalytics = z.infer<typeof policyTrafficAnalyticsSchema>;
export type HealthAnalyticsRange = z.infer<typeof healthRangeSchema>;
export type DnsTrendPoint = z.infer<typeof dnsTrendPointSchema>;
export type DnsAnalytics = z.infer<typeof dnsAnalyticsSchema>;
export type PolicyHealthStat = z.infer<typeof policyHealthStatSchema>;
export type PolicyHealthAnalytics = z.infer<typeof policyHealthAnalyticsSchema>;
export type ErrorTrendPoint = z.infer<typeof errorTrendPointSchema>;
export type ErrorAnalytics = z.infer<typeof errorAnalyticsSchema>;
export type RuntimeTrendPoint = z.infer<typeof runtimeTrendPointSchema>;
export type RuntimeAnalytics = z.infer<typeof runtimeAnalyticsSchema>;
export type ProfileSnapshot = z.infer<typeof profileSnapshotSchema>;
export type ProfileSnapshotDetail = z.infer<typeof profileSnapshotDetailSchema>;
export type ProfileCaptureResult = z.infer<typeof profileCaptureSchema>;
export type ProfileDiff = z.infer<typeof profileDiffSchema>;

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
  deleteNotificationChannel: (id: string): Promise<{ deleted: boolean }> => request(() => client.delete(`/notifications/channels/${encodeURIComponent(id)}`, z.object({ deleted: z.boolean() }))),
  testNotificationChannel: (id: string): Promise<{ sent: boolean }> => request(() => client.post(`/notifications/channels/${encodeURIComponent(id)}/test`), z.object({ sent: z.boolean() })),
  listNotificationRules: (channelId?: string): Promise<NotificationRule[]> => request(() => client.get("/notifications/rules", { params: channelId ? { channelId } : undefined }), z.array(ruleSchema)),
  updateNotificationRule: (id: string, input: { enabled?: boolean; cooldownSeconds?: number; quietStart?: string | null; quietEnd?: string | null; timeZone?: string }): Promise<NotificationRule> => request(() => client.patch(`/notifications/rules/${encodeURIComponent(id)}`, input), ruleSchema),
  listNotificationHistory: (limit = 100): Promise<NotificationHistory[]> => request(() => client.get("/notifications/history", { params: { limit } }), z.array(historySchema)),

  listJobs: (): Promise<ScheduledJob[]> => request(() => client.get("/automation/jobs"), z.array(jobSchema)),
  updateJob: (id: string, input: { enabled?: boolean; intervalSeconds?: number }): Promise<ScheduledJob> => request(() => client.patch(`/automation/jobs/${encodeURIComponent(id)}`, input), jobSchema),
  runJob: (id: string): Promise<JobRun> => request(() => client.post(`/automation/jobs/${encodeURIComponent(id)}/run`), runSchema),
  listJobRuns: (limit = 100): Promise<JobRun[]> => request(() => client.get("/automation/runs", { params: { limit } }), z.array(runSchema)),

  listBackups: (): Promise<BackupInfo[]> => request(() => client.get("/backups"), z.array(backupInfoSchema)),
  createBackup: (): Promise<BackupValidation> => request(() => client.post("/backups", undefined, { timeout: 60_000 }), backupValidationSchema),
  validateBackup: (id: string): Promise<BackupValidation> => request(() => client.post("/backups/validate", { id }, { timeout: 60_000 }), backupValidationSchema),
  restoreBackup: (id: string, expectedSha256: string): Promise<RestorePreparation> => request(
    () => client.post("/backups/restore", { id, expectedSha256 }, { timeout: 60_000 }),
    restorePreparationSchema,
  ),

  getTrafficAnalytics: (connectionId: string, range: TrafficAnalyticsRange = "24h"): Promise<TrafficAnalytics> => request(() => client.get("/analytics/traffic", { params: { connectionId, range } }), trafficAnalyticsSchema),
  getPolicyTrafficAnalytics: (connectionId: string, range: TrafficAnalyticsRange = "24h"): Promise<PolicyTrafficAnalytics> => request(() => client.get("/analytics/policy-traffic", { params: { connectionId, range } }), policyTrafficAnalyticsSchema),
  getDnsAnalytics: (connectionId: string, range: HealthAnalyticsRange = "24h"): Promise<DnsAnalytics> => request(() => client.get("/analytics/dns", { params: { connectionId, range } }), dnsAnalyticsSchema),
  getPolicyHealthAnalytics: (connectionId: string, range: HealthAnalyticsRange = "24h"): Promise<PolicyHealthAnalytics> => request(() => client.get("/analytics/policy-health", { params: { connectionId, range } }), policyHealthAnalyticsSchema),
  getErrorAnalytics: (connectionId: string, range: HealthAnalyticsRange = "24h"): Promise<ErrorAnalytics> => request(() => client.get("/analytics/errors", { params: { connectionId, range } }), errorAnalyticsSchema),
  getRuntimeAnalytics: (connectionId: string, range: HealthAnalyticsRange = "24h"): Promise<RuntimeAnalytics> => request(() => client.get("/analytics/runtime", { params: { connectionId, range } }), runtimeAnalyticsSchema),

  listProfileSnapshots: (connectionId: string, limit = 100): Promise<ProfileSnapshot[]> => request(() => client.get("/profile-history", { params: { connectionId, limit } }), z.array(profileSnapshotSchema)),
  captureProfileSnapshot: (connectionId: string): Promise<ProfileCaptureResult> => request(() => client.post("/profile-history/capture", { connectionId }), profileCaptureSchema),
  getProfileSnapshot: (connectionId: string, id: string): Promise<ProfileSnapshotDetail> => request(() => client.get(`/profile-history/${encodeURIComponent(id)}`, { params: { connectionId } }), profileSnapshotDetailSchema),
  diffProfileSnapshots: (connectionId: string, from: string, to: string): Promise<ProfileDiff> => request(() => client.get("/profile-history/diff", { params: { connectionId, from, to } }), profileDiffSchema),
};
