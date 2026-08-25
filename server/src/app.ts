import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { AppDatabase } from "./database.js";
import { AuthError, AuthService } from "./auth-service.js";
import { SessionStore } from "./session-store.js";

const SESSION_COOKIE = "slc_session";
const MAX_JSON_BODY_BYTES = 16 * 1024;

interface CoreAppOptions {
  databasePath: string;
  sessionIdleMs: number;
  sessionAbsoluteMs: number;
  now?: () => number;
}

interface AttemptBucket {
  failures: number;
  windowStartedAt: number;
  blockedUntil: number;
}

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

  success(key: string): void {
    this.buckets.delete(key);
  }
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_JSON_BODY_BYTES) {
      throw new AuthError("request_too_large", 413, "请求内容过大。 ");
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("body must be an object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new AuthError("invalid_json", 400, "请求 JSON 无法解析。 ");
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

function setSessionCookie(
  request: IncomingMessage,
  response: ServerResponse,
  token: string,
  expiresAt: number,
  now: number,
): void {
  const maxAge = Math.max(1, Math.floor((expiresAt - now) / 1000));
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAge}`,
    "Priority=High",
  ];
  if (isSecureRequest(request)) parts.push("Secure");
  response.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(request: IncomingMessage, response: ServerResponse): void {
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
    "Priority=High",
  ];
  if (isSecureRequest(request)) parts.push("Secure");
  response.setHeader("Set-Cookie", parts.join("; "));
}

function requestIp(request: IncomingMessage): string {
  const forwardedFor = request.headers["x-forwarded-for"];
  const first = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)?.split(",")[0]?.trim();
  return first || request.socket.remoteAddress || "unknown";
}

export function createCoreApp(options: CoreAppOptions) {
  const now = options.now ?? (() => Date.now());
  const database = new AppDatabase(options.databasePath);
  const sessions = new SessionStore(options.sessionIdleMs, options.sessionAbsoluteMs, now);
  const auth = new AuthService(database, sessions);
  const limiter = new UnlockRateLimiter(now);

  const server = createServer(async (request, response) => {
    const method = request.method ?? "GET";
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    const sessionToken = cookieValue(request, SESSION_COOKIE);

    try {
      if (method === "GET" && pathname === "/api/health") {
        sendJson(response, 200, {
          status: "ok",
          database: database.quickCheck() ? "ok" : "error",
          initialized: auth.isInitialized(),
        });
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
          throw new AuthError("too_many_attempts", 429, "密码错误次数过多，请稍后再试。 ");
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
        auth.lock(sessionToken);
        clearSessionCookie(request, response);
        sendJson(response, 200, auth.state(null));
        return;
      }

      sendJson(response, 404, { error: { code: "not_found", message: "API endpoint not found." } });
    } catch (error) {
      if (error instanceof AuthError) {
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
