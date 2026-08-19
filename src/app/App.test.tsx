import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the scaffold shell", () => {
    render(<App />);
    expect(screen.getAllByText("仪表盘").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Mobile navigation")).toBeInTheDocument();
  });
});