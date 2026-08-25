import { act, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SurgeClient } from "@/api/surge-client";
import { SurgeClientContext } from "@/app/surge-client-context";
import { normalizeEpoch } from "@/api/normalize";
import { formatBytes, formatUptime } from "@/lib/format";
import { TrafficPage } from "./TrafficPage";
import { useRawTrafficQuery, useTrafficQuery } from "@/features/shared/queries";

// jsdom has no canvas — stub the ECharts wrapper so these tests stay focused on the stats UI.
vi.mock("@/features/traffic/TrafficChart", () => ({
  TrafficChart: () => <div data-testid="traffic-chart" />,
}));

const START_TIME_S = 1_755_000_000; // epoch seconds (Surge unix time)

interface TrafficPayload {
  startTime: number;
  interface: Record<string, Record<string, number>>;
  connector: Record<string, Record<string, number>>;
}

function trafficPayload(overrides: Partial<TrafficPayload> = {}): TrafficPayload {
  return {
    startTime: START_TIME_S,
    interface: {
      pdp_ip0: {
        outCurrentSpeed: 7_320,
        in: 9_000_000_000,
        inCurrentSpeed: 1_630,
        outMaxSpeed: 760_720,
        out: 3_500_000_000,
        inMaxSpeed: 37_450_000,
      },
      en0: { outCurrentSpeed: 0, in: 0, inCurrentSpeed: 0, outMaxSpeed: 0, out: 0, inMaxSpeed: 0 },
    },
    connector: {
      DIRECT: {
        outCurrentSpeed: 100,
        in: 500_000_000,
        inCurrentSpeed: 200,
        outMaxSpeed: 300,
        out: 400_000_000,
        inMaxSpeed: 600,
      },
      "Test Proxy 03": {
        outCurrentSpeed: 10,
        in: 20,
        inCurrentSpeed: 30,
        outMaxSpeed: 40,
        out: 50,
        inMaxSpeed: 60,
      },
    },
    ...overrides,
  };
}

type MockedSurgeClient = SurgeClient & { getTraffic: ReturnType<typeof vi.fn> };

function fakeClient(payload: TrafficPayload) {
  const getTraffic = vi.fn().mockResolvedValue(payload);
  return { getTraffic } as unknown as MockedSurgeClient;
}

function failingClient() {
  const getTraffic = vi.fn().mockRejectedValue(new Error("boom"));
  return { getTraffic } as unknown as MockedSurgeClient;
}

function pendingClient() {
  const getTraffic = vi.fn().mockReturnValue(new Promise<never>(() => {}));
  return { getTraffic } as unknown as MockedSurgeClient;
}

function renderPage(client: SurgeClient, connectionId: string | null = "c1", qc?: QueryClient) {
  const queryClient = qc ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <SurgeClientContext.Provider
        value={{ client, missingKey: false, connectionId, connection: null, demoMode: false }}
      >
        <TrafficPage />
      </SurgeClientContext.Provider>
    </QueryClientProvider>,
  );
  return { ...utils, queryClient };
}

function dualConsumerPage(client: SurgeClient, qc?: QueryClient) {
  const queryClient = qc ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function DualConsumer() {
    const raw = useRawTrafficQuery();
    const summary = useTrafficQuery();
    return (
      <div>
        {raw.data ? "raw-ok" : "raw-loading"}:{summary.data ? "sum-ok" : "sum-loading"}
      </div>
    );
  }
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <SurgeClientContext.Provider
        value={{ client, missingKey: false, connectionId: "c1", connection: null, demoMode: false }}
      >
        <DualConsumer />
      </SurgeClientContext.Provider>
    </QueryClientProvider>,
  );
  return { ...utils, queryClient };
}

