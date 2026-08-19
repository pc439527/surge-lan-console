import { useMemo, type PropsWithChildren } from "react";
import { MockSurgeClient } from "@/api/mock/mock-client";
import type { SurgeClient } from "@/api/surge-client";
import { buildClientFor, useConnectionStore } from "@/stores/connection-store";
import { usePreferencesStore } from "@/stores/preferences-store";
import { SurgeClientContext, type SurgeClientContextValue } from "./surge-client-context";

export function SurgeClientProvider({ children }: PropsWithChildren) {
  const connections = useConnectionStore((s) => s.connections);
  const activeId = useConnectionStore((s) => s.activeConnectionId);
  const demoMode = usePreferencesStore((s) => s.demoMode);

  const value = useMemo<SurgeClientContextValue>(() => {
    if (demoMode) return { client: new MockSurgeClient() as unknown as SurgeClient, missingKey: false };
    const conn = connections.find((c) => c.id === activeId);
    if (!conn) return { client: null, missingKey: false };
    const built = buildClientFor(conn);
    return built ? { client: built.client, missingKey: false } : { client: null, missingKey: true };
  }, [connections, activeId, demoMode]);

  return <SurgeClientContext.Provider value={value}>{children}</SurgeClientContext.Provider>;
}
