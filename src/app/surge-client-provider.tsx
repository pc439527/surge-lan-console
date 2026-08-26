import { useEffect, useMemo, type PropsWithChildren } from "react";
import { MockSurgeClient } from "@/api/mock/mock-client";
import type { SurgeClient } from "@/api/surge-client";
import { buildClientFor, useConnectionStore } from "@/stores/connection-store";
import { usePreferencesStore } from "@/stores/preferences-store";
import { SurgeClientContext, type SurgeClientContextValue } from "./surge-client-context";

/**
 * Vite's dedicated `visual` mode is used only by CI screenshot smoke tests.
 * It forces the deterministic in-memory Surge client without persisting or
 * mutating the user's normal demo-mode preference.
 */
const visualMode = import.meta.env.MODE === "visual";

export function SurgeClientProvider({ children }: PropsWithChildren) {
  const connections = useConnectionStore((s) => s.connections);
  const activeId = useConnectionStore((s) => s.activeConnectionId);
  const hydrate = useConnectionStore((s) => s.hydrate);
  const demoMode = usePreferencesStore((s) => s.demoMode);
  const useMockClient = demoMode || visualMode;

  useEffect(() => {
    if (!useMockClient) void hydrate();
  }, [useMockClient, hydrate]);

  const value = useMemo<SurgeClientContextValue>(() => {
    if (useMockClient) {
      return {
        connectionId: null,
        connection: null,
        client: new MockSurgeClient() as unknown as SurgeClient,
        missingKey: false,
        demoMode: true,
      };
    }
    const conn = connections.find((c) => c.id === activeId);
    if (!conn) return { connectionId: null, connection: null, client: null, missingKey: false, demoMode: false };
    const built = buildClientFor(conn);
    return {
      connectionId: conn.id,
      connection: conn,
      client: built?.client ?? null,
      missingKey: !built,
      demoMode: false,
    };
  }, [connections, activeId, useMockClient]);

  return <SurgeClientContext.Provider value={value}>{children}</SurgeClientContext.Provider>;
}
