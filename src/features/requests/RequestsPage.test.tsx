import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SurgeClientContext } from "@/app/surge-client-context";
import type { RequestItem } from "@/api/types";
import { RequestsPage } from "./RequestsPage";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function makeRequest(overrides: Partial<RequestItem> & { id: number }): RequestItem {
  return {
    URL: "",
    method: "",
    policyName: "",
    rule: "",
    status: "Completed",
    startDate: 1_700_000_000_000,
    completedDate: 1_700_000_000_080,
    sourceAddress: "192.168.50.20",
    sourcePort: 51_496,
    outBytes: 0,
    inBytes: 0,
    failed: false,
    completed: true,
    modified: false,
    replica: false,
    remoteAddress: "",
    localAddress: "192.168.50.10",
    inCurrentSpeed: 0,
    outCurrentSpeed: 0,
    inMaxSpeed: 0,
    outMaxSpeed: 0,
    pid: 0,
    setupCompletedDate: 1_700_000_000_040,
    ...overrides,
  };
}

const FIXTURES: RequestItem[] = [
  makeRequest({
    id: 1,
    method: "HTTPS",
    hostname: "docs.example.com",
    URL: "https://docs.example.com/openapi.json",
    remoteAddress: "192.0.2.10:443",
    policyName: "Test Proxy 02",
    rule: "DOMAIN-SUFFIX,example.com",
    requestHeader: ["GET /openapi.json HTTP/1.1", "Host: docs.example.com"].join("\n"),
    notes: ["[Rule] Rule evaluating..."],
    timingRecords: [{ name: "TLS Handshake", durationInMillisecond: 6 }],
    inBytes: 1_618,
    outBytes: 203_020,
  }),
  makeRequest({
    id: 2,
    method: "UDP",
    hostname: "203.0.113.53",
    URL: "203.0.113.53:53",
    remoteAddress: "203.0.113.53:53 (Port Map)",
    destPort: 53,
    status: "Active",
    completed: false,
    rule: "DNS",
    policyName: "DIRECT",
    inCurrentSpeed: 1_240,
    outCurrentSpeed: 890,
  }),
  makeRequest({
    id: 3,
    method: "TCP",
    hostname: "mail.example.com",
    URL: "mail.example.com:993",
    remoteAddress: "203.0.113.7:993",
    destPort: 993,
    rule: "DOMAIN-SUFFIX,example.com",
    policyName: "JP Tokyo",
  }),
];

function renderPage(client: Record<string, unknown>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SurgeClientContext.Provider
        value={{ client: client as never, missingKey: false, connectionId: null, connection: null, demoMode: false }}
      >
        <RequestsPage />
      </SurgeClientContext.Provider>
    </QueryClientProvider>,
  );
}

/**
 * Click the DNS row: the target address renders in the desktop table AND the
 * mobile card list (md:hidden hides only via CSS, which jsdom does not apply),
 * so use findAllByText and click the first occurrence.
 */
async function openDnsRow(user: ReturnType<typeof userEvent.setup>) {
  const hosts = await screen.findAllByText("203.0.113.53:53");
  await user.click(hosts[0]);
  return screen.getByRole("dialog");
}

describe("RequestsPage (Request Inspector V2)", () => {
  it("classifies mock rows into text protocol badges", async () => {
    renderPage({ getRecentRequests: vi.fn().mockResolvedValue(FIXTURES) });
    expect((await screen.findAllByText("203.0.113.53:53")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("DNS").length).toBeGreaterThan(0);
    expect(screen.getAllByText("TCP").length).toBeGreaterThan(0);
    expect(screen.getAllByText("HTTPS").length).toBeGreaterThan(0);
  });

  it("shows a friendly no-HTTP-header state for UDP/DNS rows", async () => {
    const user = userEvent.setup();
    renderPage({ getRecentRequests: vi.fn().mockResolvedValue(FIXTURES) });
    const dialog = await openDnsRow(user);
    await user.click(await within(dialog).findByRole("button", { name: "请求" }));
    expect(within(dialog).getByText("此连接不是 HTTP 请求")).toBeInTheDocument();
    expect(within(dialog).getByText("无可用 HTTP Header")).toBeInTheDocument();
  });

  it("renders parsed request headers and notes for HTTPS rows", async () => {
    const user = userEvent.setup();
    renderPage({ getRecentRequests: vi.fn().mockResolvedValue(FIXTURES) });
    const hosts = await screen.findAllByText("docs.example.com");
    await user.click(hosts[0]);
    const dialog = screen.getByRole("dialog");
    await user.click(await within(dialog).findByRole("button", { name: "请求" }));
    expect(within(dialog).getByText("Host")).toBeInTheDocument();
    expect(within(dialog).getByText("GET /openapi.json HTTP/1.1")).toBeInTheDocument();
    expect(within(dialog).getByText("Rule")).toBeInTheDocument();
  });

  it("kills an active request after two-step confirmation", async () => {
    const user = userEvent.setup();
    const killRequest = vi.fn().mockResolvedValue(undefined);
    renderPage({ getRecentRequests: vi.fn().mockResolvedValue(FIXTURES), killRequest });
    const dialog = await openDnsRow(user);
    await user.click(await within(dialog).findByRole("button", { name: "终止连接" }));
    expect(killRequest).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "确认终止" }));
    await waitFor(() => expect(killRequest).toHaveBeenCalledWith(2));
  });
});