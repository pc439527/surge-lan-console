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
  },
}));

describe("App", () => {
  it("renders the scaffold shell after Core authentication", async () => {
    render(<App />);
    expect((await screen.findAllByText("仪表盘")).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Mobile navigation")).toBeInTheDocument();
  });
});
