import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSurgeClientState } from "@/app/surge-client-context";
import { surgeKeys } from "@/lib/surge-keys";
import type { Policy, PolicyGroupTestResults, PolicyTestEntry } from "@/api/types";
import { usePolicyGroupsQuery } from "@/features/shared/queries";
import { findFastestPolicy } from "./fastest-policy";

export { usePolicyGroupsQuery };

function useEnabledClient() {
  const { client, missingKey, connectionId } = useSurgeClientState();
  return { client, enabled: !!client && !missingKey, connectionId };
}

/** Selections are cheap to hold stale — avoids N+1 polling every 10s (Fix 08). */
const SELECTIONS_STALE_MS = 60_000;

/**
 * One batched selections query per group set. Uses Promise.allSettled so a
 * single failing group doesn't fail the whole page, and a long staleTime so
 * the app doesn't re-issue 20 requests every 10 seconds. Mutations update the
 * matching cache keys immediately (same key shape) — see useSelectPolicyMutation.
 */
export function useGroupSelectionsQuery(groupNames: string[]) {
  const { client, enabled, connectionId } = useEnabledClient();
  return useQuery<Record<string, string>>({
    queryKey: surgeKeys.policySelections(connectionId, groupNames),
    queryFn: async ({ signal }) => {
      const settled = await Promise.allSettled(
        groupNames.map(
          async (name): Promise<[string, string]> => [name, await client!.getGroupSelection(name, signal)],
        ),
      );
      const entries: [string, string][] = [];
      for (const item of settled) {
        if (item.status === "fulfilled") entries.push(item.value);
      }
      return Object.fromEntries(entries);
    },
    enabled: enabled && groupNames.length > 0,
    staleTime: SELECTIONS_STALE_MS,
    refetchInterval: false,
  });
}

/** Prefix for every selection key of the active connection, e.g. ["surge", id, "policy-selections"]. */
function selectionsPrefix(connectionId: string | null) {
  return [...surgeKeys.root(connectionId), "policy-selections"] as const;
}

export function useSelectPolicyMutation() {
  const { client, connectionId } = useSurgeClientState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ group, policy }: { group: string; policy: string }) =>
      client!.selectPolicy(group, policy),
    onSuccess: (_d, { group, policy }) => {
      // Fix 08: update EVERY selection cache under this connection via prefix
      // matching — same namespace the query hooks read from.
      queryClient.setQueriesData<Record<string, string> | undefined>(
        { queryKey: selectionsPrefix(connectionId), type: "all" },
        (prev) => ({ ...(prev ?? {}), [group]: policy }),
      );
      toast.success(`${group} 已切换至 ${policy}`);
    },
    onError: () => toast.error("切换策略失败"),
  });
}

export function useTestGroupMutation() {
  const { client, connectionId } = useSurgeClientState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ group, policies }: { group: string; policies: Policy[] }) => {
      const result = await client!.testPolicyGroup(group);
      if (Object.values(result.results).some((entry) => entry.ok && entry.latency == null)) {
        try {
          const benchmarks = await client!.getPolicyBenchmarkResults();
          for (const policy of policies) {
            if (!policy.lineHash) continue;
            const benchmark = benchmarks[policy.lineHash];
            if (!benchmark) continue;
            const score = benchmark.lastTestScoreInMS;
            const declaredReachable = result.available.includes(policy.name);
            if (typeof score === "number" && Number.isFinite(score) && score > 0 &&
                (benchmark.lastTestErrorMessage == null || declaredReachable)) {
              result.results[policy.name] = { ok: true, latency: Math.round(score) };
            } else if (!declaredReachable) {
              result.results[policy.name] = { ok: false, latency: "Timeout" };
            }
          }
          result.available = Object.keys(result.results).filter((name) => result.results[name].ok === true);
        } catch {
          // Older platforms have no benchmark endpoint; availability still remains useful.
        }
      }
      return result;
    },
    onSuccess: (result, { group }) => {
      queryClient.setQueryData<PolicyGroupTestResults>(
        surgeKeys.policyTestResults(connectionId),
        (previous) => ({ ...(previous ?? {}), [group]: result.results }),
      );
      // The POST response itself contains the per-policy `receive` timings.
      // Several Surge versions do not expose /test_results at all.
      toast.success(`测速完成：${group} · ${result.available.length} 个节点可达`);
    },
    onError: () => toast.error("策略组测速失败，无法自动选择"),
  });
}

export function useSelectFastestPolicyMutation() {
  const { client, connectionId } = useSurgeClientState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      group,
      policies,
      results,
    }: {
      group: string;
      policies: string[];
      results: Record<string, PolicyTestEntry> | undefined;
    }) => {
      const fastest = findFastestPolicy(policies, results);
      if (!fastest) throw new Error("NO_REACHABLE_POLICY");
      await client!.selectPolicy(group, fastest.name);
      return { group, ...fastest };
    },
    onSuccess: ({ group, name, latencyMs }) => {
      queryClient.setQueriesData<Record<string, string> | undefined>(
        { queryKey: selectionsPrefix(connectionId), type: "all" },
        (prev) => ({ ...(prev ?? {}), [group]: name }),
      );
      toast.success(`已选择最快节点：${name}（${Math.round(latencyMs)}ms）`);
    },
    onError: (error) => {
      toast.error(error instanceof Error && error.message === "NO_REACHABLE_POLICY"
        ? "没有可用节点：超时节点已排除"
        : "自动选择最快节点失败");
    },
  });
}

/**
 * Per-policy latency after the last group test (PROJECT_SPEC §6.3).
 * Enabled only after the user has triggered at least one test; results are
 * fetched once per test (via invalidation) and cached for 30s — the "刷新"
 * button in the drawer refetches on demand.
 */
export function usePolicyTestResultsQuery() {
  const { client, connectionId } = useEnabledClient();
  return useQuery<PolicyGroupTestResults>({
    queryKey: surgeKeys.policyTestResults(connectionId),
    queryFn: ({ signal }) => client!.getPolicyTestResults(signal),
    // Results are populated directly by the test mutation. Keep this query
    // disabled to avoid replacing valid POST results with an unsupported GET.
    enabled: false,
    staleTime: 30_000,
    refetchInterval: false,
  });
}
