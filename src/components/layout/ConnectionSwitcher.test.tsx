import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { useConnectionStore } from "@/stores/connection-store";
import { ConnectionSwitcher } from "./ConnectionSwitcher";

describe("ConnectionSwitcher", () => {
  beforeEach(() => {
    useConnectionStore.setState({
      connections: [
        { id: "a", name: "Apple TV", protocol: "http", host: "192.168.50.10", port: 6171 },
        { id: "b", name: "MacBook Air", protocol: "http", host: "192.168.50.11", port: 6171 },
      ],
      activeConnectionId: "b",
    });
  });
  it("selects a device and closes the dialog", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><ConnectionSwitcher /></MemoryRouter>);
    await user.click(screen.getByRole("button", { name: /MacBook Air/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Apple TV/ }));
    expect(useConnectionStore.getState().activeConnectionId).toBe("a");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
