import { useEffect, useMemo, type PropsWithChildren } from "react";
import { MockSurgeClient } from "@/api/mock/mock-client";
import type { SurgeClient } from "@/api/surge-client";
import { buildClientFor, useConnectionStore } from "@/stores/connection-store";
import { usePreferencesStore } from "@/stores/preferences-store";
import { SurgeClientContext, type SurgeClientContextValue } from "./surge-client-context";

export function SurgeClientProvider({ children }: PropsWithChildren) {
  const connections = useConnectionStore((s) => s.connections);
  const activeId = useConnectionStore((s) => s.activeConnectionId);
  const hydrate = useConnectionStore((s) => s.hydrate);
  const demoMode = usePreferencesStore((s) => s.demoMode);

  useEffect(() => {
    if (!demoMode) void hydrate();
  }, [demoMode, hydrate]);

  const value = useMemo<SurgeClientContextValue>(() => {
    if (demoMode) {
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
  }, [connections, activeId, demoMode]);

  return <SurgeClientContext.Provider value={value}>{children}</SurgeClientContext.Provider>;
}
