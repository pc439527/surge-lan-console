import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ENDPOINTS } from "@/api/endpoints";
import { useSurgeClient, useSurgeClientState } from "@/app/surge-client-context";
import type { DisplayPolicyGroup } from "@/features/dashboard/dashboard-queries";

function useEnabledClient() {
  const { client, missingKey } = useSurgeClientState();
  return { client, enabled: !!client && !missingKey };
}

export function usePolicyGroupsQuery() {
  const { client, enabled } = useEnabledClient();
  return useQuery<DisplayPolicyGroup[]>({
    queryKey: [ENDPOINTS.policyGroups],
    queryFn: async () => {
      const raw = await client!.getPolicyGroups();
      return Object.entries(raw ?? {}).map(([name, policies]) => ({
        name,
        policies: (policies ?? []).map((p) => p.name),
      }));
    },
    enabled,
    refetchInterval: 10_000,
  });
}

export function useGroupSelectionsQuery(groupNames: string[]) {
  const { client, enabled } = useEnabledClient();
  return useQuery<Record<string, string>>({
    queryKey: [ENDPOINTS.policyGroupsSelect, groupNames],
    queryFn: async () => {
      const entries = await Promise.all(
        groupNames.map(async (name) => [name, await client!.getGroupSelection(name)] as const),
      );
      return Object.fromEntries(entries);
    },
    enabled: enabled && groupNames.length > 0,
    refetchInterval: 10_000,
  });
}

export function useSelectPolicyMutation() {
  const client = useSurgeClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ group, policy }: { group: string; policy: string }) =>
      client!.selectPolicy(group, policy),
    onSuccess: (_d, { group, policy }) => {
      queryClient.setQueryData(
        [ENDPOINTS.policyGroupsSelect],
        (prev: Record<string, string> | undefined) => ({ ...prev, [group]: policy }),
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
