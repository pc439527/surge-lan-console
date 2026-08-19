/**
 * Compatibility re-export layer: the shared Surge queries now live in
 * src/features/shared/queries.ts so features never import each other's
 * query modules. Dashboard internals re-export them for a stable surface.
 */
export {
  REFRESH,
  BACKGROUND_REFRESH,
  useTrafficQuery,
  useActiveRequestsQuery,
  useRecentRequestsQuery,
  useEventsQuery,
  usePolicyGroupsQuery,
  useOutboundModeQuery,
  type DisplayEvent,
  type DisplayPolicyGroup,
} from "@/features/shared/queries";