describe("TrafficPage (实时统计)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the 实时统计 header and subtitle", async () => {
    renderPage(fakeClient(trafficPayload()));
    // PageHeader: eyebrow "实时统计", title "流量"
    expect(screen.getByText("实时统计")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "流量" })).toBeInTheDocument();
    // Wait for data, then the description switches to the live 启动于 … · 1 秒采样 text
    await screen.findAllByText("pdp_ip0");
    expect(screen.getByText(/启动于 .* 1 秒采样/)).toBeInTheDocument();
    // data rows render (mobile card list + desktop table share the same names)
    expect(screen.getAllByText("pdp_ip0").length).toBeGreaterThan(0);
  });

  it("shows 开启时间 from epoch-seconds startTime and a live 运行时长", async () => {
    renderPage(fakeClient(trafficPayload()));
    const startMs = normalizeEpoch(START_TIME_S)!;
    const expected = new Date(startMs).toLocaleString("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    // The start time is part of the header description: 启动于 <expected> · …
    expect((await screen.findByText((content) => content.includes(expected)))).toBeInTheDocument();
    const uptime = formatUptime(Math.max(0, Date.now() - startMs));
    expect(screen.getAllByText(uptime).length).toBeGreaterThan(0);
  });

  it("also accepts a millisecond startTime (payload drift safety)", async () => {
    const payload = { ...trafficPayload(), startTime: START_TIME_S * 1000 };
    renderPage(fakeClient(payload));
    const startMs = normalizeEpoch(START_TIME_S * 1000)!;
    const expected = new Date(startMs).toLocaleString("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    expect(await screen.findByText((content) => content.includes(expected))).toBeInTheDocument();
  });

  it("renders interface rows with upload/download/total and current/max speed", async () => {
    renderPage(fakeClient(trafficPayload()));
    // Desktop table is the compact stats view; query inside the interface table.
    const table = (await screen.findAllByRole("table"))[0];
    const scope = within(table);
    expect(scope.getByText("en0")).toBeInTheDocument();
    const pdpRow = scope.getByText("pdp_ip0").closest("tr")!;
    // 方向不反：下载 = in，上传 = out，总计 = in + out
    expect(pdpRow.textContent).toContain(formatBytes(9_000_000_000)); // 下载 in
    expect(pdpRow.textContent).toContain(formatBytes(3_500_000_000)); // 上传 out
    expect(pdpRow.textContent).toContain(formatBytes(12_500_000_000)); // 总计
    expect(pdpRow.textContent).toContain("↑ " + formatBytes(7_320) + "/s"); // 当前上传
    expect(pdpRow.textContent).toContain("↓ " + formatBytes(1_630) + "/s"); // 当前下载
    expect(pdpRow.textContent).toContain("↑ " + formatBytes(760_720) + "/s"); // 最高上传
    expect(pdpRow.textContent).toContain("↓ " + formatBytes(37_450_000) + "/s"); // 最高下载
  });

  it("renders connector rows and defaults to 总计 DESC", async () => {
    renderPage(fakeClient(trafficPayload()));
    const tables = await screen.findAllByRole("table");
    const scope = within(tables[1]); // connector table
    expect(scope.getByText("DIRECT")).toBeInTheDocument();
    expect(scope.getByText("Test Proxy 03")).toBeInTheDocument();
    const rows = scope.getAllByRole("row");
    const texts = rows.map((row) => row.textContent ?? "");
    const directIdx = texts.findIndex((t) => t.includes("DIRECT"));
    const hkIdx = texts.findIndex((t) => t.includes("Test Proxy 03"));
    expect(directIdx).toBeGreaterThan(-1);
    expect(hkIdx).toBeGreaterThan(directIdx); // DIRECT total (900 MB) > HK line (70 B)
  });

  it("shows the interface empty message when interface is {}", async () => {
    renderPage(fakeClient(trafficPayload({ interface: {} })));
    expect(await screen.findByText("当前 Surge 未返回网络接口统计数据")).toBeInTheDocument();
  });

  it("shows the connector empty message when connector is {}", async () => {
    renderPage(fakeClient(trafficPayload({ connector: {} })));
    expect(await screen.findByText("当前 Surge 未返回连接器流量统计数据")).toBeInTheDocument();
  });

  it("shows a friendly error state with a working 重新加载 button", async () => {
    const client = failingClient();
    renderPage(client);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/AxiosError|ERR_NETWORK/)).not.toBeInTheDocument();
    screen.getByRole("button", { name: "重新加载" }).click();
    await vi.waitFor(() => expect(client.getTraffic.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("shows skeletons while loading (no partial data, no error text)", async () => {
    const { container } = renderPage(pendingClient());
    expect(screen.getByRole("heading", { name: "流量" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("pdp_ip0")).not.toBeInTheDocument();
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("switches connections without leaking the previous instance's stats", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const clientA = fakeClient(trafficPayload());
    const clientB = fakeClient(
      trafficPayload({
        interface: { utun6: { outCurrentSpeed: 1, in: 2, inCurrentSpeed: 3, outMaxSpeed: 4, out: 5, inMaxSpeed: 6 } },
        connector: { "JP Tokyo": { outCurrentSpeed: 1, in: 2, inCurrentSpeed: 3, outMaxSpeed: 4, out: 5, inMaxSpeed: 6 } },
      }),
    );

    const Harness = ({ client, id }: { client: SurgeClient; id: string }) => (
      <QueryClientProvider client={qc}>
        <SurgeClientContext.Provider
          value={{ client, missingKey: false, connectionId: id, connection: null, demoMode: false }}
        >
          <TrafficPage />
        </SurgeClientContext.Provider>
      </QueryClientProvider>
    );

    const { rerender } = render(<Harness client={clientA} id="c1" />);
    expect((await screen.findAllByText("pdp_ip0")).length).toBeGreaterThan(0);

    rerender(<Harness client={clientB} id="c2" />);
    expect((await screen.findAllByText("utun6")).length).toBeGreaterThan(0);
    expect(screen.queryByText("pdp_ip0")).not.toBeInTheDocument();
    expect(screen.queryByText("DIRECT")).not.toBeInTheDocument();
    expect(clientB.getTraffic).toHaveBeenCalledTimes(1);
  });

  it("derives the summary from the SAME cache — raw + summary consumers share one request", async () => {
    const client = fakeClient(trafficPayload());
    dualConsumerPage(client);
    expect(await screen.findByText("raw-ok:sum-ok")).toBeInTheDocument();
    expect(client.getTraffic).toHaveBeenCalledTimes(1);
  });

  it("polls /v1/traffic once per second in the foreground (not twice)", async () => {
    vi.useFakeTimers();
    const client = fakeClient(trafficPayload());
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    dualConsumerPage(client, qc);

    // initial fetch settles on the microtask queue
    await act(async () => {});
    const atStart = client.getTraffic.mock.calls.length;
    expect(atStart).toBe(1); // both consumers share one request

    for (let i = 0; i < 5; i++) {
      await act(async () => {
        vi.advanceTimersByTime(1_000);
      });
    }
    expect(client.getTraffic.mock.calls.length).toBe(atStart + 5);
  });
});
