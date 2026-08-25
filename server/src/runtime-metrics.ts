import { CoreError } from "./errors.js";

export interface RuntimeMetricValues {
  uptimeSeconds: number | null;
  memoryBytes: number | null;
  activeRequests: number | null;
  dnsCacheEntries: number | null;
  activeBans: number | null;
}

const METRIC_NAMES = {
  surge_uptime_seconds: "uptimeSeconds",
  surge_memory_bytes: "memoryBytes",
  surge_active_requests: "activeRequests",
  surge_dns_cache_entries: "dnsCacheEntries",
  surge_active_bans: "activeBans",
} as const;

export function parseRuntimeMetrics(body: Buffer | string): RuntimeMetricValues {
  const text = typeof body === "string" ? body : body.toString("utf8");
  const values: RuntimeMetricValues = {
    uptimeSeconds: null,
    memoryBytes: null,
    activeRequests: null,
    dnsCacheEntries: null,
    activeBans: null,
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{[^}]*\})?\s+([^\s]+)(?:\s+\d+)?$/);
    if (!match) continue;
    const metric = match[1] as keyof typeof METRIC_NAMES;
    const key = METRIC_NAMES[metric];
    if (!key) continue;
    const number = Number(match[2]);
    if (!Number.isFinite(number) || number < 0) continue;
    values[key] = number;
  }

  if (Object.values(values).every((value) => value === null)) {
    throw new CoreError("runtime_metrics_parse_error", 502, "Surge Metrics 返回内容中没有可识别的运行指标。");
  }
  return values;
}

export function uptimeFromTraffic(body: Buffer | string, sampledAtMs = Date.now()): number | null {
  let payload: unknown;
  try {
    payload = JSON.parse(typeof body === "string" ? body : body.toString("utf8")) as unknown;
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const raw = (payload as { startTime?: unknown }).startTime;
  const value = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value) || value <= 0) return null;
  const startMs = value < 1_000_000_000_000 ? value * 1000 : value;
  if (startMs > sampledAtMs + 60_000) return null;
  return Math.max(0, (sampledAtMs - startMs) / 1000);
}
