import { useCallback, useMemo, useRef, useState } from "react";
import {
  type CellContext,
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Check, Clipboard, Pause, Play, Search, X } from "lucide-react";
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
import { formatBytes, formatDuration, formatMsTimestamp } from "@/lib/format";
import { normalizeDurationMs, normalizeEpoch } from "@/api/normalize";
import { requestProtocol } from "@/lib/request";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { NoClientNotice } from "@/features/shared/NoClientNotice";
import { useRecentRequestsQuery } from "@/features/shared/queries";
import { buildRequestTimingWaterfall } from "./request-timing";

type StatusTone = "success" | "warning" | "danger" | "muted" | "info" | "purple";

/**
 * Status → color (OPTIMIZATION_PLAN §11): Active=yellow, Completed=green,
 * DNS Lookup=blue, Rule Evaluating=purple, Establishing Connection=blue,
 * Failed=red. Unknown statuses stay neutral — never guess from `completed`.
 */
function statusTone(status: string | null | undefined): StatusTone {
  switch (status) {
    case "Completed":
      return "success";
    case "Failed":
      return "danger";
    case "Active":
      return "warning";
    case "DNS Lookup":
    case "Establishing Connection":
      return "info";
    case "Rule Evaluating":
      return "purple";
    default:
      return "muted";
  }
}

function statusLabel(status: string | null | undefined): string {
  if (status === "Completed") return "已完成";
  if (status === "Active") return "活动中";
  if (status === "Failed") return "失败";
  if (status === "DNS Lookup") return "DNS 查询";
  if (status === "Rule Evaluating") return "规则评估";
  if (status === "Establishing Connection") return "建立连接";
  return status ?? "—";
}

