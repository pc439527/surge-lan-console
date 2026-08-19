import { useQuery } from "@tanstack/react-query";
import { useSurgeClient, useSurgeClientState } from "@/app/surge-client-context";
import { ENDPOINTS } from "@/api/endpoints";
import { SurgeClient } from "@/api/surge-client";
import type { EventLevel, RequestItem, TrafficSummary } from "@/api/types";

const REFRESH = {
  traffic: 1000,
  activeRequests: 2000,
  recentRequests: 3000,
  events: 3000,
  policies: 10000,
  features: 10000,
};

function useEnabledClient() {
  const { client, missingKey } = useSurgeClientState();
  return { client, enabled: !!client && !missingKey };
}

export interface DisplayEvent {
  id: string;
  time: number;
  level: EventLevel;
  message: string;
}

function normalizeEvent(type: number, content: string, date: string, id: string): DisplayEvent {
  return {
    id,
    time: new Date(date).getTime(),
    level: SurgeClient.eventLevel(type),
    message: content,
  };
}

export function useTrafficQuery() {
  const { client, enabled } = useEnabledClient();
  return useQuery<TrafficSummary>({
    queryKey: [ENDPOINTS.traffic],
    queryFn: () => client!.getTrafficSummary(),
    enabled,
    refetchInterval: REFRESH.traffic,
  });
}

export function useActiveRequestsQuery() {
  const { client, enabled } = useEnabledClient();
  return useQuery<RequestItem[]>({
    queryKey: [ENDPOINTS.requestsActive],
    queryFn: () => client!.getActiveRequests(),
    enabled,
    refetchInterval: REFRESH.activeRequests,
  });
}

export function useRecentRequestsQuery() {
  const { client, enabled } = useEnabledClient();
  return useQuery<RequestItem[]>({
    queryKey: [ENDPOINTS.requestsRecent],
    queryFn: () => client!.getRecentRequests(),
    enabled,
    refetchInterval: REFRESH.recentRequests,
  });
}

export function useEventsQuery() {
  const { client, enabled } = useEnabledClient();
  return useQuery<DisplayEvent[]>({
    queryKey: [ENDPOINTS.events],
    queryFn: async () => {
      const raw = await client!.getEvents();
      return (raw.events ?? []).map((e) =>
        normalizeEvent(e.type, e.content, e.date, e.identifier),
      );
    },
    enabled,
    refetchInterval: REFRESH.events,
  });
}

export interface DisplayPolicyGroup {
  name: string;
  policies: string[];
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
    refetchInterval: REFRESH.policies,
  });
}

export function useOutboundModeQuery() {
  const client = useSurgeClient();
  return useQuery({
    queryKey: [ENDPOINTS.outbound],
    queryFn: () => client!.getOutboundMode(),
    enabled: !!client,
    refetchInterval: REFRESH.features,
  });
}
