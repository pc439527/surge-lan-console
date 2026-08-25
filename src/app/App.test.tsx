import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("@/lib/core-api", () => ({
  coreApi: {
    getAuthState: vi.fn().mockResolvedValue({
      initialized: true,
      authenticated: true,
      sessionExpiresAt: null,
    }),
    // SurgeClientProvider hydrates the store on mount; Core owns connection
    // metadata in the new architecture, so no connections exist until created.
    listConnections: vi.fn().mockResolvedValue([]),
    createConnection: vi.fn(),
    updateConnection: vi.fn(),
    deleteConnection: vi.fn(),
    importConnections: vi.fn().mockResolvedValue({ imported: 0, skipped: 0 }),
  },
}));

describe("App", () => {
  it("renders the scaffold shell after Core authentication", async () => {
    render(<App />);
    expect((await screen.findAllByText("仪表盘")).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("移动端导航")).toBeInTheDocument();
  });
});
