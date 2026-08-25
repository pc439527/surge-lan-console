import { CoreError } from "./errors.js";

export const DEFAULT_DNS_HEALTH_DOMAIN = "www.apple.com";
export const DNS_HIGH_LATENCY_MS = 500;

const DELAY_KEYS = ["delay", "latency", "timeCost", "time_cost", "duration", "ms"] as const;
const NESTED_KEYS = ["result", "data", "dns", "measurement"] as const;

/**
 * Normalize the response of POST /v1/test/dns_delay to milliseconds.
 * Surge builds have returned both seconds-like fractional values and explicit
 * millisecond values/strings, so keep parsing tolerant while only accepting
 * delay-related fields (never arbitrary numeric properties such as status/code).
 */
export function parseDnsDelayMs(body: Buffer | string): number {
  const text = Buffer.isBuffer(body) ? body.toString("utf8") : body;
  let payload: unknown = text.trim();
  if (!payload) throw parseError();

  try {
    payload = JSON.parse(String(payload)) as unknown;
  } catch {
    // Some builds/proxies may surface a plain scalar string. Parse it below.
  }

  const delay = findDelay(payload);
  if (delay === null) throw parseError();
  return delay;
}

export function dnsHealthDomainFromConfig(configJson: string): string {
  try {
    const parsed = JSON.parse(configJson) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return DEFAULT_DNS_HEALTH_DOMAIN;
    const value = (parsed as Record<string, unknown>).domain;
    if (typeof value !== "string") return DEFAULT_DNS_HEALTH_DOMAIN;
    const domain = value.trim();
    if (!isSafeDomain(domain)) return DEFAULT_DNS_HEALTH_DOMAIN;
    return domain;
  } catch {
    return DEFAULT_DNS_HEALTH_DOMAIN;
  }
}

function findDelay(value: unknown): number | null {
  const direct = scalarToMs(value);
  if (direct !== null) return direct;

  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = findDelay(item);
      if (candidate !== null) return candidate;
    }
    return null;
  }

  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;

  for (const key of DELAY_KEYS) {
    if (!(key in record)) continue;
    const candidate = scalarToMs(record[key]);
    if (candidate !== null) return candidate;
  }

  for (const key of NESTED_KEYS) {
    if (!(key in record)) continue;
    const candidate = findDelay(record[key]);
    if (candidate !== null) return candidate;
  }

  return null;
}

function scalarToMs(value: unknown): number | null {
  if (typeof value === "number") return normalizeNumericDelay(value);
  if (typeof value !== "string") return null;

  const text = value.trim().toLowerCase();
  if (!text) return null;

  const msMatch = text.match(/^(-?\d+(?:\.\d+)?)\s*ms(?:ec(?:ond)?s?)?$/i);
  if (msMatch) return normalizeExplicitMs(Number(msMatch[1]));

  const secondsMatch = text.match(/^(-?\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?$/i);
  if (secondsMatch) {
    const seconds = Number(secondsMatch[1]);
    return Number.isFinite(seconds) && seconds >= 0 ? roundMs(seconds * 1000) : null;
  }

  const numeric = Number(text);
  return normalizeNumericDelay(numeric);
}

function normalizeNumericDelay(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  // The existing Surge DNS UI already observes fractional (<1) values as
  // seconds. Preserve that compatibility, while integral/larger values are ms.
  return roundMs(value > 0 && value < 1 ? value * 1000 : value);
}

function normalizeExplicitMs(value: number): number | null {
  return Number.isFinite(value) && value >= 0 ? roundMs(value) : null;
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

function isSafeDomain(value: string): boolean {
  return value.length > 0 && value.length <= 253 && !/[\s/:\\]/.test(value) && /^[A-Za-z0-9._-]+$/.test(value);
}

function parseError(): CoreError {
  return new CoreError("dns_delay_parse_error", 502, "DNS Delay API 返回了无法识别的延迟结果。");
}
