import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createSurgeClient, type SurgeConnectionConfig } from "@/api";
import { SurgeClient } from "@/api/surge-client";
import { loadApiKey } from "./api-key-storage";
import type { PlatformOverride } from "@/api/capability";

export type ConnectionProtocol = "http" | "https";

export interface SurgeConnection {
  id: string;
  name: string;
  protocol: ConnectionProtocol;
  host: string;
  port: number;
  /**
   * Reverse-proxy mode (v0.2.2): the browser talks to the console origin
   * (same scheme as the page) and the console's nginx forwards /v1/ to this
   * device. Required when the console is served over HTTPS but Surge's API is
   * plain HTTP — direct calls would be blocked as mixed content.
   */
  useProxy?: boolean;
  /**
   * 平台手动指定（v0.3.0 Capability Engine）。自动判定不可靠时可覆盖；
   * 未设置时由 /v1 探测结果自动判定。
   */
  platform?: PlatformOverride;
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
 *
 * In proxy mode (useProxy) the client targets the console origin — the same
 * scheme/host/port the page was loaded from — so HTTPS-served consoles can
 * reach plain-HTTP Surge devices through the console's nginx /v1/ proxy
 * without browser mixed-content blocks.
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
  if (conn.useProxy) {
    config.proxyBaseUrl = `${window.location.protocol}//${window.location.host}`;
    config.proxyTarget = `${conn.host}:${conn.port}`;
  }
  return { client: createSurgeClient(config), config };
}

export function getActiveClient(): SurgeClient | null {
  const conn = getActiveConnection();
  if (!conn) return null;
  return buildClientFor(conn)?.client ?? null;
}
