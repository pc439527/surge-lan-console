import { CoreError } from "./errors.js";

export interface PolicyNodeHealth {
  key: string;
  name: string;
  groups: string[];
  reachable: boolean;
  latencyMs: number | null;
}

interface NodeObservation {
  group: string;
  reachable: boolean;
  latencyMs: number | null;
}

function normalizeNodeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function latencyOf(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

function observationOf(value: unknown): { reachable: boolean; latencyMs: number | null } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const latencyMs = latencyOf(row.latency ?? row.receive ?? row.lastTestScoreInMS);
  if (typeof row.ok === "boolean") return { reachable: row.ok, latencyMs };
  if (latencyMs !== null) return { reachable: true, latencyMs };

  const errorText = String(row.error ?? row.lastTestErrorMessage ?? row.message ?? "").toLowerCase();
  if (errorText.includes("timeout") || errorText.includes("fail") || errorText.includes("error")) {
    return { reachable: false, latencyMs: null };
  }
  return null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  const left = sorted[middle - 1];
  const right = sorted[middle];
  return left === undefined || right === undefined ? null : (left + right) / 2;
}

export function parsePolicyNodeHealth(body: Buffer | string): PolicyNodeHealth[] {
  let payload: unknown;
  try {
    payload = JSON.parse(typeof body === "string" ? body : body.toString("utf8")) as unknown;
  } catch {
    throw new CoreError("policy_health_parse_error", 502, "策略节点测试结果不是有效 JSON。");
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new CoreError("policy_health_parse_error", 502, "策略节点测试结果结构无法识别。");
  }

  const buckets = new Map<string, { name: string; observations: NodeObservation[] }>();
  for (const [group, rawEntries] of Object.entries(payload as Record<string, unknown>)) {
    if (!rawEntries || typeof rawEntries !== "object" || Array.isArray(rawEntries)) continue;
    for (const [name, rawValue] of Object.entries(rawEntries as Record<string, unknown>)) {
      const observation = observationOf(rawValue);
      if (!observation) continue;
      const key = normalizeNodeName(name);
      const bucket = buckets.get(key) ?? { name: name.trim() || name, observations: [] };
      bucket.observations.push({ group, ...observation });
      buckets.set(key, bucket);
    }
  }

  return [...buckets.entries()].map(([key, bucket]) => {
    const measured = bucket.observations
      .map((item) => item.latencyMs)
      .filter((value): value is number => value !== null);
    return {
      key,
      name: bucket.name,
      groups: [...new Set(bucket.observations.map((item) => item.group))].sort((a, b) => a.localeCompare(b)),
      reachable: bucket.observations.some((item) => item.reachable),
      latencyMs: median(measured),
    };
  });
}
