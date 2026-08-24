import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { formatBytes } from "@/lib/format";
import { TrafficStatsTable, type TrafficStatsRow } from "./TrafficStatsTable";

const ROWS: TrafficStatsRow[] = [
  {
    name: "pdp_ip0",
    out: 1_000_000_000,
    in: 5_000_000_000,
    outCurrentSpeed: 1_000,
    inCurrentSpeed: 2_000,
    outMaxSpeed: 500_000,
    inMaxSpeed: 6_000_000,
  },
  {
    name: "en0",
    out: 0,
    in: 2_000,
    outCurrentSpeed: 0,
    inCurrentSpeed: 0,
    outMaxSpeed: 0,
    inMaxSpeed: 0,
  },
  {
    name: "utun3",
    out: 500,
    in: 800,
    outCurrentSpeed: 10,
    inCurrentSpeed: 20,
    outMaxSpeed: 30,
    inMaxSpeed: 40,
  },
];

const LONG_NAME = "Test Proxy 03-extra-long-connector-name-for-ellipsis";
const LONG_NAME_ROW: TrafficStatsRow = {
  name: LONG_NAME,
  out: 100,
  in: 200,
  outCurrentSpeed: 1,
  inCurrentSpeed: 2,
  outMaxSpeed: 3,
  inMaxSpeed: 4,
};

describe("TrafficStatsTable", () => {
  it("renders name, upload, download and total columns", () => {
    render(<TrafficStatsTable kind="connector" rows={ROWS} emptyMessage="无数据" />);
    expect(screen.getByText("pdp_ip0")).toBeInTheDocument();
    expect(screen.getByText("en0")).toBeInTheDocument();
    expect(screen.getByText(formatBytes(1_000_000_000))).toBeInTheDocument(); // 上传
    expect(screen.getByText(formatBytes(5_000_000_000))).toBeInTheDocument(); // 下载
    expect(screen.getByText(formatBytes(5_000_000_000 + 1_000_000_000))).toBeInTheDocument(); // 总计
  });

  it("defaults to total (in + out) descending", () => {
    render(<TrafficStatsTable kind="interface" rows={ROWS} emptyMessage="无数据" />);
    const rows = screen.getAllByRole("row");
    // row[0] = header; rows[1..] follow the default total DESC order.
    const order = rows.slice(1).map((row) => within(row).getAllByText(/./)[0].textContent);
    expect(order[0]).toBe("pdp_ip0"); // 6 GB
    expect(order[1]).toBe("en0"); // 2000 B
    expect(order[2]).toBe("utun3"); // 1300 B
  });

  it("sorts by name ascending when the 名称 header is clicked, then desc", async () => {
    const user = userEvent.setup();
    render(<TrafficStatsTable kind="interface" rows={ROWS} emptyMessage="无数据" />);
    const nameHeader = screen.getByRole("button", { name: /名称/ });
    await user.click(nameHeader);
    let order = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByText(/./)[0].textContent);
    expect(order).toEqual(["en0", "pdp_ip0", "utun3"]);
    await user.click(nameHeader);
    order = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByText(/./)[0].textContent);
    expect(order).toEqual(["utun3", "pdp_ip0", "en0"]);
  });

  it("renders current and max speed as arrow + bytes/s pairs", () => {
    render(<TrafficStatsTable kind="connector" rows={ROWS} emptyMessage="无数据" />);
    // pdp_ip0 current speed: ↑ 1000 B/s (upload loc), ↓ 2 KB/s
    expect(screen.getByText("↑ " + formatBytes(1_000) + "/s")).toBeInTheDocument();
    expect(screen.getByText("↓ " + formatBytes(2_000) + "/s")).toBeInTheDocument();
    // pdp_ip0 max speed
    expect(screen.getByText("↑ " + formatBytes(500_000) + "/s")).toBeInTheDocument();
    expect(screen.getByText("↓ " + formatBytes(6_000_000) + "/s")).toBeInTheDocument();
  });

  it("sorts by current speed using the summed rate (up + down)", async () => {
    const user = userEvent.setup();
    render(<TrafficStatsTable kind="connector" rows={ROWS} emptyMessage="无数据" />);
    const speedHeader = screen.getByRole("button", { name: /当前速度/ });
    await user.click(speedHeader); // desc
    let order = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByText(/./)[0].textContent);
    // current totals: pdp_ip0=3000, utun3=30, en0=0 -> desc: pdp_ip0, utun3, en0
    expect(order).toEqual(["pdp_ip0", "utun3", "en0"]);
    await user.click(speedHeader); // asc
    order = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByText(/./)[0].textContent);
    expect(order).toEqual(["en0", "utun3", "pdp_ip0"]);
  });

  it("keeps long connector names readable via the title tooltip", () => {
    render(<TrafficStatsTable kind="connector" rows={[LONG_NAME_ROW]} emptyMessage="无数据" />);
    const cell = screen.getByTitle(LONG_NAME);
    expect(cell).toHaveTextContent(LONG_NAME);
  });

  it("shows the empty message when there are no rows", () => {
    render(<TrafficStatsTable kind="connector" rows={[]} emptyMessage="当前 Surge 未返回连接器流量统计数据" />);
    expect(screen.getByText("当前 Surge 未返回连接器流量统计数据")).toBeInTheDocument();
  });

  it("changes name column min-width by kind (160px interface / 240px connector)", () => {
    const { container: iface, unmount } = render(
      <TrafficStatsTable kind="interface" rows={[ROWS[0]]} emptyMessage="无数据" />,
    );
    expect(iface.querySelector("th")?.getAttribute("class")).toContain("min-w-[160px]");
    unmount();
    const { container: conn } = render(
      <TrafficStatsTable kind="connector" rows={[ROWS[0]]} emptyMessage="无数据" />,
    );
    expect(conn.querySelector("th")?.getAttribute("class")).toContain("min-w-[240px]");
  });
});
