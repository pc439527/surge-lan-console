import { beforeEach, describe, expect, it } from "vitest";
import { useConnectionStore, buildClientFor } from "./connection-store";
import { saveApiKey } from "./api-key-storage";

describe("connection-store", () => {
  beforeEach(() => {
    useConnectionStore.setState({ connections: [], activeConnectionId: null });
  });

  it("adds a connection and returns its id", () => {
    const id = useConnectionStore.getState().addConnection({
      name: "Apple TV",
      protocol: "http",
      host: "192.168.50.10",
      port: 6171,
    });
    expect(id).toBeTruthy();
    expect(useConnectionStore.getState().connections).toHaveLength(1);
    expect(useConnectionStore.getState().connections[0].name).toBe("Apple TV");
  });

  it("updates a connection", () => {
    const id = useConnectionStore.getState().addConnection({
      name: "Apple TV",
      protocol: "http",
      host: "192.168.50.10",
      port: 6171,
    });
    useConnectionStore.getState().updateConnection(id, { host: "192.168.50.12" });
    expect(useConnectionStore.getState().connections[0].host).toBe("192.168.50.12");
  });

  it("removes a connection and clears active when needed", () => {
    const id = useConnectionStore.getState().addConnection({
      name: "Apple TV",
      protocol: "http",
      host: "192.168.50.10",
      port: 6171,
    });
    useConnectionStore.getState().setActiveConnection(id);
    useConnectionStore.getState().removeConnection(id);
    expect(useConnectionStore.getState().connections).toHaveLength(0);
    expect(useConnectionStore.getState().activeConnectionId).toBeNull();
  });

  it("persists useProxy flag (v0.2.2 proxy mode)", () => {
    const id = useConnectionStore.getState().addConnection({
      name: "Apple TV",
      protocol: "http",
      host: "192.168.50.10",
      port: 6171,
      useProxy: true,
    });
    expect(useConnectionStore.getState().connections[0].useProxy).toBe(true);
    useConnectionStore.getState().updateConnection(id, { useProxy: false });
    expect(useConnectionStore.getState().connections[0].useProxy).toBe(false);
  });

  describe("buildClientFor (proxy mode)", () => {
    it("targets the device directly when useProxy is off", () => {
      const id = useConnectionStore.getState().addConnection({
        name: "Apple TV",
        protocol: "http",
        host: "192.168.50.10",
        port: 6171,
      });
      saveApiKey(id, "secret", false);
      const built = buildClientFor(useConnectionStore.getState().connections[0]);
      expect(built).not.toBeNull();
      expect(built!.config.proxyBaseUrl).toBeUndefined();
      expect(built!.config.proxyTarget).toBeUndefined();
      expect(built!.config.host).toBe("192.168.50.10");
    });

    it("routes through the console origin when useProxy is on", () => {
      // jsdom sets window.location to http://localhost:3000
      const id = useConnectionStore.getState().addConnection({
        name: "Apple TV",
        protocol: "http",
        host: "192.168.50.10",
        port: 6171,
        useProxy: true,
      });
      saveApiKey(id, "secret", false);
      const built = buildClientFor(useConnectionStore.getState().connections[0]);
      expect(built).not.toBeNull();
      expect(built!.config.proxyBaseUrl).toBe("http://localhost:3000");
      expect(built!.config.proxyTarget).toBe("192.168.50.10:6171");
    });

    it("returns null without an API key", () => {
      useConnectionStore.getState().addConnection({
        name: "Apple TV",
        protocol: "http",
        host: "192.168.50.10",
        port: 6171,
      });
      expect(buildClientFor(useConnectionStore.getState().connections[0])).toBeNull();
    });
  });
});