export function RequestsPage() {
  const { client } = useSurgeClientState();
  const [paused, setPaused] = useState(false);
  const requestsQuery = useRecentRequestsQuery({ paused });
  const [search, setSearch] = useState("");
  const [policyFilter, setPolicyFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [protocolFilter, setProtocolFilter] = useState<string>("all");
  const [selected, setSelected] = useState<RequestItem | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Fix 07: pause freezes a real snapshot — the live query data keeps
  // updating underneath, but the table shows the captured list.
  const [pausedSnapshot, setPausedSnapshot] = useState<RequestItem[] | null>(null);
  const data = useMemo<RequestItem[]>(
    () => pausedSnapshot ?? (requestsQuery.data ?? []),
    [pausedSnapshot, requestsQuery.data],
  );

  const togglePause = useCallback(() => {
    setPaused((prev) => {
      const next = !prev;
      if (next) {
        setPausedSnapshot([...(requestsQuery.data ?? [])]);
      } else {
        setPausedSnapshot(null);
      }
      return next;
    });
  }, [requestsQuery.data]);

  // V1.2 keyboard shortcuts: "/" focuses search, "P" pauses/resumes.
  useKeyboardShortcuts(
    {
      "/": () => searchRef.current?.focus(),
      p: togglePause,
      P: togglePause,
    },
    [togglePause],
  );

  const protocols = useMemo(() => {
    const set = new Set<string>();
    data.forEach((r: RequestItem) => {
      const proto = requestProtocol(r.URL);
      if (proto !== "unknown") set.add(proto);
    });
    return [...set].sort();
  }, [data]);

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
      if (protocolFilter !== "all" && requestProtocol(r.URL) !== protocolFilter) return false;
      return true;
    });
  }, [data, search, policyFilter, statusFilter, protocolFilter]);

  const columns = useMemo<ColumnDef<RequestItem>[]>(
    () => [
      {
        accessorKey: "startDate",
        header: "时间",
        cell: (info: CellContext<RequestItem, unknown>) => {
          const raw = info.getValue() as number;
          const ms = normalizeEpoch(raw);
          return <span className="font-mono text-xs text-text-tertiary">{formatMsTimestamp(ms ?? NaN)}</span>;
        },
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
        header: "出口",
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
          // Task 07: startDate/completedDate units are NOT guaranteed equal —
          // normalize both before subtracting; invalid/negative → "—".
          const duration = normalizeDurationMs(row.startDate, row.completedDate);
          return (
            <span className="font-mono text-xs text-text-secondary">
              {formatDuration(duration)}
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
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-text-tertiary md:inline">
            <kbd className="rounded-xs border border-border bg-surface px-1 font-mono text-[11px]">/</kbd>{" "}
            搜索 ·{" "}
            <kbd className="rounded-xs border border-border bg-surface px-1 font-mono text-[11px]">P</kbd>{" "}
            暂停
          </span>
          <Button variant="secondary" size="sm" onClick={togglePause}>
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {paused ? "继续" : "Pause"}
          </Button>
        </div>
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
            <Select value={protocolFilter} onValueChange={setProtocolFilter}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="协议" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部协议</SelectItem>
                {protocols.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={policyFilter} onValueChange={setPolicyFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="出口" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部出口</SelectItem>
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
            {(search || policyFilter !== "all" || statusFilter !== "all" || protocolFilter !== "all") && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSearch("");
                  setPolicyFilter("all");
                  setStatusFilter("all");
                  setProtocolFilter("all");
                }}
              >
                <X className="h-3.5 w-3.5" />
                重置
              </Button>
            )}
          </div>

          {requestsQuery.isError ? (
            <div className="rounded-sm border border-danger/30 bg-danger/5 p-6 text-center">
              <p className="text-sm font-medium text-danger">请求记录加载失败</p>
              <Button className="mt-3" size="sm" variant="secondary" onClick={() => requestsQuery.refetch()}>
                重试
              </Button>
            </div>
          ) : requestsQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <div className="hidden overflow-x-auto md:block">
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

          {!requestsQuery.isLoading && !requestsQuery.isError && (
            <div className="space-y-2 md:hidden">
              {filtered.slice(0, 50).map((req) => (
                <button
                  key={req.id}
                  type="button"
                  onClick={() => setSelected(req)}
                  className="flex w-full flex-col gap-1 rounded-sm border border-border bg-elevated/50 px-3 py-2.5 text-left outline-none transition-colors duration-hover hover:bg-elevated/70"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text-primary">{hostOf(req.URL)}</span>
                    <Badge variant={statusTone(req.status)}>{statusLabel(req.status)}</Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-text-tertiary">
                      {requestProtocol(req.URL)} · {req.policyName || "—"}
                    </span>
                    <span className="font-mono text-[11px] text-text-secondary">
                      {formatDuration(normalizeDurationMs(req.startDate, req.completedDate))}
                    </span>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="py-8 text-center text-sm text-text-tertiary">没有符合当前筛选条件的请求。</p>
              )}
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
            {selected && <RequestDetails request={selected} />}
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

export function RequestDetails({ request }: { request: RequestItem }) {
  const [copyState, setCopyState] = useState<"url" | "headers" | "error" | null>(null);
  const timing = buildRequestTimingWaterfall(request);

  const copy = async (kind: "url" | "headers", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState(kind);
    } catch {
      setCopyState("error");
    }
  };

  return (
    <div className="space-y-5">
      <Section title="概览">
        <Row label="时间" value={formatMsTimestamp(normalizeEpoch(request.startDate) ?? NaN)} />
        <Row label="域名" value={hostOf(request.URL)} />
        <CopyRow label="URL" value={request.URL} copied={copyState === "url"} onCopy={() => copy("url", request.URL)} />
        <Row label="方法" value={request.method} />
        <Row label="协议" value={requestProtocol(request.URL)} mono />
        <Row label="状态" value={request.status ?? "—"} />
        <Row label="来源" value={`${request.sourceAddress}:${request.sourcePort}`} mono />
      </Section>
      <Section title="路由">
        <Row label="规则" value={request.rule} mono />
        <Row label="出口" value={request.policyName} />
        <Row label="目标" value={request.remoteAddress} mono />
        <Row label="本地地址" value={request.localAddress} mono />
        {request.processPath && <Row label="进程" value={request.processPath} mono />}
      </Section>
      <Section title="网络">
        <Row label="总耗时" value={formatDuration(normalizeDurationMs(request.startDate, request.completedDate))} />
        <Row label="连接建立" value={formatDuration(normalizeDurationMs(request.startDate, request.setupCompletedDate))} />
        <Row label="上传" value={formatBytes(request.outBytes ?? 0)} />
        <Row label="下载" value={formatBytes(request.inBytes ?? 0)} />
      </Section>
      <Section title="Timing Waterfall">
        {timing.phases.length > 0 ? (
          <div className="space-y-2" aria-label="请求连接阶段瀑布图">
            {timing.phases.map((phase, index) => (
              <div key={`${phase.name}-${index}`} className="grid grid-cols-[7rem_1fr_4rem] items-center gap-2">
                <span className="truncate text-xs text-text-secondary" title={phase.name}>{phase.name}</span>
                <div className="relative h-2.5 overflow-hidden rounded-pill bg-elevated" aria-hidden="true">
                  <span
                    className="absolute h-full rounded-pill bg-accent"
                    style={{ left: `${phase.offsetPercent}%`, width: `${Math.min(phase.widthPercent, 100 - phase.offsetPercent)}%` }}
                  />
                </div>
                <span className="text-right font-mono text-[11px] tabular-nums text-text-primary">
                  {formatDuration(phase.durationMs)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-tertiary">此请求没有可用的连接阶段数据。</p>
        )}
      </Section>
      {request.requestHeader && (
        <Section title="请求头">
          <div className="mb-2 flex justify-end">
            <Button size="sm" variant="secondary" onClick={() => copy("headers", request.requestHeader ?? "")}>
              {copyState === "headers" ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
              {copyState === "headers" ? "已复制" : "复制请求头"}
            </Button>
          </div>
          <pre className="max-h-64 overflow-auto rounded-sm border border-border bg-surface/60 p-3 font-mono text-[11px] leading-relaxed text-text-secondary">
            {request.requestHeader}
          </pre>
        </Section>
      )}
      <p className="min-h-4 text-xs text-danger" aria-live="polite">
        {copyState === "error" ? "复制失败，请检查浏览器剪贴板权限。" : ""}
      </p>
    </div>
  );
}

function CopyRow({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="flex items-start gap-3">
      <span className="shrink-0 text-xs text-text-secondary">{label}</span>
      <span className="min-w-0 flex-1 break-all text-right font-mono text-xs text-text-primary">{value}</span>
      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label="复制 URL" onClick={onCopy}>
        {copied ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
      </Button>
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