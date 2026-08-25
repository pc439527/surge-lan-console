import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, beforeEach } from "vitest";
import { AppLayout } from "./AppLayout";
import { useConnectionStore } from "@/stores/connection-store";

function renderLayout() {
  // Sidebar 使用 useCapabilitiesQuery —— 需要 QueryClientProvider。
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AppLayout", () => {
  beforeEach(() => {
    useConnectionStore.setState({ connections: [], activeConnectionId: null });
  });

  it("renders sidebar navigation groups", () => {
    renderLayout();
    // Brand appears in the desktop sidebar and the mobile top bar.
    expect(screen.getAllByText("Surge LAN Console").length).toBeGreaterThan(0);
    // Items appear in both sidebar and mobile nav
    expect(screen.getAllByText("仪表盘").length).toBeGreaterThan(0);
    expect(screen.getAllByText("策略").length).toBeGreaterThan(0);
    expect(screen.getAllByText("流量").length).toBeGreaterThan(0);
    expect(screen.getByText("无连接")).toBeInTheDocument();
  });

  it("renders mobile bottom navigation", () => {
    renderLayout();
    expect(screen.getByLabelText("移动端导航")).toBeInTheDocument();
  });

  it("switches active connection", async () => {
    useConnectionStore.setState({
      connections: [{ id: "c1", name: "Apple TV", protocol: "http", host: "192.168.50.10", port: 6171, hasApiKey: false }],
      activeConnectionId: null,
    });
    useConnectionStore.getState().setActiveConnection("c1");
    renderLayout();
    expect(screen.getAllByText("Apple TV").length).toBeGreaterThan(0);
    expect(screen.getByText("192.168.50.10:6171")).toBeInTheDocument();
  });
});
