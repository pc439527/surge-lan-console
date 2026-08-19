import { createContext, useContext } from "react";
import type { SurgeClient } from "@/api/surge-client";
import type { SurgeConnection } from "@/stores/connection-store";

/**
 * Surge context value — always scoped to ONE active connection.
 * Consumers use connectionId to namespace query keys and local state.
 */
export interface SurgeClientContextValue {
  /** id of the active connection (null in demo mode or when none selected). */
  connectionId: string | null;
  /** the active connection record (null in demo mode or when none selected). */
  connection: SurgeConnection | null;
  client: SurgeClient | null;
  /** Non-null when a connection exists but its API key is missing. */
  missingKey: boolean;
  /** Demo mode serves mock Surge data so the UI works without a device. */
  demoMode: boolean;
}

export const SurgeClientContext = createContext<SurgeClientContextValue>({
  connectionId: null,
  connection: null,
  client: null,
  missingKey: false,
  demoMode: false,
});

export function useSurgeClient(): SurgeClient | null {
  return useContext(SurgeClientContext).client;
}

export function useSurgeClientState(): SurgeClientContextValue {
  return useContext(SurgeClientContext);
}

/** Convenience: the active connection id (null when unset). */
export function useSurgeConnectionId(): string | null {
  return useContext(SurgeClientContext).connectionId;
}
