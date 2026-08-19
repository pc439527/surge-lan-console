import { createContext, useContext } from "react";
import type { SurgeClient } from "@/api/surge-client";

export interface SurgeClientContextValue {
  client: SurgeClient | null;
  /** Non-null when a connection exists but its API key is missing. */
  missingKey: boolean;
}

export const SurgeClientContext = createContext<SurgeClientContextValue>({
  client: null,
  missingKey: false,
});

export function useSurgeClient(): SurgeClient | null {
  return useContext(SurgeClientContext).client;
}

export function useSurgeClientState(): SurgeClientContextValue {
  return useContext(SurgeClientContext);
}
