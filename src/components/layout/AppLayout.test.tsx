import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, beforeEach } from "vitest";
import { AppLayout } from "./AppLayout";
import { useConnectionStore } from "@/stores/connection-store";

function renderLayout() {
  return render(
    <MemoryRouter>
      <AppLayout />
    </MemoryRouter>,
  );
}

describe("AppLayout", () => {
  beforeEach(() => {
    useConnectionStore.setState({ connections: [], activeConnectionId: null });
  });

  it("renders sidebar navigation groups", () => {
    renderLayout();
    expect(screen.getByText("Surge LAN Console")).toBeInTheDocument();
    // Items appear in both sidebar and mobile nav
    expect(screen.getAllByText("仪表盘").length).toBeGreaterThan(0);
    expect(screen.getAllByText("策略").length).toBeGreaterThan(0);
    expect(screen.getAllByText("流量").length).toBeGreaterThan(0);
    expect(screen.getByText("未连接")).toBeInTheDocument();
  });

  it("renders mobile bottom navigation", () => {
    renderLayout();
    expect(screen.getByLabelText("Mobile navigation")).toBeInTheDocument();
  });

  it("switches active connection", () => {
    const id = useConnectionStore.getState().addConnection({
      name: "Apple TV",
      protocol: "http",
      host: "192.168.50.10",
      port: 6171,
    });
    useConnectionStore.getState().setActiveConnection(id);
    renderLayout();
    expect(screen.getAllByText("Apple TV").length).toBeGreaterThan(0);
    expect(screen.getByText("192.168.50.10:6171")).toBeInTheDocument();
  });
});