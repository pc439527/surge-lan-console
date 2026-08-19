import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createSurgeClient, type SurgeConnectionConfig } from "@/api";
import { SurgeClient } from "@/api/surge-client";
import { loadApiKey } from "./api-key-storage";

export type ConnectionProtocol = "http" | "https";

export interface SurgeConnection {
  id: string;
  name: string;
  protocol: ConnectionProtocol;
  host: string;
  port: number;
}

interface ConnectionState {
  connections: SurgeConnection[];
  activeConnectionId: string | null;
  addConnection: (conn: Omit<SurgeConnection, "id">) => string;
  updateConnection: (id: string, patch: Partial<Omit<SurgeConnection, "id">>) => void;
  removeConnection: (id: string) => void;
  setActiveConnection: (id: string | null) => void;
}

const STORAGE_KEY = "surge-lan-console.connections";

function makeId() {
  return `conn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set) => ({
      connections: [],
      activeConnectionId: null,
      addConnection: (conn) => {
        const id = makeId();
        set((s) => ({ connections: [...s.connections, { ...conn, id }] }));
        return id;
      },
      updateConnection: (id, patch) =>
        set((s) => ({
          connections: s.connections.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),
      removeConnection: (id) =>
        set((s) => ({
          connections: s.connections.filter((c) => c.id !== id),
          activeConnectionId: s.activeConnectionId === id ? null : s.activeConnectionId,
        })),
      setActiveConnection: (id) => set({ activeConnectionId: id }),
    }),
    { name: STORAGE_KEY },
  ),
);

export { STORAGE_KEY };

export function getActiveConnection(): SurgeConnection | null {
  const { connections, activeConnectionId } = useConnectionStore.getState();
  return connections.find((c) => c.id === activeConnectionId) ?? null;
}

/**
 * Builds a configured SurgeClient for a connection using its stored API key.
 * Returns null when the key is unavailable (user must enter it first).
 */
export function buildClientFor(
  conn: SurgeConnection,
): { client: SurgeClient; config: SurgeConnectionConfig } | null {
  const apiKey = loadApiKey(conn.id);
  if (!apiKey) return null;
  const config: SurgeConnectionConfig = {
    protocol: conn.protocol,
    host: conn.host,
    port: conn.port,
    apiKey,
    timeoutMs: 5000,
  };
  return { client: createSurgeClient(config), config };
}

export function getActiveClient(): SurgeClient | null {
  const conn = getActiveConnection();
  if (!conn) return null;
  return buildClientFor(conn)?.client ?? null;
}
