import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { BackupService } from "./backup-service.js";
import { AppDatabase } from "./database.js";
import { AuthError, AuthService } from "./auth-service.js";
import { ConnectionService, type ConnectionInput } from "./connection-service.js";
import { EventBus } from "./event-bus.js";
import { CoreError } from "./errors.js";
import { NotificationService } from "./notification-service.js";
import { ProfileHistoryService } from "./profile-history.js";
import { RuntimeVault } from "./runtime-vault.js";
import { SchedulerService } from "./scheduler-service.js";
import { SecretVault } from "./secret-vault.js";
import { SessionStore, type SessionInfo } from "./session-store.js";
import { SurgeTransport } from "./surge-transport.js";
import { TrafficAnalyticsService, type TrafficRange } from "./traffic-analytics.js";

const SESSION_COOKIE = "slc_session";
const MAX_JSON_BODY_BYTES = 256 * 1024;
const MAX_PROXY_BODY_BYTES = 2 * 1024 * 1024;
interface CoreAppOptions { databasePath: string; sessionIdleMs: number; sessionAbsoluteMs: number; now?: () => number }
interface AttemptBucket { failures: number; windowStartedAt: number; blockedUntil: number }

class UnlockRateLimiter {
  private readonly buckets = new Map<string, AttemptBucket>();
  constructor(private readonly now: () => number) {}
  retryAfterSeconds(key: string): number {
    const bucket = this.buckets.get(key); if (!bucket) return 0;
    const remaining = bucket.blockedUntil - this.now(); return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }
  failure(key: string): void {
    const now = this.now(); const bucket = this.buckets.get(key);
    if (!bucket || now - bucket.windowStartedAt > 60_000) { this.buckets.set(key, { failures: 1, windowStartedAt: now, blockedUntil: 0 }); return; }
    bucket.failures += 1; if (bucket.failures >= 5) bucket.blockedUntil = now + 60_000;
  }
  success(key: string): void { this.buckets.delete(key); }
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8"); response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff"); response.setHeader("Referrer-Policy", "no-referrer"); response.end(JSON.stringify(body));
}
async function readBuffer(request: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = []; let total = 0;
  for await (const chunk of request) { const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); total += buffer.length; if (total > limit) throw new CoreError("request_too_large", 413, "请求内容过大。"); chunks.push(buffer); }
  return Buffer.concat(chunks);
}
async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const buffer = await readBuffer(request, MAX_JSON_BODY_BYTES); if (buffer.length === 0) return {};
  try { const parsed = JSON.parse(buffer.toString("utf8")) as unknown; if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object required"); return parsed as Record<string, unknown>; }
  catch { throw new CoreError("invalid_json", 400, "请求 JSON 无法解析。"); }
}
function stringField(body: Record<string, unknown>, key: string): string { const value = body[key]; return typeof value === "string" ? value : ""; }
function cookieValue(request: IncomingMessage, name: string): string | null {
  const cookie = request.headers.cookie; if (!cookie) return null;
  for (const segment of cookie.split(";")) { const [rawName, ...rest] = segment.trim().split("="); if (rawName === name) return rest.join("="); } return null;
}
function isSecureRequest(request: IncomingMessage): boolean {
  const forwardedProto = request.headers["x-forwarded-proto"]; const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto; return proto?.split(",")[0]?.trim() === "https";
}
function setSessionCookie(request: IncomingMessage, response: ServerResponse, token: string, expiresAt: number, now: number): void {
  const maxAge = Math.max(1, Math.floor((expiresAt - now) / 1000)); const parts = [`${SESSION_COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${maxAge}`, "Priority=High"]; if (isSecureRequest(request)) parts.push("Secure"); response.setHeader("Set-Cookie", parts.join("; "));
}
function clearSessionCookie(request: IncomingMessage, response: ServerResponse): void {
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=0", "Priority=High"]; if (isSecureRequest(request)) parts.push("Secure"); response.setHeader("Set-Cookie", parts.join("; "));
}
function requestIp(request: IncomingMessage): string {
  const forwardedFor = request.headers["x-forwarded-for"]; const first = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)?.split(",")[0]?.trim(); return first || request.socket.remoteAddress || "unknown";
}
function ensureOrigin(request: IncomingMessage): void {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method ?? "GET")) return; const origin = request.headers.origin; if (!origin || Array.isArray(origin)) return;
  try { if (new URL(origin).host !== request.headers.host) throw new Error("origin mismatch"); } catch { throw new CoreError("origin_rejected", 403, "请求来源校验失败。"); }
}
function requireSession(sessions: SessionStore, token: string | null): SessionInfo { const session = sessions.get(token); if (!session) throw new CoreError("session_required", 401, "控制台已锁定，请重新输入数据密码。"); return session; }
function requireBackups(backups: BackupService | null): BackupService { if (!backups) throw new CoreError("backup_unavailable", 409, "当前数据库不支持持久化备份。"); return backups; }
function asConnectionInput(body: Record<string, unknown>): ConnectionInput {
  const platform = typeof body.platform === "string" ? body.platform : null;
  return { ...(typeof body.id === "string" ? { id: body.id } : {}), name: stringField(body, "name"), protocol: body.protocol === "https" ? "https" : "http", host: stringField(body, "host"), port: typeof body.port === "number" ? body.port : Number(body.port), platform: platform === "ios" || platform === "tvos" || platform === "macos" ? platform : null, ...(typeof body.apiKey === "string" ? { apiKey: body.apiKey } : {}) };
}
function trafficRange(value: string | null): TrafficRange {
  if (value === null || value === "24h") return "24h";
  if (value === "7d" || value === "30d") return value;
  throw new CoreError("invalid_analytics_range", 400, "Traffic Analytics range 仅支持 24h、7d 或 30d。");
}

