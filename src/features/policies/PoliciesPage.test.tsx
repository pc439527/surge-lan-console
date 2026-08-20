import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SurgeClient } from "@/api/surge-client";
import { SurgeClientContext } from "@/app/surge-client-context";
import { PoliciesPage } from "./PoliciesPage";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function fakeClient() {
  return {
    getPolicyGroups: vi.fn().mockResolvedValue({
      Proxy: [
        { name: "HK 01", typeDescription: "ss", lineHash: "h1" },
        { name: "HK 02", typeDescription: "ss", lineHash: "h2" },
        { name: "JP Tokyo", typeDescription: "ss", lineHash: "h3" },
      ],
      Final: [{ name: "DIRECT", typeDescription: "direct" }],
    }),
    getGroupSelection: vi.fn().mockResolvedValue("HK 01"),
    getPolicyTestResults: vi.fn().mockResolvedValue({}),
    selectPolicy: vi.fn().mockResolvedValue(undefined),
    testPolicyGroup: vi.fn().mockResolvedValue({
      available: ["HK 01"],
      results: { "HK 01": { ok: true, latency: null } },
    }),
    getPolicyBenchmarkResults: vi.fn().mockResolvedValue({
      h1: { lastTestScoreInMS: 42, lastTestErrorMessage: null },
      h2: { lastTestScoreInMS: 61, lastTestErrorMessage: null },
      h3: { lastTestScoreInMS: -1, lastTestErrorMessage: "Timeout" },
    }),
  } as unknown as SurgeClient;
}

function renderPage(client: SurgeClient) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SurgeClientContext.Provider
        value={{ client, missingKey: false, connectionId: "c1", connection: null, demoMode: false }}
      >
        <PoliciesPage />
      </SurgeClientContext.Provider>
    </QueryClientProvider>,
  );
}

describe("PoliciesPage (T06/T07)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {});

  it("shows group cards without inline expansion", async () => {
    const client = fakeClient();
    renderPage(client);
    expect(await screen.findByText("Proxy")).toBeInTheDocument();
    expect(screen.getByText("Final")).toBeInTheDocument();
    // No per-group inline expand control remains.
    expect(screen.queryByText("展开策略")).not.toBeInTheDocument();
    // Current selection badge from getGroupSelection.
    expect(await screen.findAllByText("HK 01")).not.toHaveLength(0);
  });

  it("opens a drawer on card click with 测速全部 and per-node rows, no fake per-node test", async () => {
    const client = fakeClient();
    const user = userEvent.setup();
    renderPage(client);

    await screen.findByText("Proxy");
    await user.click(screen.getAllByRole("button", { name: /查看详情/ })[0]);

    // Drawer header actions.
    expect(screen.getByRole("button", { name: /测速全部/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /重新测速/ })).toBeInTheDocument();

    // All nodes listed inside the drawer ("HK 01" also exists on the card badge).
    expect((await screen.findAllByText("HK 01")).length).toBeGreaterThan(0);
    expect(screen.getByText("JP Tokyo")).toBeInTheDocument();

    // No dishonest per-node "测试" button anywhere.
    expect(screen.queryAllByRole("button", { name: "测试" })).toHaveLength(0);
  });

  it("测速全部 calls the group test endpoint with the group name", async () => {
    const client = fakeClient();
    const user = userEvent.setup();
    renderPage(client);

    await screen.findByText("Proxy");
    await user.click(screen.getAllByRole("button", { name: /查看详情/ })[0]);
    await user.click(screen.getByRole("button", { name: /测速全部/ }));

    await vi.waitFor(() => {
      expect(client.testPolicyGroup).toHaveBeenCalledWith("Proxy");
    });
    expect(toast.success).toHaveBeenCalled();
  });
});
