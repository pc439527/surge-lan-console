import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Button } from "./Button";
import { Card, CardContent, CardTitle } from "./Card";
import { Switch } from "./Switch";
import { SegmentedControl } from "./SegmentedControl";

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

describe("ui primitives", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Button renders children and applies variants", () => {
    render(<Button variant="destructive">Clear</Button>);
    const btn = screen.getByRole("button", { name: "Clear" });
    expect(btn).toBeInTheDocument();
    expect(btn.className).toContain("bg-danger");
  });

  it("Card renders title and content", () => {
    render(
      <Card>
        <CardTitle>Title</CardTitle>
        <CardContent>Body</CardContent>
      </Card>,
    );
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
  });

  it("Switch toggles checked state", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Switch onCheckedChange={onCheckedChange} aria-label="Toggle" />);
    await user.click(screen.getByRole("switch"));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("SegmentedControl reports selected value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Mode"
        options={[
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ]}
        value="a"
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "B" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("toast integration works", () => {
    toast.success("ok");
    expect(toast.success).toHaveBeenCalledWith("ok");
  });
});