export function createCoreApp(options: CoreAppOptions) {
  const now = options.now ?? (() => Date.now()); const database = new AppDatabase(options.databasePath);
  const sessions = new SessionStore(options.sessionIdleMs, options.sessionAbsoluteMs, now); const runtimeVault = new RuntimeVault(); const secretVault = new SecretVault(database);
  const connections = new ConnectionService(database, secretVault); const surge = new SurgeTransport(); const events = new EventBus();
  const notifications = new NotificationService(database, secretVault, runtimeVault, events);
  const scheduler = new SchedulerService(database, connections, surge, events, runtimeVault);
  const trafficAnalytics = new TrafficAnalyticsService(database, now);
  const profileHistory = new ProfileHistoryService(database, now);
  const backups = database.location() ? new BackupService(database) : null;
  const auth = new AuthService(database, sessions, runtimeVault); const limiter = new UnlockRateLimiter(now); scheduler.start();

  const server = createServer(async (request, response) => {
    const method = request.method ?? "GET"; const url = new URL(request.url ?? "/", "http://localhost"); const pathname = url.pathname; const sessionToken = cookieValue(request, SESSION_COOKIE);
    try {
      ensureOrigin(request);
      if (method === "GET" && pathname === "/api/health") { sendJson(response, 200, { status: "ok", database: database.quickCheck() ? "ok" : "error", initialized: auth.isInitialized() }); return; }
      if (method === "GET" && pathname === "/api/auth/state") { sendJson(response, 200, auth.state(sessionToken)); return; }
      if (method === "POST" && pathname === "/api/auth/setup") { const body = await readJson(request); const session = await auth.setup(stringField(body, "password"), stringField(body, "confirmPassword")); setSessionCookie(request, response, session.token, session.expiresAt, now()); sendJson(response, 201, auth.state(session.token)); return; }
      if (method === "POST" && pathname === "/api/auth/unlock") {
        const ip = requestIp(request); const retryAfter = limiter.retryAfterSeconds(ip);
        if (retryAfter > 0) { response.setHeader("Retry-After", retryAfter.toString()); events.publish({ type: "unauthorized-ban", fingerprint: `auth:${ip}`, title: "Unauthorized Ban", body: "数据密码连续错误，当前来源已被临时限速。", severity: "warning" }); throw new AuthError("too_many_attempts", 429, "密码错误次数过多，请稍后再试。"); }
        const body = await readJson(request);
        try { const session = await auth.unlock(stringField(body, "password")); limiter.success(ip); setSessionCookie(request, response, session.token, session.expiresAt, now()); sendJson(response, 200, auth.state(session.token)); }
        catch (error) { if (error instanceof AuthError && error.code === "invalid_password") limiter.failure(ip); throw error; } return;
      }
      if (method === "POST" && pathname === "/api/auth/lock") { auth.lock(); clearSessionCookie(request, response); sendJson(response, 200, auth.state(null)); return; }

      if (method === "GET" && pathname === "/api/connections") { requireSession(sessions, sessionToken); sendJson(response, 200, connections.list()); return; }
      if (method === "POST" && pathname === "/api/connections") { const session = requireSession(sessions, sessionToken); const body = await readJson(request); const created = connections.create(asConnectionInput(body), session.vaultKey); scheduler.ensureDefaults(created.id); sendJson(response, 201, created); return; }
      if (method === "POST" && pathname === "/api/connections/import") { const session = requireSession(sessions, sessionToken); const body = await readJson(request); const rawItems = Array.isArray(body.connections) ? body.connections : []; const items = rawItems.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)).map(asConnectionInput); const result = connections.importLegacy(items, session.vaultKey); scheduler.ensureDefaultsForAll(); sendJson(response, 200, result); return; }
      const connectionMatch = pathname.match(/^\/api\/connections\/([^/]+)$/);
      if (connectionMatch) {
        const id = decodeURIComponent(connectionMatch[1] ?? "");
        if (method === "PATCH") { const session = requireSession(sessions, sessionToken); const body = await readJson(request); const patch: Partial<ConnectionInput> = {}; if ("name" in body) patch.name = stringField(body, "name"); if (body.protocol === "http" || body.protocol === "https") patch.protocol = body.protocol; if ("host" in body) patch.host = stringField(body, "host"); if ("port" in body) patch.port = typeof body.port === "number" ? body.port : Number(body.port); if ("platform" in body) patch.platform = body.platform === "ios" || body.platform === "tvos" || body.platform === "macos" ? body.platform : null; if (typeof body.apiKey === "string" && body.apiKey.trim()) patch.apiKey = body.apiKey; sendJson(response, 200, connections.update(id, patch, session.vaultKey)); return; }
        if (method === "DELETE") { requireSession(sessions, sessionToken); connections.delete(id); sendJson(response, 200, { deleted: true }); return; }
      }
      const connectionTestMatch = pathname.match(/^\/api\/connections\/([^/]+)\/test$/);
      if (method === "POST" && connectionTestMatch) { const session = requireSession(sessions, sessionToken); const id = decodeURIComponent(connectionTestMatch[1] ?? ""); sendJson(response, 200, await surge.test(connections.getCredentials(id, session.vaultKey))); return; }

      if (method === "GET" && pathname === "/api/notifications/channels") { requireSession(sessions, sessionToken); sendJson(response, 200, notifications.listChannels()); return; }
      if (method === "POST" && pathname === "/api/notifications/channels") { const session = requireSession(sessions, sessionToken); const body = await readJson(request); sendJson(response, 201, notifications.saveChannel({ name: stringField(body, "name"), endpoint: stringField(body, "endpoint"), enabled: body.enabled !== false }, session.vaultKey)); return; }
      const channelMatch = pathname.match(/^\/api\/notifications\/channels\/([^/]+)$/);
      if (channelMatch) {
        const id = decodeURIComponent(channelMatch[1] ?? "");
        if (method === "PATCH") { const session = requireSession(sessions, sessionToken); const body = await readJson(request); const current = notifications.listChannels().find((channel) => channel.id === id); if (!current) throw new CoreError("channel_not_found", 404, "通知渠道不存在。"); sendJson(response, 200, notifications.saveChannel({ id, name: typeof body.name === "string" ? body.name : current.name, ...(typeof body.endpoint === "string" && body.endpoint.trim() ? { endpoint: body.endpoint } : {}), enabled: typeof body.enabled === "boolean" ? body.enabled : current.enabled }, session.vaultKey)); return; }
        if (method === "DELETE") { requireSession(sessions, sessionToken); notifications.deleteChannel(id); sendJson(response, 200, { deleted: true }); return; }
      }
      const channelTestMatch = pathname.match(/^\/api\/notifications\/channels\/([^/]+)\/test$/);
      if (method === "POST" && channelTestMatch) { const session = requireSession(sessions, sessionToken); await notifications.testChannel(decodeURIComponent(channelTestMatch[1] ?? ""), session.vaultKey); sendJson(response, 200, { sent: true }); return; }
      if (method === "GET" && pathname === "/api/notifications/rules") { requireSession(sessions, sessionToken); sendJson(response, 200, notifications.listRules(url.searchParams.get("channelId") ?? undefined)); return; }
      const ruleMatch = pathname.match(/^\/api\/notifications\/rules\/([^/]+)$/);
      if (method === "PATCH" && ruleMatch) { requireSession(sessions, sessionToken); const body = await readJson(request); sendJson(response, 200, notifications.updateRule(decodeURIComponent(ruleMatch[1] ?? ""), { ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}), ...(typeof body.cooldownSeconds === "number" ? { cooldownSeconds: body.cooldownSeconds } : {}), ...(body.quietStart === null || typeof body.quietStart === "string" ? { quietStart: body.quietStart } : {}), ...(body.quietEnd === null || typeof body.quietEnd === "string" ? { quietEnd: body.quietEnd } : {}), ...(typeof body.timeZone === "string" ? { timeZone: body.timeZone } : {}) })); return; }
      if (method === "GET" && pathname === "/api/notifications/history") { requireSession(sessions, sessionToken); sendJson(response, 200, notifications.listHistory(Number(url.searchParams.get("limit")) || 100)); return; }

      if (method === "GET" && pathname === "/api/automation/jobs") { requireSession(sessions, sessionToken); sendJson(response, 200, scheduler.listJobs()); return; }
      const jobMatch = pathname.match(/^\/api\/automation\/jobs\/([^/]+)$/);
      if (method === "PATCH" && jobMatch) { requireSession(sessions, sessionToken); const body = await readJson(request); sendJson(response, 200, scheduler.updateJob(decodeURIComponent(jobMatch[1] ?? ""), { ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}), ...(typeof body.intervalSeconds === "number" ? { intervalSeconds: body.intervalSeconds } : {}) })); return; }
      const jobRunMatch = pathname.match(/^\/api\/automation\/jobs\/([^/]+)\/run$/);
      if (method === "POST" && jobRunMatch) { requireSession(sessions, sessionToken); sendJson(response, 200, await scheduler.runNow(decodeURIComponent(jobRunMatch[1] ?? ""))); return; }
      if (method === "GET" && pathname === "/api/automation/runs") { requireSession(sessions, sessionToken); sendJson(response, 200, scheduler.listRuns(Number(url.searchParams.get("limit")) || 100)); return; }

      if (method === "GET" && pathname === "/api/backups") { requireSession(sessions, sessionToken); sendJson(response, 200, requireBackups(backups).list()); return; }
      if (method === "POST" && pathname === "/api/backups") { requireSession(sessions, sessionToken); sendJson(response, 201, await requireBackups(backups).create("manual")); return; }
      if (method === "POST" && pathname === "/api/backups/validate") {
        requireSession(sessions, sessionToken);
        const body = await readJson(request);
        const id = stringField(body, "id").trim();
        if (!id) throw new CoreError("backup_id_required", 400, "备份校验需要 id。");
        sendJson(response, 200, await requireBackups(backups).validate(id));
        return;
      }

      if (method === "GET" && pathname === "/api/analytics/traffic") {
        requireSession(sessions, sessionToken);
        const connectionId = url.searchParams.get("connectionId")?.trim() ?? "";
        if (!connectionId) throw new CoreError("connection_required", 400, "Traffic Analytics 需要 connectionId。");
        connections.get(connectionId);
        const range = trafficRange(url.searchParams.get("range"));
        sendJson(response, 200, { connectionId, range, points: trafficAnalytics.query(connectionId, range) });
        return;
      }

      if (method === "GET" && pathname === "/api/profile-history") {
        requireSession(sessions, sessionToken);
        const connectionId = url.searchParams.get("connectionId")?.trim() ?? "";
        if (!connectionId) throw new CoreError("connection_required", 400, "配置历史需要 connectionId。");
        connections.get(connectionId);
        sendJson(response, 200, profileHistory.list(connectionId, Number(url.searchParams.get("limit")) || 100));
        return;
      }
      if (method === "POST" && pathname === "/api/profile-history/capture") {
        const session = requireSession(sessions, sessionToken);
        const body = await readJson(request);
        const connectionId = stringField(body, "connectionId").trim();
        if (!connectionId) throw new CoreError("connection_required", 400, "配置快照需要 connectionId。");
        const result = await surge.request(connections.getCredentials(connectionId, session.vaultKey), "GET", "/v1/profiles/current?sensitive=0", null, {}, 10_000);
        if (result.statusCode < 200 || result.statusCode >= 300) throw new CoreError("profile_snapshot_http_error", 502, `配置读取返回 HTTP ${result.statusCode}。`);
        sendJson(response, 201, profileHistory.capture(connectionId, result.body, "manual"));
        return;
      }
      if (method === "GET" && pathname === "/api/profile-history/diff") {
        requireSession(sessions, sessionToken);
        const connectionId = url.searchParams.get("connectionId")?.trim() ?? "";
        const from = url.searchParams.get("from")?.trim() ?? "";
        const to = url.searchParams.get("to")?.trim() ?? "";
        if (!connectionId || !from || !to) throw new CoreError("profile_diff_required", 400, "配置 Diff 需要 connectionId、from 与 to。");
        connections.get(connectionId);
        sendJson(response, 200, profileHistory.diff(connectionId, from, to));
        return;
      }
      const profileHistoryMatch = pathname.match(/^\/api\/profile-history\/([^/]+)$/);
      if (method === "GET" && profileHistoryMatch) {
        requireSession(sessions, sessionToken);
        const connectionId = url.searchParams.get("connectionId")?.trim() ?? "";
        if (!connectionId) throw new CoreError("connection_required", 400, "读取配置快照需要 connectionId。");
        connections.get(connectionId);
        sendJson(response, 200, profileHistory.get(connectionId, decodeURIComponent(profileHistoryMatch[1] ?? "")));
        return;
      }

      const proxyMatch = pathname.match(/^\/api\/surge\/([^/]+)(\/v1(?:\/.*)?)$/);
      if (proxyMatch) { const session = requireSession(sessions, sessionToken); const id = decodeURIComponent(proxyMatch[1] ?? ""); const apiPath = `${proxyMatch[2] ?? "/v1"}${url.search}`; const body = method === "GET" || method === "HEAD" ? null : await readBuffer(request, MAX_PROXY_BODY_BYTES); const result = await surge.request(connections.getCredentials(id, session.vaultKey), method, apiPath, body && body.length > 0 ? body : null, { accept: typeof request.headers.accept === "string" ? request.headers.accept : undefined, contentType: typeof request.headers["content-type"] === "string" ? request.headers["content-type"] : undefined }); response.statusCode = result.statusCode; response.setHeader("Cache-Control", "no-store"); response.setHeader("X-Content-Type-Options", "nosniff"); if (result.contentType) response.setHeader("Content-Type", result.contentType); response.end(result.body); return; }

      sendJson(response, 404, { error: { code: "not_found", message: "API endpoint not found." } });
    } catch (error) {
      if (error instanceof CoreError) { sendJson(response, error.statusCode, { error: { code: error.code, message: error.message.trim() } }); return; }
      const message = error instanceof Error ? error.message : "unknown error"; console.error(`[core] ${method} ${pathname} failed: ${message}`); sendJson(response, 500, { error: { code: "internal_error", message: "Core 服务发生内部错误。" } });
    }
  });

  server.on("close", () => { scheduler.stop(); notifications.close(); sessions.clear(); runtimeVault.lock(); database.close(); });
  return { server, address(): AddressInfo | null { const address = server.address(); return address && typeof address !== "string" ? address : null; } };
}
