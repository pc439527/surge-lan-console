import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Button } from "./Button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "./Dialog";
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from "./Drawer";

describe("Dialog & Drawer (glass layers)", () => {
  it("opens dialog content via trigger", async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger asChild>
          <Button>Open</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>Clear DNS Cache?</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Clear DNS Cache?")).toBeInTheDocument();
  });

  it("opens drawer content via trigger", async () => {
    const user = userEvent.setup();
    render(
      <Drawer>
        <DrawerTrigger asChild>
          <Button>Open Drawer</Button>
        </DrawerTrigger>
        <DrawerContent side="right">
          <DrawerTitle>Request Detail</DrawerTitle>
        </DrawerContent>
      </Drawer>,
    );
    await user.click(screen.getByRole("button", { name: "Open Drawer" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Request Detail")).toBeInTheDocument();
  });
});
