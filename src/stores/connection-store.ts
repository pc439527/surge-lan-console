import { create } from "zustand";
import { createSurgeClient, type SurgeConnectionConfig } from "@/api";
import { SurgeClient } from "@/api/surge-client";
import type { PlatformOverride } from "@/api/capability";
import { clearApiKey, loadApiKey } from "./api-key-storage";
import { coreApi, type CoreConnectionInput } from "@/lib/core-api";

export type ConnectionProtocol = "http" | "https";

export interface SurgeConnection {
  id: string;
  name: string;
  protocol: ConnectionProtocol;
  host: string;
  port: number;
  platform?: PlatformOverride;
  hasApiKey: boolean;
}

interface ConnectionDraft {
  name: string;
  protocol: ConnectionProtocol;
  host: string;
  port: number;
  platform?: PlatformOverride;
  apiKey?: string;
}

interface ConnectionState {
  connections: SurgeConnection[];
  activeConnectionId: string | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addConnection: (conn: ConnectionDraft) => Promise<string>;
  updateConnection: (id: string, patch: Partial<ConnectionDraft>) => Promise<void>;
  removeConnection: (id: string) => Promise<void>;
  setActiveConnection: (id: string | null) => void;
}

export const STORAGE_KEY = "surge-lan-console.connections";
const ACTIVE_KEY = "surge-lan-console.active-connection";
let hydratePromise: Promise<void> | null = null;

function fromCore(conn: Awaited<ReturnType<typeof coreApi.listConnections>>[number]): SurgeConnection {
  return {
    id: conn.id,
    name: conn.name,
    protocol: conn.protocol,
    host: conn.host,
    port: conn.port,
    platform: conn.platform ?? undefined,
    hasApiKey: conn.hasApiKey,
  };
}

function persistActive(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch { /* browser storage unavailable */ }
}

function loadActive(): string | null {
  try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
}

async function migrateLegacyBrowserStorage(): Promise<void> {
  let raw: string | null = null;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch { return; }
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw) as { state?: { connections?: unknown[]; activeConnectionId?: string | null } };
    const candidates = Array.isArray(parsed.state?.connections) ? parsed.state.connections : [];
    const migration: CoreConnectionInput[] = [];
    const legacyIds: string[] = [];
    for (const value of candidates) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const item = value as Record<string, unknown>;
      if (typeof item.id !== "string" || typeof item.name !== "string" || typeof item.host !== "string") continue;
      const protocol = item.protocol === "https" ? "https" : "http";
      const platform = item.platform === "ios" || item.platform === "tvos" || item.platform === "macos" ? item.platform : undefined;
      const apiKey = loadApiKey(item.id) ?? undefined;
      migration.push({
        id: item.id,
        name: item.name,
        protocol,
        host: item.host,
        port: typeof item.port === "number" ? item.port : Number(item.port) || 6171,
        platform,
        ...(apiKey ? { apiKey } : {}),
      });
      legacyIds.push(item.id);
    }
    if (migration.length > 0) await coreApi.importConnections(migration);
    if (parsed.state?.activeConnectionId) persistActive(parsed.state.activeConnectionId);
    for (const id of legacyIds) clearApiKey(id);
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Keep legacy storage untouched when migration is not fully successful.
  }
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  connections: [],
  activeConnectionId: loadActive(),
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    if (!hydratePromise) {
      hydratePromise = (async () => {
        await migrateLegacyBrowserStorage();
        const connections = (await coreApi.listConnections()).map(fromCore);
        const preferred = loadActive();
        const activeConnectionId = preferred && connections.some((conn) => conn.id === preferred)
          ? preferred
          : connections[0]?.id ?? null;
        persistActive(activeConnectionId);
        set({ connections, activeConnectionId, hydrated: true });
      })().finally(() => { hydratePromise = null; });
    }
    await hydratePromise;
  },

  addConnection: async (conn) => {
    const created = fromCore(await coreApi.createConnection({
      name: conn.name,
      protocol: conn.protocol,
      host: conn.host,
      port: conn.port,
      platform: conn.platform ?? null,
      apiKey: conn.apiKey,
    }));
    set((state) => ({ connections: [...state.connections, created] }));
    return created.id;
  },

  updateConnection: async (id, patch) => {
    const updated = fromCore(await coreApi.updateConnection(id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.protocol !== undefined ? { protocol: patch.protocol } : {}),
      ...(patch.host !== undefined ? { host: patch.host } : {}),
      ...(patch.port !== undefined ? { port: patch.port } : {}),
      ...(patch.platform !== undefined ? { platform: patch.platform ?? null } : {}),
      ...(patch.apiKey?.trim() ? { apiKey: patch.apiKey } : {}),
    }));
    set((state) => ({ connections: state.connections.map((conn) => conn.id === id ? updated : conn) }));
  },

  removeConnection: async (id) => {
    await coreApi.deleteConnection(id);
    set((state) => {
      const connections = state.connections.filter((conn) => conn.id !== id);
      const activeConnectionId = state.activeConnectionId === id ? connections[0]?.id ?? null : state.activeConnectionId;
      persistActive(activeConnectionId);
      return { connections, activeConnectionId };
    });
  },

  setActiveConnection: (id) => {
    persistActive(id);
    set({ activeConnectionId: id });
  },
}));

export function getActiveConnection(): SurgeConnection | null {
  const { connections, activeConnectionId } = useConnectionStore.getState();
  return connections.find((conn) => conn.id === activeConnectionId) ?? null;
}

/**
 * Browser-side SurgeClient now targets the authenticated Core proxy.
 * No real Surge API key is available in JavaScript; the placeholder header is
 * deliberately ignored by Core, which injects the decrypted X-Key server-side.
 */
export function buildClientFor(conn: SurgeConnection): { client: SurgeClient; config: SurgeConnectionConfig } | null {
  if (!conn.hasApiKey) return null;
  const config: SurgeConnectionConfig = {
    protocol: conn.protocol,
    host: conn.host,
    port: conn.port,
    apiKey: "core-managed",
    timeoutMs: 10_000,
    proxyBaseUrl: `${window.location.origin}/api/surge/${encodeURIComponent(conn.id)}`,
  };
  return { client: createSurgeClient(config), config };
}

export function getActiveClient(): SurgeClient | null {
  const conn = getActiveConnection();
  return conn ? buildClientFor(conn)?.client ?? null : null;
}
