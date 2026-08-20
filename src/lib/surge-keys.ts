/**
 * Unified React Query key factory — every Surge query/mutation key is
 * namespaced by the active connection id so cache entries never bleed
 * between multiple Surge instances (Fix 04).
 *
 * Usage: surgeKeys.traffic(connectionId) -> ["surge", id, "traffic"]
 * The id is null for demo mode — still a stable, distinct namespace.
 */
export const surgeKeys = {
  root: (connectionId: string | null) => ["surge", connectionId ?? "__demo__"] as const,
  traffic: (connectionId: string | null) =>
    [...surgeKeys.root(connectionId), "traffic"] as const,
  activeRequests: (connectionId: string | null) =>
    [...surgeKeys.root(connectionId), "requests", "active"] as const,
  recentRequests: (connectionId: string | null) =>
    [...surgeKeys.root(connectionId), "requests", "recent"] as const,
  events: (connectionId: string | null) =>
    [...surgeKeys.root(connectionId), "events"] as const,
  outbound: (connectionId: string | null) =>
    [...surgeKeys.root(connectionId), "outbound"] as const,
  policyGroups: (connectionId: string | null) =>
    [...surgeKeys.root(connectionId), "policy-groups"] as const,
  policyTestResults: (connectionId: string | null) =>
    [...surgeKeys.root(connectionId), "policy-test-results"] as const,
  policySelections: (connectionId: string | null, groupNames: string[]) =>
    [...surgeKeys.root(connectionId), "policy-selections", groupNames] as const,
  features: (connectionId: string | null) =>
    [...surgeKeys.root(connectionId), "features"] as const,
  dns: (connectionId: string | null) =>
    [...surgeKeys.root(connectionId), "dns"] as const,
  modules: (connectionId: string | null) =>
    [...surgeKeys.root(connectionId), "modules"] as const,
  scripts: (connectionId: string | null) =>
    [...surgeKeys.root(connectionId), "scripts"] as const,
  profile: (connectionId: string | null) =>
    [...surgeKeys.root(connectionId), "profile"] as const,
  rules: (connectionId: string | null) =>
    [...surgeKeys.root(connectionId), "rules"] as const,
} as const;
