import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSurgeClient, useSurgeClientState } from "@/app/surge-client-context";
import { surgeKeys } from "@/lib/surge-keys";
import type { PolicyGroupTestResults } from "@/api/types";
import { usePolicyGroupsQuery } from "@/features/shared/queries";

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
  const client = useSurgeClient();
  return useMutation({
    mutationFn: (group: string) => client!.testPolicyGroup(group),
    onSuccess: (result) => {
      toast.success(`测试完成：${result.available?.length ?? 0} 个策略可用`);
    },
    onError: () => toast.error("策略组测试失败"),
  });
}

/**
 * Per-policy latency after the last group test (PROJECT_SPEC §6.3).
 * Enabled only after the user has triggered at least one test, then kept
 * warm with a slow poll so the color grading stays fresh.
 */
export function usePolicyTestResultsQuery(enabled: boolean) {
  const { client, enabled: connEnabled, connectionId } = useEnabledClient();
  return useQuery<PolicyGroupTestResults>({
    queryKey: surgeKeys.policyTestResults(connectionId),
    queryFn: ({ signal }) => client!.getPolicyTestResults(signal),
    enabled: connEnabled && enabled,
    refetchInterval: 15_000,
  });
}
