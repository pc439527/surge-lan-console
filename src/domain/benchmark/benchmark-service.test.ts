import { describe, expect, it, vi } from "vitest";
import { benchmarkPolicyGroups, mergePolicyBenchmark } from "./benchmark-service";
import type { PolicyGroupTestResults } from "@/api/types";
import type { BenchmarkTransport } from "./benchmark-service";

const HK_01 = { name: "HK 01", typeDescription: "ss", lineHash: "line-hk1" };
const HK_02 = { name: "HK 02", typeDescription: "ss", lineHash: "line-hk2" };
const TG_01 = { name: "TG 01", typeDescription: "ss", lineHash: "line-tg" };

describe("mergePolicyBenchmark (pure merge)", () => {
  const benchmarks = {
    "line-tg": { lastTestScoreInMS: 88, lastTestErrorMessage: null, lastTestDate: 1, testing: 0 },
    "line-hk2": { lastTestScoreInMS: 66, lastTestErrorMessage: null, lastTestDate: 1, testing: 0 },
  };

  it("POST latency wins when the POST response carried receive timings", () => {
    const merged = mergePolicyBenchmark(HK_01, { ok: true, latency: 41.6 }, benchmarks);
    expect(merged).toEqual({ ok: true, latency: 42 });
  });

  it("falls back to benchmark_results via lineHash when the POST has no latency", () => {
    // The official doc contract: POST /policy_groups/test → { available: [...] }
    const merged = mergePolicyBenchmark(TG_01, { ok: true, latency: null }, benchmarks);
    expect(merged).toEqual({ ok: true, latency: 88 });
  });

  it("keeps POST availability when benchmark_results is absent (older platforms)", () => {
    const merged = mergePolicyBenchmark(HK_02, { ok: true, latency: null }, undefined);
    expect(merged).toEqual({ ok: true, latency: null });
  });

  it("ignores a benchmark score that carries an error unless the POST declared reachability", () => {
    const failing = { "line-hk1": { lastTestScoreInMS: 55, lastTestErrorMessage: "boom", lastTestDate: 1, testing: 0 } };
    expect(mergePolicyBenchmark(HK_01, { ok: true, latency: null }, failing)).toEqual({ ok: true, latency: 55 });
    expect(mergePolicyBenchmark(HK_01, undefined, failing)).toEqual({ ok: false, latency: "Timeout" });
  });

  it("treats policies not declared reachable and without benchmark data as Timeout", () => {
    expect(mergePolicyBenchmark(HK_02, undefined, undefined)).toEqual({ ok: false, latency: "Timeout" });
  });
});

describe("benchmarkPolicyGroups (unified pipeline, P0-1)", () => {
  function makeClient(opts: { benchmarksEnabled?: boolean; benchmarks?: Record<string, unknown> } = {}) {
    const testPolicyGroup = vi.fn(async (group: string) => {
      if (group === "Proxy") {
        return { available: ["HK 01", "HK 02"], results: { "HK 01": { ok: true, latency: 41.6 }, "HK 02": { ok: true, latency: null } } };
      }
      if (group === "Telegram") {
        return { available: ["TG 01"], results: { "TG 01": { ok: true, latency: null } } };
      }
      return { available: [], results: {} };
    });
    const getPolicyBenchmarkResults = vi.fn(async () => {
      if (opts.benchmarksEnabled === false) throw new Error("NOT_FOUND");
      return (opts.benchmarks ?? {
        "line-tg": { lastTestScoreInMS: 88, lastTestErrorMessage: null, lastTestDate: 1, testing: 0 },
        "line-hk2": { lastTestScoreInMS: 66, lastTestErrorMessage: null, lastTestDate: 1, testing: 0 },
      }) as Record<string, unknown>;
    });
    return { testPolicyGroup, getPolicyBenchmarkResults } as unknown as BenchmarkTransport & { testPolicyGroup: ReturnType<typeof vi.fn>; getPolicyBenchmarkResults: ReturnType<typeof vi.fn> };
  }

  it("POSTs every group sequentially, then reads benchmark_results exactly ONCE", async () => {
    const client = makeClient();
    const results = await benchmarkPolicyGroups(client, [
      { name: "Proxy", policies: [HK_01, HK_02] },
      { name: "Telegram", policies: [TG_01] },
    ]);
    expect(client.testPolicyGroup).toHaveBeenCalledTimes(2);
    expect(client.getPolicyBenchmarkResults).toHaveBeenCalledTimes(1);
    expect(results.Proxy["HK 01"]).toEqual({ ok: true, latency: 42 });
    expect(results.Proxy["HK 02"]).toEqual({ ok: true, latency: 66 });
    expect(results.Telegram["TG 01"]).toEqual({ ok: true, latency: 88 });
  });

  it("survives a missing benchmark endpoint — availability data still stands", async () => {
    const client = makeClient({ benchmarksEnabled: false });
    const results = await benchmarkPolicyGroups(client, [{ name: "Proxy", policies: [HK_01, HK_02] }]);
    expect(results.Proxy["HK 01"]).toEqual({ ok: true, latency: 42 });
    expect(results.Proxy["HK 02"]).toEqual({ ok: true, latency: null });
  });
});

describe("P0-1 end-to-end shape", () => {
  it("produces the exact PolicyGroupTestResults shape the pages consume", async () => {
    const client = makeClientWithBenchmarks();
    const results = await benchmarkPolicyGroups(client, [{ name: "Proxy", policies: [HK_01, HK_02] }]);
    const typed: PolicyGroupTestResults = results;
    expect(typed.Proxy["HK 01"]?.ok).toBe(true);
    expect(typed.Proxy["HK 02"]?.latency).toBe(66);
  });

  function makeClientWithBenchmarks() {
    const testPolicyGroup = vi.fn(async () => ({ available: ["HK 01", "HK 02"], results: { "HK 01": { ok: true, latency: null }, "HK 02": { ok: true, latency: null } } }));
    const getPolicyBenchmarkResults = vi.fn(async () => ({ "line-hk2": { lastTestScoreInMS: 66, lastTestErrorMessage: null } }));
    return { testPolicyGroup, getPolicyBenchmarkResults } as unknown as BenchmarkTransport;
  }
});
