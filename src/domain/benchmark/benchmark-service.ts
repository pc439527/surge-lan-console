/**
 * Unified policy benchmark service (v0.6.0, P0-1).
 *
 * Single pipeline for BOTH "test one group" and "一键测速 (test all groups)".
 * Before this service the two mutations ran different logic — the test-all
 * path only kept POST /v1/policy_groups/test responses, whose documented
 * contract is just { "available": [...] } with NO latency. The Node Quality
 * page then saw zero "已有测速" entries.
 *
 * Ground truth (NSSurge manual, manual.nssurge.com/tools/http-api.html):
 *   POST /v1/policy_groups/test
 *     → { "available": ["ProxyA", "ProxyB"] }   (no latency guaranteed)
 *   GET  /v1/policies/benchmark_results          (Mac 4.2.4+)
 *     → { [lineHash]: { lastTestScoreInMS, lastTestDate,
 *                       lastTestErrorMessage, testing } }
 *
 * Pipeline:
 *   1. POST /policy_groups/test × N  (sequentially — don't flood Surge)
 *   2. ONE GET /policies/benchmark_results AFTER all groups finished
 *   3. lineHash-aligned merge per policy, POST latency taking priority
 *
 * Output is the exact PolicyGroupTestResults shape the pages already read
 * (group → policy → { ok, latency }) — no new view-model needed.
 */
import type { Policy, PolicyBenchmarkResults, PolicyGroupTestResults, PolicyTestEntry } from "@/api/types";
import type { SurgeClient } from "@/api/surge-client";

/** A testable slice of SurgeClient — only the two calls the pipeline needs. */
export type BenchmarkTransport = Pick<SurgeClient, "testPolicyGroup" | "getPolicyBenchmarkResults">;

export interface BenchmarkGroupInput {
  name: string;
  policies: Policy[];
}

/** Where a policy's final latency came from — diagnostics and future UI. */
export type BenchmarkLatencySource = "post" | "benchmark" | "unavailable";

export interface BenchmarkPolicyOutcome {
  name: string;
  group: string;
  ok: boolean;
  latency: number | null;
  source: BenchmarkLatencySource;
}

/** Parse a POST/benchmark latency value (number or numeric string) → ms or null. */
function latencyMsOf(entry: PolicyTestEntry | undefined): number | null {
  const raw = entry?.latency;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) return Math.round(raw);
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  }
  return null;
}

/**
 * Pure per-policy merge (exported for unit tests):
 *   1. POST latency wins when the POST response carried receive/latency.
 *   2. Otherwise align lineHash → benchmark_results.lastTestScoreInMS
 *      (an error message on the benchmark entry only keeps the score when the
 *      POST itself declared the policy reachable).
 *   3. POST-declared reachable, no latency anywhere → reachable, no number.
 *   4. Otherwise → unreachable (Timeout).
 */
export function mergePolicyBenchmark(
  policy: Pick<Policy, "name" | "lineHash">,
  postEntry: PolicyTestEntry | undefined,
  benchmarks: PolicyBenchmarkResults | undefined,
): PolicyTestEntry {
  const declaredReachable = postEntry?.ok === true;
  const postLatency = latencyMsOf(postEntry);
  if (postLatency !== null) {
    return { ok: true, latency: postLatency };
  }
  const benchmark = policy.lineHash ? benchmarks?.[policy.lineHash] : undefined;
  const score = benchmark?.lastTestScoreInMS;
  const noError = benchmark?.lastTestErrorMessage == null;
  if (typeof score === "number" && Number.isFinite(score) && score > 0 && (noError || declaredReachable)) {
    return { ok: true, latency: Math.round(score) };
  }
  if (declaredReachable) {
    return { ok: true, latency: null };
  }
  return { ok: false, latency: "Timeout" };
}

/**
 * The unified benchmark pipeline. Runs the requested group tests sequentially,
 * then reads benchmark_results exactly ONCE (when the platform exposes it) and
 * merges every policy. Older platforms without benchmark_results keep the POST
 * availability data — the merge handles that gracefully.
 */
export async function benchmarkPolicyGroups(
  client: BenchmarkTransport,
  groups: BenchmarkGroupInput[],
  signal?: AbortSignal,
): Promise<PolicyGroupTestResults> {
  // 1) POST every group sequentially so Surge is not flooded by concurrent benchmarks.
  const postResults = new Map<string, Record<string, PolicyTestEntry>>();
  for (const group of groups) {
    const result = await client.testPolicyGroup(group.name, signal);
    postResults.set(group.name, result.results);
  }

  // 2) ONE read of /policies/benchmark_results AFTER all tests completed, so
  //    the newest scores cover every policy in every group.
  let benchmarks: PolicyBenchmarkResults | undefined;
  try {
    benchmarks = await client.getPolicyBenchmarkResults(signal);
  } catch {
    benchmarks = undefined; // older platforms: availability data still stands
  }

  // 3) Merge per group/policy.
  const results: PolicyGroupTestResults = {};
  for (const group of groups) {
    const post = postResults.get(group.name) ?? {};
    const entries: Record<string, PolicyTestEntry> = {};
    for (const policy of group.policies) {
      entries[policy.name] = mergePolicyBenchmark(policy, post[policy.name], benchmarks);
    }
    results[group.name] = entries;
  }
  return results;
}
