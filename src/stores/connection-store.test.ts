import { beforeEach, describe, expect, it } from "vitest";
import { useConnectionStore } from "./connection-store";

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
});
