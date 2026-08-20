import { useQuery } from "@tanstack/react-query";
import { useSurgeClientState } from "@/app/surge-client-context";
import { SurgeClient } from "@/api/surge-client";
import { surgeKeys } from "@/lib/surge-keys";
import type { EventLevel, FeatureState, RequestItem, TrafficSummary } from "@/api/types";
import { usePageVisible } from "@/hooks/use-page-visibility";

/**
 * Shared Surge queries used across multiple features (Dashboard, Requests,
 * Traffic, Policies). Centralizing them here keeps features from importing
 * each other's query modules (fixes the reverse-dependency smell where
 * RequestsPage/Policies imported from dashboard-queries).
 */

export const REFRESH = {
  traffic: 1000,
  activeRequests: 2000,
  recentRequests: 3000,
  events: 3000,
  policies: 10_000,
  features: 10_000,
} as const;

/** Background (tab hidden) refresh policy — see AGENTS.md §5. */
export const BACKGROUND_REFRESH: Partial<Record<keyof typeof REFRESH, number | false>> = {
  traffic: false,
  activeRequests: false,
  events: 30_000,
  policies: false,
};

function useEnabledClient() {
  const { client, missingKey, connectionId } = useSurgeClientState();
  return { client, enabled: !!client && !missingKey, connectionId };
}

function usePollingInterval(key: keyof typeof REFRESH): number | false {
  const visible = usePageVisible();
  if (!visible) return BACKGROUND_REFRESH[key] ?? false;
  return REFRESH[key];
}

// ── Traffic ──────────────────────────────────────────────────

export function useTrafficQuery() {
  const { client, enabled, connectionId } = useEnabledClient();
  const interval = usePollingInterval("traffic");
  return useQuery<TrafficSummary>({
    queryKey: surgeKeys.traffic(connectionId),
    queryFn: ({ signal }) => client!.getTrafficSummary(signal),
    enabled,
    refetchInterval: interval,
  });
}

// ── Requests ─────────────────────────────────────────────────

export function useActiveRequestsQuery() {
  const { client, enabled, connectionId } = useEnabledClient();
  const interval = usePollingInterval("activeRequests");
  return useQuery<RequestItem[]>({
    queryKey: surgeKeys.activeRequests(connectionId),
    queryFn: ({ signal }) => client!.getActiveRequests(signal),
    enabled,
    refetchInterval: interval,
  });
}

/** Recent requests; pass { paused: true } to freeze and stop polling (Fix 07). */
export function useRecentRequestsQuery(opts?: { paused?: boolean }) {
  const { client, enabled, connectionId } = useEnabledClient();
  const baseInterval = usePollingInterval("recentRequests");
  const paused = opts?.paused ?? false;
  return useQuery<RequestItem[]>({
    queryKey: surgeKeys.recentRequests(connectionId),
    queryFn: ({ signal }) => client!.getRecentRequests(signal),
    enabled: enabled && !paused,
    refetchInterval: paused ? false : baseInterval,
  });
}

// ── Events ───────────────────────────────────────────────────

export interface DisplayEvent {
  id: string;
  time: number;
  level: EventLevel;
  message: string;
}

function normalizeEvent(type: number, content: string, date: string, id: string): DisplayEvent {
  const time = new Date(date).getTime();
  return {
    id,
    time: Number.isNaN(time) ? 0 : time,
    level: SurgeClient.eventLevel(type),
    message: content,
  };
}

export function useEventsQuery() {
  const { client, enabled, connectionId } = useEnabledClient();
  const interval = usePollingInterval("events");
  return useQuery<DisplayEvent[]>({
    queryKey: surgeKeys.events(connectionId),
    queryFn: async ({ signal }) => {
      const raw = await client!.getEvents(signal);
      return (raw.events ?? []).map((e) =>
        normalizeEvent(e.type, e.content, e.date, e.identifier),
      );
    },
    enabled,
    refetchInterval: interval,
  });
}

// ── Policy groups ────────────────────────────────────────────

export interface DisplayPolicyGroup {
  name: string;
  policies: string[];
  /** policyName → typeDescription (e.g. "ss", "select", "direct") — from /v1/policy_groups. */
  types: Record<string, string>;
  /** policyName → stable Surge lineHash for benchmark result lookup. */
  lineHashes: Record<string, string>;
}

export function usePolicyGroupsQuery() {
  const { client, enabled, connectionId } = useEnabledClient();
  const interval = usePollingInterval("policies");
  return useQuery<DisplayPolicyGroup[]>({
    queryKey: surgeKeys.policyGroups(connectionId),
    queryFn: async ({ signal }) => {
      const raw = await client!.getPolicyGroups(signal);
      return Object.entries(raw ?? {}).map(([name, policies]) => ({
        name,
        policies: (policies ?? []).map((p) => p.name),
        types: Object.fromEntries((policies ?? []).map((p) => [p.name, p.typeDescription ?? ""])),
        lineHashes: Object.fromEntries((policies ?? []).filter((p) => p.lineHash).map((p) => [p.name, p.lineHash!])),
      }));
    },
    enabled,
    refetchInterval: interval,
  });
}

// ── Features (MitM / Rewrite / Scripting / Capture) ───────────

export function useFeaturesQuery() {
  const { client, enabled, connectionId } = useEnabledClient();
  const interval = usePollingInterval("features");
  return useQuery<FeatureState>({
    queryKey: surgeKeys.features(connectionId),
    queryFn: ({ signal }) => client!.getFeatures(signal),
    enabled,
    refetchInterval: interval,
  });
}

// ── Outbound mode ────────────────────────────────────────────

export function useOutboundModeQuery() {
  const { client, enabled, connectionId } = useEnabledClient();
  const interval = usePollingInterval("features");
  return useQuery({
    queryKey: surgeKeys.outbound(connectionId),
    queryFn: ({ signal }) => client!.getOutboundMode(signal),
    enabled,
    refetchInterval: interval,
  });
}