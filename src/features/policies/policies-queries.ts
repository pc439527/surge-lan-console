import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSurgeClientState } from "@/app/surge-client-context";
import { surgeKeys } from "@/lib/surge-keys";
import type { Policy, PolicyGroupTestResults, PolicyTestEntry } from "@/api/types";
import { benchmarkPolicyGroups } from "@/domain/benchmark/benchmark-service";
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

/**
 * Single-group benchmark (P0-1): "测速全部" in the Policies drawer.
 *
 * Uses the SAME unified pipeline as 一键测速 — POST /policy_groups/test,
 * then ONE GET /policies/benchmark_results, then lineHash-aligned merge —
 * so a single-group test and a fleet-wide test always agree on latency.
 */
export function useTestGroupMutation() {
  const { client, connectionId } = useSurgeClientState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ group, policies }: { group: string; policies: Policy[] }) => {
      const results = await benchmarkPolicyGroups(client!, [{ name: group, policies }]);
      return { group, results: results[group] ?? {} };
    },
    onSuccess: (outcome, { group }) => {
      queryClient.setQueryData<PolicyGroupTestResults>(
        surgeKeys.policyTestResults(connectionId),
        (previous) => ({ ...(previous ?? {}), [group]: outcome.results }),
      );
      const reachable = Object.values(outcome.results).filter((entry) => entry.ok === true).length;
      toast.success(`测速完成：${group} · ${reachable} 个节点可达`);
    },
    onError: () => toast.error("策略组测速失败，无法自动选择"),
  });
}

/**
 * 一键测速 (P0-1): runs every group through the unified benchmark pipeline —
 * sequential POSTs (no flooding), ONE benchmark_results read afterwards, then
 * the merged results replace the cache, so Node Quality immediately shows
 * "已有测速" counts and per-node latencies.
 */
export function useTestAllGroupsMutation() {
  const { client, connectionId } = useSurgeClientState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groups: Array<{ name: string; policies: Policy[] }>) =>
      benchmarkPolicyGroups(client!, groups),
    onSuccess: (results) => {
      queryClient.setQueryData<PolicyGroupTestResults>(
        surgeKeys.policyTestResults(connectionId),
        (previous) => ({ ...(previous ?? {}), ...results }),
      );
      const reachable = Object.values(results).reduce(
        (n, entries) => n + Object.values(entries).filter((entry) => entry.ok === true).length,
        0,
      );
      toast.success(`全部测速完成：${Object.keys(results).length} 个策略组 · ${reachable} 个节点可达`);
    },
    onError: () => toast.error("一键测速未完成，请稍后重试"),
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
