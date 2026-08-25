import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { AppDatabase } from "./database.js";
import { AuthError, AuthService } from "./auth-service.js";
import { ConnectionService, type ConnectionInput } from "./connection-service.js";
import { CoreError } from "./errors.js";
import { RuntimeVault } from "./runtime-vault.js";
import { SecretVault } from "./secret-vault.js";
import { SessionStore, type SessionInfo } from "./session-store.js";
import { SurgeTransport } from "./surge-transport.js";

const SESSION_COOKIE = "slc_session";
const MAX_JSON_BODY_BYTES = 256 * 1024;
const MAX_PROXY_BODY_BYTES = 2 * 1024 * 1024;

interface CoreAppOptions {
  databasePath: string;
  sessionIdleMs: number;
  sessionAbsoluteMs: number;
  now?: () => number;
}

interface AttemptBucket { failures: number; windowStartedAt: number; blockedUntil: number }

class UnlockRateLimiter {
  private readonly buckets = new Map<string, AttemptBucket>();
  constructor(private readonly now: () => number) {}
  retryAfterSeconds(key: string): number {
    const bucket = this.buckets.get(key);
    if (!bucket) return 0;
    const remaining = bucket.blockedUntil - this.now();
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }
  failure(key: string): void {
    const now = this.now();
    const bucket = this.buckets.get(key);
    if (!bucket || now - bucket.windowStartedAt > 60_000) {
      this.buckets.set(key, { failures: 1, windowStartedAt: now, blockedUntil: 0 });
      return;
    }
    bucket.failures += 1;
    if (bucket.failures >= 5) bucket.blockedUntil = now + 60_000;
  }
  success(key: string): void { this.buckets.delete(key); }
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.end(JSON.stringify(body));
}

async function readBuffer(request: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > limit) throw new CoreError("request_too_large", 413, "请求内容过大。");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const buffer = await readBuffer(request, MAX_JSON_BODY_BYTES);
  if (buffer.length === 0) return {};
  try {
    const parsed = JSON.parse(buffer.toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object required");
    return parsed as Record<string, unknown>;
  } catch {
    throw new CoreError("invalid_json", 400, "请求 JSON 无法解析。");
  }
}

function stringField(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value : "";
}

function cookieValue(request: IncomingMessage, name: string): string | null {
  const cookie = request.headers.cookie;
  if (!cookie) return null;
  for (const segment of cookie.split(";")) {
    const [rawName, ...rest] = segment.trim().split("=");
    if (rawName === name) return rest.join("=");
  }
  return null;
}

function isSecureRequest(request: IncomingMessage): boolean {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  return proto?.split(",")[0]?.trim() === "https";
}

function setSessionCookie(request: IncomingMessage, response: ServerResponse, token: string, expiresAt: number, now: number): void {
  const maxAge = Math.max(1, Math.floor((expiresAt - now) / 1000));
  const parts = [`${SESSION_COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${maxAge}`, "Priority=High"];
  if (isSecureRequest(request)) parts.push("Secure");
  response.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(request: IncomingMessage, response: ServerResponse): void {
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=0", "Priority=High"];
  if (isSecureRequest(request)) parts.push("Secure");
  response.setHeader("Set-Cookie", parts.join("; "));
}

function requestIp(request: IncomingMessage): string {
  const forwardedFor = request.headers["x-forwarded-for"];
  const first = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)?.split(",")[0]?.trim();
  return first || request.socket.remoteAddress || "unknown";
}

function ensureOrigin(request: IncomingMessage): void {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method ?? "GET")) return;
  const origin = request.headers.origin;
  if (!origin || Array.isArray(origin)) return;
  try {
    if (new URL(origin).host !== request.headers.host) throw new Error("origin mismatch");
  } catch {
    throw new CoreError("origin_rejected", 403, "请求来源校验失败。");
  }
}

function requireSession(sessions: SessionStore, token: string | null): SessionInfo {
  const session = sessions.get(token);
  if (!session) throw new CoreError("session_required", 401, "控制台已锁定，请重新输入数据密码。");
  return session;
}

function asConnectionInput(body: Record<string, unknown>): ConnectionInput {
  const platform = typeof body.platform === "string" ? body.platform : null;
  return {
    ...(typeof body.id === "string" ? { id: body.id } : {}),
    name: stringField(body, "name"),
    protocol: body.protocol === "https" ? "https" : "http",
    host: stringField(body, "host"),
    port: typeof body.port === "number" ? body.port : Number(body.port),
    platform: platform === "ios" || platform === "tvos" || platform === "macos" ? platform : null,
    ...(typeof body.apiKey === "string" ? { apiKey: body.apiKey } : {}),
  };
}

