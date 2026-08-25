import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { ConnectionCredentials, PublicConnection } from "./connection-service.js";
import { CoreError } from "./errors.js";

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;

export interface SurgeProxyResult {
  statusCode: number;
  contentType: string | null;
  body: Buffer;
  latencyMs: number;
}

function privateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts as [number, number, number, number];
  return a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127);
}

function privateIpv6(address: string): boolean {
  const value = address.toLowerCase().split("%")[0] ?? "";
  return value.startsWith("fc") || value.startsWith("fd") || /^fe[89ab]/.test(value);
}

export function isPrivateLanAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return privateIpv4(address);
  if (family === 6) return privateIpv6(address);
  return false;
}

async function resolveLanTarget(host: string): Promise<{ address: string; family: number }> {
  if (isIP(host)) {
    if (!isPrivateLanAddress(host)) throw new CoreError("target_not_lan", 400, "安全策略禁止访问非局域网 Surge 地址。");
    return { address: host, family: isIP(host) };
  }

  let results: Awaited<ReturnType<typeof lookup>>;
  try {
    results = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new CoreError("target_dns_failed", 502, "无法解析 Surge 主机名。");
  }
  if (results.length === 0 || results.some((entry) => !isPrivateLanAddress(entry.address))) {
    throw new CoreError("target_not_lan", 400, "安全策略禁止访问解析到公网地址的 Surge 主机。");
  }
  return results[0] as { address: string; family: number };
}

export class SurgeTransport {
  async request(
    credentials: ConnectionCredentials,
    method: string,
    apiPath: string,
    body: Buffer | null = null,
    headers: { accept?: string; contentType?: string } = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<SurgeProxyResult> {
    if (!apiPath.startsWith("/v1/") && apiPath !== "/v1") {
      throw new CoreError("invalid_surge_path", 400, "仅允许访问 Surge /v1 API。");
    }
    const connection = credentials.connection;
    const target = await resolveLanTarget(connection.host);
    const startedAt = Date.now();

    return new Promise<SurgeProxyResult>((resolve, reject) => {
      const requestFn = connection.protocol === "https" ? httpsRequest : httpRequest;
      const request = requestFn({
        protocol: `${connection.protocol}:`,
        hostname: target.address,
        family: target.family,
        port: connection.port,
        method,
        path: apiPath,
        servername: connection.protocol === "https" ? connection.host : undefined,
        headers: {
          Host: `${connection.host}:${connection.port}`,
          "X-Key": credentials.apiKey,
          Accept: headers.accept ?? "application/json",
          ...(headers.contentType ? { "Content-Type": headers.contentType } : {}),
          ...(body ? { "Content-Length": body.length } : {}),
        },
      }, (response) => {
        const chunks: Buffer[] = [];
        let total = 0;
        response.on("data", (chunk: Buffer | string) => {
          const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          total += value.length;
          if (total > MAX_RESPONSE_BYTES) {
            response.destroy(new Error("response too large"));
            return;
          }
          chunks.push(value);
        });
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode ?? 502,
            contentType: typeof response.headers["content-type"] === "string" ? response.headers["content-type"] : null,
            body: Buffer.concat(chunks),
            latencyMs: Date.now() - startedAt,
          });
        });
        response.on("error", () => reject(new CoreError("surge_response_error", 502, "读取 Surge 响应失败。")));
      });

      request.setTimeout(timeoutMs, () => request.destroy(new Error("timeout")));
      request.on("error", (error) => {
        reject(new CoreError(
          error.message === "timeout" ? "surge_timeout" : "surge_unreachable",
          error.message === "timeout" ? 504 : 502,
          error.message === "timeout" ? "Surge API 请求超时。" : "无法连接到 Surge 设备。",
        ));
      });
      if (body) request.write(body);
      request.end();
    });
  }

  async test(credentials: ConnectionCredentials): Promise<{ reachable: boolean; authenticated: boolean; latencyMs: number | null; statusCode: number | null }> {
    try {
      const result = await this.request(credentials, "GET", "/v1/outbound", null, {}, 5_000);
      return {
        reachable: true,
        authenticated: result.statusCode >= 200 && result.statusCode < 300,
        latencyMs: result.latencyMs,
        statusCode: result.statusCode,
      };
    } catch (error) {
      if (error instanceof CoreError && error.code === "target_not_lan") throw error;
      return { reachable: false, authenticated: false, latencyMs: null, statusCode: null };
    }
  }

  async testEphemeral(connection: PublicConnection, apiKey: string): Promise<{ reachable: boolean; authenticated: boolean; latencyMs: number | null; statusCode: number | null }> {
    return this.test({ connection, apiKey });
  }
}
