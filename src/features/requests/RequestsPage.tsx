import { useMemo, useState } from "react";
import {
  type CellContext,
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Pause, Play, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/Drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { useSurgeClientState } from "@/app/surge-client-context";
import type { RequestItem } from "@/api/types";
import { formatMsTimestamp } from "@/lib/format";
import { NoClientNotice } from "@/features/shared/NoClientNotice";
import { useRecentRequestsQuery } from "@/features/dashboard/dashboard-queries";

function statusTone(status: string | undefined): "success" | "warning" | "danger" | "muted" {
  if (status === "Completed") return "success";
  if (status === "Active") return "warning";
  if (status === "Failed") return "danger";
  return "muted";
}

function statusLabel(status: string | undefined): string {
  if (status === "Completed") return "已完成";
  if (status === "Active") return "活动中";
  if (status === "Failed") return "失败";
  return status ?? "—";
}

export function RequestsPage() {
  const { client } = useSurgeClientState();
  const requestsQuery = useRecentRequestsQuery();
  const [search, setSearch] = useState("");
  const [policyFilter, setPolicyFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState<RequestItem | null>(null);

  const frozen = useMemo(() => requestsQuery.data ?? [], [requestsQuery.data]);
  const data = useMemo<RequestItem[]>(
    () => (paused ? frozen : (requestsQuery.data ?? [])),
    [paused, frozen, requestsQuery.data],
  );

  const policies = useMemo(() => {
    const set = new Set<string>();
    data.forEach((r: RequestItem) => r.policyName && set.add(r.policyName));
    return [...set].sort();
  }, [data]);

  const filtered = useMemo(() => {
    return data.filter((r: RequestItem) => {
      const q = search.trim().toLowerCase();
      if (q && !r.URL.toLowerCase().includes(q) && !hostOf(r.URL).includes(q)) return false;
      if (policyFilter !== "all" && r.policyName !== policyFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      return true;
    });
  }, [data, search, policyFilter, statusFilter]);

  const columns = useMemo<ColumnDef<RequestItem>[]>(
    () => [
      {
        accessorKey: "startDate",
        header: "时间",
        cell: (info: CellContext<RequestItem, unknown>) => (
          <span className="font-mono text-xs text-text-tertiary">{formatMsTimestamp(info.getValue() as number)}</span>
        ),
      },
      {
        accessorKey: "URL",
        header: "主机",
        cell: (info: CellContext<RequestItem, unknown>) => (
          <span className="max-w-[220px] truncate text-[13px] text-text-primary">{hostOf(info.getValue() as string)}</span>
        ),
      },
      {
        accessorKey: "method",
        header: "方法",
        cell: (info: CellContext<RequestItem, unknown>) => (
          <span className="font-mono text-xs text-text-secondary">{info.getValue() as string}</span>
        ),
      },
      {
        accessorKey: "policyName",
        header: "策略",
        cell: (info: CellContext<RequestItem, unknown>) => (
          <span className="text-[13px] text-text-primary">{info.getValue() as string}</span>
        ),
      },
      {
        accessorKey: "rule",
        header: "规则",
        cell: (info: CellContext<RequestItem, unknown>) => (
          <span className="max-w-[180px] truncate text-xs text-text-secondary">{info.getValue() as string}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "状态",
        cell: (info: CellContext<RequestItem, unknown>) => {
          const status = info.getValue() as string | undefined;
          return <Badge variant={statusTone(status)}>{statusLabel(status)}</Badge>;
        },
      },
      {
        accessorKey: "completedDate",
        header: "耗时",
        cell: (info: CellContext<RequestItem, unknown>) => {
          const row = info.row.original;
          const ms = row.completedDate - row.startDate;
          return (
            <span className="font-mono text-xs text-text-secondary">
              {ms > 0 ? `${(ms / 1000).toFixed(2)}s` : "—"}
            </span>
          );
        },
      },
    ],
    [],
  );

  const table = useReactTable<RequestItem>({
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (!client) return <NoClientNotice page="Requests" />;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold text-text-primary">Requests</h1>
          <p className="mt-0.5 text-sm text-text-secondary">通过代理的最近连接</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setPaused((p) => !p)}>
          {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          {paused ? "继续" : "Pause"}
        </Button>
      </header>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <Input
                className="pl-9"
                placeholder="搜索主机或 URL..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={policyFilter} onValueChange={setPolicyFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="策略" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部策略</SelectItem>
                {policies.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="Completed">Completed</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
              </SelectContent>
            </Select>
            {(search || policyFilter !== "all" || statusFilter !== "all") && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSearch("");
                  setPolicyFilter("all");
                  setStatusFilter("all");
                }}
              >
                <X className="h-3.5 w-3.5" />
                重置
              </Button>
            )}
          </div>

          {requestsQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id} className="border-b border-border">
                      {hg.headers.map((header) => (
                        <th
                          key={header.id}
                          className="px-3 py-2 text-left text-xs font-medium text-text-tertiary"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-b border-border/50 transition-colors duration-hover hover:bg-elevated/60"
                      onClick={() => setSelected(row.original)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-3 py-2.5">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {table.getRowModel().rows.length === 0 && (
                    <tr>
                      <td colSpan={columns.length} className="px-3 py-10 text-center text-sm text-text-tertiary">
                        没有符合当前筛选条件的请求。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Request detail drawer */}
      <Drawer open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DrawerContent side="right">
          <DrawerHeader>
            <DrawerTitle>请求详情</DrawerTitle>
            <DrawerDescription>{selected ? hostOf(selected.URL) : ""}</DrawerDescription>
          </DrawerHeader>
          <DrawerBody>
            {selected && (
              <div className="space-y-5">
                <Section title="概览">
                  <Row label="时间" value={formatMsTimestamp(selected.startDate)} />
                  <Row label="域名" value={hostOf(selected.URL)} />
                  <Row label="URL" value={selected.URL} mono />
                  <Row label="方法" value={selected.method} />
                  <Row label="状态" value={selected.status ?? "—"} />
                  <Row label="来源" value={`${selected.sourceAddress}:${selected.sourcePort}`} mono />
                </Section>
                <Section title="路由">
                  <Row label="规则" value={selected.rule} mono />
                  <Row label="策略" value={selected.policyName} />
                </Section>
                <Section title="网络">
                  <Row label="上传" value={`${selected.outBytes ?? 0} B`} />
                  <Row label="下载" value={`${selected.inBytes ?? 0} B`} />
                </Section>
              </div>
            )}
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-xs text-text-secondary">{label}</span>
      <span className={`min-w-0 break-all text-right text-[13px] text-text-primary ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
    </div>
  );
}