export function createCoreApp(options: CoreAppOptions) {
  const now = options.now ?? (() => Date.now());
  const database = new AppDatabase(options.databasePath);
  const sessions = new SessionStore(options.sessionIdleMs, options.sessionAbsoluteMs, now);
  const runtimeVault = new RuntimeVault();
  const secretVault = new SecretVault(database);
  const connections = new ConnectionService(database, secretVault);
  const surge = new SurgeTransport();
  const auth = new AuthService(database, sessions, runtimeVault);
  const limiter = new UnlockRateLimiter(now);

  const server = createServer(async (request, response) => {
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "/", "http://localhost");
    const pathname = url.pathname;
    const sessionToken = cookieValue(request, SESSION_COOKIE);

    try {
      ensureOrigin(request);

      if (method === "GET" && pathname === "/api/health") {
        sendJson(response, 200, { status: "ok", database: database.quickCheck() ? "ok" : "error", initialized: auth.isInitialized() });
        return;
      }
      if (method === "GET" && pathname === "/api/auth/state") {
        sendJson(response, 200, auth.state(sessionToken));
        return;
      }
      if (method === "POST" && pathname === "/api/auth/setup") {
        const body = await readJson(request);
        const session = await auth.setup(stringField(body, "password"), stringField(body, "confirmPassword"));
        setSessionCookie(request, response, session.token, session.expiresAt, now());
        sendJson(response, 201, auth.state(session.token));
        return;
      }
      if (method === "POST" && pathname === "/api/auth/unlock") {
        const ip = requestIp(request);
        const retryAfter = limiter.retryAfterSeconds(ip);
        if (retryAfter > 0) {
          response.setHeader("Retry-After", retryAfter.toString());
          throw new AuthError("too_many_attempts", 429, "密码错误次数过多，请稍后再试。");
        }
        const body = await readJson(request);
        try {
          const session = await auth.unlock(stringField(body, "password"));
          limiter.success(ip);
          setSessionCookie(request, response, session.token, session.expiresAt, now());
          sendJson(response, 200, auth.state(session.token));
        } catch (error) {
          if (error instanceof AuthError && error.code === "invalid_password") limiter.failure(ip);
          throw error;
        }
        return;
      }
      if (method === "POST" && pathname === "/api/auth/lock") {
        auth.lock();
        clearSessionCookie(request, response);
        sendJson(response, 200, auth.state(null));
        return;
      }

      if (method === "GET" && pathname === "/api/connections") {
        requireSession(sessions, sessionToken);
        sendJson(response, 200, connections.list());
        return;
      }
      if (method === "POST" && pathname === "/api/connections") {
        const session = requireSession(sessions, sessionToken);
        const body = await readJson(request);
        sendJson(response, 201, connections.create(asConnectionInput(body), session.vaultKey));
        return;
      }
      if (method === "POST" && pathname === "/api/connections/import") {
        const session = requireSession(sessions, sessionToken);
        const body = await readJson(request);
        const rawItems = Array.isArray(body.connections) ? body.connections : [];
        const items = rawItems.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)).map(asConnectionInput);
        sendJson(response, 200, connections.importLegacy(items, session.vaultKey));
        return;
      }

      const connectionMatch = pathname.match(/^\/api\/connections\/([^/]+)$/);
      if (connectionMatch) {
        const id = decodeURIComponent(connectionMatch[1] ?? "");
        if (method === "PATCH") {
          const session = requireSession(sessions, sessionToken);
          const body = await readJson(request);
          const patch: Partial<ConnectionInput> = {};
          if ("name" in body) patch.name = stringField(body, "name");
          if (body.protocol === "http" || body.protocol === "https") patch.protocol = body.protocol;
          if ("host" in body) patch.host = stringField(body, "host");
          if ("port" in body) patch.port = typeof body.port === "number" ? body.port : Number(body.port);
          if ("platform" in body) patch.platform = body.platform === "ios" || body.platform === "tvos" || body.platform === "macos" ? body.platform : null;
          if (typeof body.apiKey === "string" && body.apiKey.trim()) patch.apiKey = body.apiKey;
          sendJson(response, 200, connections.update(id, patch, session.vaultKey));
          return;
        }
        if (method === "DELETE") {
          requireSession(sessions, sessionToken);
          connections.delete(id);
          sendJson(response, 200, { deleted: true });
          return;
        }
      }

      const connectionTestMatch = pathname.match(/^\/api\/connections\/([^/]+)\/test$/);
      if (method === "POST" && connectionTestMatch) {
        const session = requireSession(sessions, sessionToken);
        const id = decodeURIComponent(connectionTestMatch[1] ?? "");
        sendJson(response, 200, await surge.test(connections.getCredentials(id, session.vaultKey)));
        return;
      }

      const proxyMatch = pathname.match(/^\/api\/surge\/([^/]+)(\/v1(?:\/.*)?)$/);
      if (proxyMatch) {
        const session = requireSession(sessions, sessionToken);
        const id = decodeURIComponent(proxyMatch[1] ?? "");
        const apiPath = `${proxyMatch[2] ?? "/v1"}${url.search}`;
        const body = method === "GET" || method === "HEAD" ? null : await readBuffer(request, MAX_PROXY_BODY_BYTES);
        const result = await surge.request(
          connections.getCredentials(id, session.vaultKey),
          method,
          apiPath,
          body && body.length > 0 ? body : null,
          {
            accept: typeof request.headers.accept === "string" ? request.headers.accept : undefined,
            contentType: typeof request.headers["content-type"] === "string" ? request.headers["content-type"] : undefined,
          },
        );
        response.statusCode = result.statusCode;
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        if (result.contentType) response.setHeader("Content-Type", result.contentType);
        response.end(result.body);
        return;
      }

      sendJson(response, 404, { error: { code: "not_found", message: "API endpoint not found." } });
    } catch (error) {
      if (error instanceof CoreError) {
        sendJson(response, error.statusCode, { error: { code: error.code, message: error.message.trim() } });
        return;
      }
      const message = error instanceof Error ? error.message : "unknown error";
      console.error(`[core] ${method} ${pathname} failed: ${message}`);
      sendJson(response, 500, { error: { code: "internal_error", message: "Core 服务发生内部错误。" } });
    }
  });

  server.on("close", () => {
    sessions.clear();
    runtimeVault.lock();
    database.close();
  });

  return {
    server,
    address(): AddressInfo | null {
      const address = server.address();
      return address && typeof address !== "string" ? address : null;
    },
  };
}
