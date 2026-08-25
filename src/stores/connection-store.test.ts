import { beforeEach, describe, expect, it, vi } from "vitest";
import { useConnectionStore, buildClientFor, type SurgeConnection } from "./connection-store";

// The store now persists through Core (SQLite/Vault); CRUD is async and
// routed through coreApi. We mock the module at graph level so tests stay
// hermetic (no real HTTP to /api during unit runs).
const coreApiMock = vi.hoisted(() => ({
  createConnection: vi.fn(),
  updateConnection: vi.fn(),
  deleteConnection: vi.fn(),
  listConnections: vi.fn(),
  importConnections: vi.fn(),
}));

vi.mock("@/lib/core-api", () => ({
  coreApi: {
    createConnection: coreApiMock.createConnection,
    updateConnection: coreApiMock.updateConnection,
    deleteConnection: coreApiMock.deleteConnection,
    listConnections: coreApiMock.listConnections,
    importConnections: coreApiMock.importConnections,
  },
}));

const CORE_CONNECTION = {
  id: "c1",
  name: "Apple TV",
  protocol: "http",
  host: "192.168.50.10",
  port: 6171,
  platform: null,
  hasApiKey: true,
  createdAt: "2026-08-25T00:00:00Z",
  updatedAt: "2026-08-25T00:00:00Z",
};

describe("connection-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConnectionStore.setState({ connections: [], activeConnectionId: null });
  });

  it("adds a connection through Core and returns its id", async () => {
    coreApiMock.createConnection.mockResolvedValue(CORE_CONNECTION);
    const id = await useConnectionStore.getState().addConnection({
      name: "Apple TV",
      protocol: "http",
      host: "192.168.50.10",
      port: 6171,
      apiKey: "secret",
    });
    expect(id).toBe("c1");
    expect(coreApiMock.createConnection).toHaveBeenCalledWith(expect.objectContaining({ name: "Apple TV", apiKey: "secret" }));
    expect(useConnectionStore.getState().connections).toHaveLength(1);
    expect(useConnectionStore.getState().connections[0]).toMatchObject({ name: "Apple TV", hasApiKey: true });
  });

  it("updates a connection through Core", async () => {
    coreApiMock.updateConnection.mockResolvedValue({ ...CORE_CONNECTION, host: "192.168.50.12" });
    useConnectionStore.setState({ connections: [{ id: "c1", name: "Apple TV", protocol: "http", host: "192.168.50.10", port: 6171, hasApiKey: true }] });
    await useConnectionStore.getState().updateConnection("c1", { host: "192.168.50.12" });
    expect(useConnectionStore.getState().connections[0].host).toBe("192.168.50.12");
  });

  it("removes a connection through Core and clears active when needed", async () => {
    coreApiMock.deleteConnection.mockResolvedValue({ deleted: true });
    useConnectionStore.setState({ connections: [{ id: "c1", name: "Apple TV", protocol: "http", host: "192.168.50.10", port: 6171, hasApiKey: true }] });
    useConnectionStore.getState().setActiveConnection("c1");
    await useConnectionStore.getState().removeConnection("c1");
    expect(useConnectionStore.getState().connections).toHaveLength(0);
    expect(useConnectionStore.getState().activeConnectionId).toBeNull();
  });

  describe("buildClientFor", () => {
    it("routes through the Core proxy when the connection has a stored key", () => {
      const conn: SurgeConnection = { id: "c1", name: "Apple TV", protocol: "http", host: "192.168.50.10", port: 6171, hasApiKey: true };
      const built = buildClientFor(conn);
      expect(built).not.toBeNull();
      // Browser never holds the real key — Core injects the decrypted X-Key server-side.
      expect(built!.config.apiKey).toBe("core-managed");
      expect(built!.config.proxyBaseUrl).toBe(`${window.location.origin}/api/surge/c1`);
    });

    it("returns null without a stored API key", () => {
      const conn: SurgeConnection = { id: "c1", name: "Apple TV", protocol: "http", host: "192.168.50.10", port: 6171, hasApiKey: false };
      expect(buildClientFor(conn)).toBeNull();
    });
  });
});
