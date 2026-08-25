import { useCallback, useMemo, useRef, useState } from "react";
import {
  type CellContext,
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  Clipboard,
  FileText,
  Layers,
  Loader2,
  Pause,
  Play,
  Search,
  Timer,
  X,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
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
import type { SurgeClient } from "@/api/surge-client";
import { formatBytes, formatDuration, formatMsTimestamp, formatRate } from "@/lib/format";
import { normalizeDurationMs, normalizeEpoch } from "@/api/normalize";
import {
  classifyRequestProtocol,
  noteTag,
  parseRequestHeaders,
  requestHostLabel,
  requestSourceAddress,
  requestTargetAddress,
  type RequestAppProtocol,
} from "@/lib/request";
import { ProtocolBadge } from "./ProtocolBadge";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { NoClientNotice } from "@/features/shared/NoClientNotice";
import { useRecentRequestsQuery } from "@/features/shared/queries";
import { buildRequestTimingWaterfall } from "./request-timing";

type StatusTone = "success" | "warning" | "danger" | "muted" | "info" | "purple";

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

const HTTP_LIKE_PROTOCOLS: ReadonlySet<RequestAppProtocol> = new Set(["HTTP", "HTTPS", "WS", "WSS"]);

function isKillable(request: RequestItem): boolean {
  if (request.failed) return false;
  if (request.completed) return false;
  return request.status !== "Completed" && request.status !== "Failed";
}

export function RequestsPage() {
  const { client } = useSurgeClientState();
  const [paused, setPaused] = useState(false);
  const requestsQuery = useRecentRequestsQuery({ paused });
  const [search, setSearch] = useState("");
  const [policyFilter, setPolicyFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [protocolFilter, setProtocolFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [selected, setSelected] = useState<RequestItem | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [pausedSnapshot, setPausedSnapshot] = useState<RequestItem[] | null>(null);
  const [killedIds, setKilledIds] = useState<ReadonlySet<number>>(() => new Set());

  const data = useMemo<RequestItem[]>(() => {
    const base = pausedSnapshot ?? (requestsQuery.data ?? []);
    return killedIds.size === 0 ? base : base.filter((req) => !killedIds.has(req.id));
  }, [pausedSnapshot, requestsQuery.data, killedIds]);

  const togglePause = useCallback(() => {
    setPaused((prev) => {
      const next = !prev;
      if (next) setPausedSnapshot([...(requestsQuery.data ?? [])]);
      else setPausedSnapshot(null);
      return next;
    });
  }, [requestsQuery.data]);

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
      const app = classifyRequestProtocol(r).app;
      if (app !== "UNKNOWN") set.add(app);
    });
    return [...set].sort();
  }, [data]);

  const policies = useMemo(() => {
    const set = new Set<string>();
    data.forEach((r: RequestItem) => r.policyName && set.add(r.policyName));
    return [...set].sort();
  }, [data]);

  const sources = useMemo(() => [...new Set(data.map((r) => r.sourceAddress).filter(Boolean))].sort(), [data]);

  const filtered = useMemo(() => {
    return data.filter((r: RequestItem) => {
      const q = search.trim().toLowerCase();
      const host = requestHostLabel(r).toLowerCase();
      const target = requestTargetAddress(r).toLowerCase();
      if (q && !r.URL.toLowerCase().includes(q) && !host.includes(q) && !target.includes(q)) return false;
      if (policyFilter !== "all" && r.policyName !== policyFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (protocolFilter !== "all" && classifyRequestProtocol(r).app !== protocolFilter) return false;
      if (sourceFilter !== "all" && r.sourceAddress !== sourceFilter) return false;
      return true;
    });
  }, [data, search, policyFilter, statusFilter, protocolFilter, sourceFilter]);

  const columns = useMemo<ColumnDef<RequestItem>[]>(
    () => [
      {
        accessorKey: "startDate",
        header: "时间",
        cell: (info: CellContext<RequestItem, unknown>) => {
          const raw = info.getValue() as number;
          const ms = normalizeEpoch(raw);
          return <span className="whitespace-nowrap font-mono text-xs text-text-tertiary">{formatMsTimestamp(ms ?? NaN)}</span>;
        },
      },
      {
        accessorKey: "URL",
        header: "主机",
        cell: (info: CellContext<RequestItem, unknown>) => <HostCell request={info.row.original} />,
      },
      {
        accessorKey: "method",
        header: "协议",
        cell: (info: CellContext<RequestItem, unknown>) => <ProtocolBadge app={classifyRequestProtocol(info.row.original).app} />,
      },
      {
        accessorKey: "sourceAddress",
        header: "来源",
        cell: (info: CellContext<RequestItem, unknown>) => <SourceCell request={info.row.original} />,
      },
      {
        accessorKey: "policyName",
        header: "出口",
        cell: (info: CellContext<RequestItem, unknown>) => <span className="text-[13px] text-text-primary">{info.getValue() as string}</span>,
      },
      {
        accessorKey: "rule",
        header: "规则",
        cell: (info: CellContext<RequestItem, unknown>) => <span className="block max-w-[180px] truncate text-xs text-text-secondary">{info.getValue() as string}</span>,
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
        accessorKey: "inBytes",
        header: "流量",
        cell: (info: CellContext<RequestItem, unknown>) => <TrafficCell request={info.row.original} />,
      },
      {
        accessorKey: "completedDate",
        header: "耗时",
        cell: (info: CellContext<RequestItem, unknown>) => {
          const row = info.row.original;
          const duration = normalizeDurationMs(row.startDate, row.completedDate);
          return <span className="whitespace-nowrap font-mono text-xs text-text-secondary">{formatDuration(duration)}</span>;
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

  if (!client) return <NoClientNotice page="请求" />;

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        title="请求"
        description={`代理连接与协议活动 · 当前展示 ${filtered.length} / ${data.length} 条`}
        actions={(
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-text-tertiary md:inline">
              <kbd className="rounded-xs border border-border bg-surface px-1.5 py-0.5 font-mono text-xs">/</kbd>{" "}
              搜索 ·{" "}
              <kbd className="rounded-xs border border-border bg-surface px-1.5 py-0.5 font-mono text-xs">P</kbd>{" "}
              暂停
            </span>
            <Button variant="secondary" size="sm" onClick={togglePause}>
              {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              {paused ? "继续" : "暂停"}
            </Button>
          </div>
        )}
      />

      <Card className="overflow-hidden">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <Input ref={searchRef} className="pl-9" placeholder="搜索主机 / IP / URL…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={protocolFilter} onValueChange={setProtocolFilter}>
              <SelectTrigger className="w-32"><SelectValue placeholder="协议" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部协议</SelectItem>
                {protocols.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={policyFilter} onValueChange={setPolicyFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="出口" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部出口</SelectItem>
                {policies.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="状态" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="Completed">已完成</SelectItem>
                <SelectItem value="Active">活动中</SelectItem>
                <SelectItem value="Failed">失败</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="来源" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部来源</SelectItem>
                {sources.map((source) => <SelectItem key={source} value={source}>{source}</SelectItem>)}
              </SelectContent>
            </Select>
            {(search || policyFilter !== "all" || statusFilter !== "all" || protocolFilter !== "all" || sourceFilter !== "all") && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSearch("");
                  setPolicyFilter("all");
                  setStatusFilter("all");
                  setProtocolFilter("all");
                  setSourceFilter("all");
                }}
              >
                <X className="h-3.5 w-3.5" />
                重置
              </Button>
            )}
          </div>

          {requestsQuery.isError ? (
            <div className="rounded-[14px] border border-danger/30 bg-danger/5 p-6 text-center">
              <p className="text-sm font-medium text-danger">请求记录加载失败</p>
              <Button className="mt-3" size="sm" variant="secondary" onClick={() => requestsQuery.refetch()}>重试</Button>
            </div>
          ) : requestsQuery.isLoading ? (
            <div className="space-y-2">
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
                        <th key={header.id} className="px-3 py-2 text-left text-xs font-medium text-text-tertiary">
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
                      className="cursor-pointer border-b border-border/50 transition-colors duration-hover last:border-b-0 hover:bg-elevated/60"
                      onClick={() => setSelected(row.original)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-3 py-2.5 align-middle">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                      ))}
                    </tr>
                  ))}
                  {table.getRowModel().rows.length === 0 && (
                    <tr><td colSpan={columns.length} className="px-3 py-10 text-center text-sm text-text-tertiary">没有符合当前筛选条件的请求。</td></tr>
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
                  className="flex w-full flex-col gap-1.5 rounded-[14px] bg-elevated/55 px-3 py-3 text-left outline-none transition-colors duration-hover hover:bg-elevated/75 focus-visible:ring-2 focus-visible:ring-accent/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text-primary">{requestHostLabel(req)}</span>
                    <ProtocolBadge app={classifyRequestProtocol(req).app} />
                  </div>
                  <div className="font-mono text-xs text-text-tertiary">{requestTargetAddress(req)}</div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <Badge variant={statusTone(req.status)}>{statusLabel(req.status)}</Badge>
                      <span className="truncate text-xs text-text-tertiary">{req.policyName || "—"}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-text-secondary">{formatDuration(normalizeDurationMs(req.startDate, req.completedDate))}</span>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && <p className="py-8 text-center text-sm text-text-tertiary">没有符合当前筛选条件的请求。</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Drawer open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DrawerContent side="right" className="w-[min(100vw,620px)]">
          <DrawerHeader className="pr-12">
            <DrawerTitle className="truncate">{selected ? requestHostLabel(selected) : "请求详情"}</DrawerTitle>
            <DrawerDescription className="break-all font-mono">{selected ? requestTargetAddress(selected) : ""}</DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="scrollbar-thin px-4 pb-5">
            {selected && (
              <RequestInspector
                request={selected}
                client={client}
                onKilled={(id) => {
                  setKilledIds((prev) => new Set(prev).add(id));
                  setSelected((sel) => (sel && sel.id === id ? null : sel));
                }}
              />
            )}
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function HostCell({ request }: { request: RequestItem }) {
  return (
    <div className="min-w-0">
      <div className="max-w-[190px] truncate text-[13px] text-text-primary">{requestHostLabel(request)}</div>
      <div className="max-w-[190px] truncate font-mono text-xs text-text-tertiary">{requestTargetAddress(request)}</div>
    </div>
  );
}

function SourceCell({ request }: { request: RequestItem }) {
  const source = requestSourceAddress(request);
  const [host, port] = source === "—" ? ["—", null] : splitLastColon(source);
  return (
    <div className="min-w-0">
      <div className="whitespace-nowrap text-xs text-text-primary">{host}</div>
      {port && <div className="font-mono text-xs text-text-tertiary">:{port}</div>}
    </div>
  );
}

function splitLastColon(value: string): [string, string | null] {
  const idx = value.lastIndexOf(":");
  if (idx <= 0) return [value, null];
  const port = value.slice(idx + 1);
  if (!/^\d{1,5}$/.test(port)) return [value, null];
  return [value.slice(0, idx), port];
}

function TrafficCell({ request }: { request: RequestItem }) {
  return (
    <div className="flex flex-col items-end gap-0.5 font-mono text-xs leading-tight">
      <span className="text-text-secondary">↓ {formatBytes(request.inBytes ?? 0)}</span>
      <span className="text-text-tertiary">↑ {formatBytes(request.outBytes ?? 0)}</span>
    </div>
  );
}

type InspectorTab = "overview" | "request" | "timing";

export function RequestInspector({
  request,
  client,
  onKilled,
}: {
  request: RequestItem;
  client: SurgeClient;
  onKilled?: (id: number) => void;
}) {
  const [tab, setTab] = useState<InspectorTab>("overview");
  const [copyState, setCopyState] = useState<"url" | "headers" | "raw" | "error" | null>(null);
  const [showRawHeaders, setShowRawHeaders] = useState(false);
  const [confirmingKill, setConfirmingKill] = useState(false);

  const protocol = classifyRequestProtocol(request);
  const timing = buildRequestTimingWaterfall(request);
  const parsedHeaders = parseRequestHeaders(request.requestHeader);
  const duration = normalizeDurationMs(request.startDate, request.completedDate);
  const setupDuration = normalizeDurationMs(request.startDate, request.setupCompletedDate);
  const killable = isKillable(request);

  const copy = async (kind: "url" | "headers" | "raw", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState(kind);
    } catch {
      setCopyState("error");
    }
  };

  const killMutation = useMutation({
    mutationFn: () => client.killRequest(request.id),
    onSuccess: () => {
      toast.success("连接已终止");
      setConfirmingKill(false);
      onKilled?.(request.id);
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "终止连接失败");
      setConfirmingKill(false);
    },
  });

  return (
    <div className="space-y-4">
      <div className="rounded-[14px] bg-surface-tertiary/55 p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <ProtocolBadge app={protocol.app} />
          <Badge variant={statusTone(request.status)}>{statusLabel(request.status)}</Badge>
          <span className="ml-auto font-mono text-xs tabular-nums text-text-secondary">{formatDuration(duration)}</span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <MiniInfo label="出口" value={request.policyName || "—"} />
          <MiniInfo label="来源" value={requestSourceAddress(request)} mono />
        </div>
      </div>

      <SegmentedControl<InspectorTab>
        value={tab}
        onChange={setTab}
        label="请求详情分区"
        className="w-full"
        options={[
          { value: "overview", label: "概览", icon: <Layers className="h-3.5 w-3.5" /> },
          { value: "request", label: "请求", icon: <FileText className="h-3.5 w-3.5" /> },
          { value: "timing", label: "计时", icon: <Timer className="h-3.5 w-3.5" /> },
        ]}
      />

      <div className="space-y-4">
        {tab === "overview" && <OverviewTab request={request} protocol={protocol} duration={duration} />}
        {tab === "request" && <RequestTab request={request} protocol={protocol} parsedHeaders={parsedHeaders} showRaw={showRawHeaders} onToggleRaw={() => setShowRawHeaders((v) => !v)} copyState={copyState} onCopy={copy} />}
        {tab === "timing" && <TimingTab request={request} timing={timing} duration={duration} setupDuration={setupDuration} />}
      </div>

      {killable && (
        <div className="border-t border-danger/20 pt-4">
          <div className="mb-2 flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-danger" />
            <span className="text-xs font-semibold text-text-primary">活动请求控制</span>
          </div>
          {confirmingKill ? (
            <div className="flex items-center justify-between gap-3 rounded-[12px] bg-danger/5 px-3 py-2.5">
              <span className="text-xs text-text-secondary">确认终止该连接？</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setConfirmingKill(false)} disabled={killMutation.isPending}>取消</Button>
                <Button size="sm" variant="destructive" onClick={() => killMutation.mutate()} disabled={killMutation.isPending}>
                  {killMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  确认终止
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="destructive" onClick={() => setConfirmingKill(true)}>
              <Zap className="h-3.5 w-3.5" />
              终止连接
            </Button>
          )}
        </div>
      )}

      <p className="min-h-4 text-xs text-danger" aria-live="polite">{copyState === "error" ? "复制失败，请检查浏览器剪贴板权限。" : ""}</p>
    </div>
  );
}

function MiniInfo({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-text-tertiary">{label}</p>
      <p className={`mt-0.5 truncate text-[13px] text-text-primary ${mono ? "font-mono text-xs" : ""}`}>{value}</p>
    </div>
  );
}

function OverviewTab({
  request,
  protocol,
  duration,
}: {
  request: RequestItem;
  protocol: ReturnType<typeof classifyRequestProtocol>;
  duration: number | undefined;
}) {
  const processLabel = request.processPath
    ? request.pid > 0
      ? `${request.processPath} (PID ${request.pid})`
      : request.processPath
    : "—";
  return (
    <>
      <Section title="连接信息">
        <Row label="请求" value={"#" + String(request.id)} mono />
        <Row label="时间" value={formatMsTimestamp(normalizeEpoch(request.startDate) ?? NaN)} />
        {protocol.transport && <Row label="传输" value={protocol.transport} mono />}
        <Row label="来源" value={requestSourceAddress(request)} mono />
        <Row label="本机" value={request.localAddress || "—"} mono />
        <Row label="目标" value={requestTargetAddress(request)} mono />
        <Row label="出口" value={request.policyName || "—"} />
        <Row label="规则" value={request.rule || "—"} mono />
        <Row label="进程" value={processLabel} mono />
      </Section>
      <Section title="流量">
        <Row label="↓ 下载" value={formatBytes(request.inBytes ?? 0)} mono />
        <Row label="↑ 上传" value={formatBytes(request.outBytes ?? 0)} mono />
        <Row label="峰值下载" value={formatRate(request.inMaxSpeed ?? 0)} mono />
        <Row label="峰值上传" value={formatRate(request.outMaxSpeed ?? 0)} mono />
        <Row label="当前下载速率" value={formatRate(request.inCurrentSpeed ?? 0)} mono />
        <Row label="当前上传速率" value={formatRate(request.outCurrentSpeed ?? 0)} mono />
      </Section>
      {duration === undefined && <p className="text-xs text-text-tertiary">此请求尚未完成，耗时将在完成后显示。</p>}
    </>
  );
}

function RequestTab({
  request,
  protocol,
  parsedHeaders,
  showRaw,
  onToggleRaw,
  copyState,
  onCopy,
}: {
  request: RequestItem;
  protocol: ReturnType<typeof classifyRequestProtocol>;
  parsedHeaders: ReturnType<typeof parseRequestHeaders>;
  showRaw: boolean;
  onToggleRaw: () => void;
  copyState: "url" | "headers" | "raw" | "error" | null;
  onCopy: (kind: "url" | "headers" | "raw", value: string) => void;
}) {
  const httpLike = HTTP_LIKE_PROTOCOLS.has(protocol.app);
  const hasHeader = Boolean(request.requestHeader);
  return (
    <>
      <Section title="URL">
        <CopyRow label="URL" value={request.URL} copied={copyState === "url"} onCopy={() => onCopy("url", request.URL)} />
      </Section>
      <Section title="请求头">
        {httpLike && hasHeader ? (
          <div className="space-y-3">
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={onToggleRaw}>{showRaw ? "解析视图" : "原始请求头"}</Button>
              <Button size="sm" variant="secondary" onClick={() => onCopy("headers", request.requestHeader ?? "")}>
                {copyState === "headers" || copyState === "raw" ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
                {copyState === "headers" || copyState === "raw" ? "已复制" : "复制全部"}
              </Button>
            </div>
            {showRaw ? (
              <pre className="max-h-72 overflow-auto rounded-[12px] bg-surface-tertiary/55 p-3 font-mono text-xs leading-relaxed text-text-secondary">{request.requestHeader}</pre>
            ) : parsedHeaders.headers.length > 0 ? (
              <dl className="space-y-1.5">
                {parsedHeaders.requestLine && <div className="rounded-[10px] bg-elevated/70 px-2.5 py-1.5 font-mono text-xs text-text-primary">{parsedHeaders.requestLine}</div>}
                {parsedHeaders.headers.map((header, index) => (
                  <div key={header.name + "-" + index} className="grid grid-cols-[minmax(0,8rem)_1fr] gap-2 px-2.5 py-1">
                    <span className="truncate font-mono text-xs text-text-secondary">{header.name}</span>
                    <span className="min-w-0 break-all font-mono text-xs text-text-primary">{header.value}</span>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-xs text-text-tertiary">请求头为空。</p>
            )}
          </div>
        ) : (
          <div className="rounded-[12px] border border-dashed border-border bg-elevated/35 px-3 py-4 text-center">
            <p className="text-xs font-medium text-text-secondary">此连接不是 HTTP 请求</p>
            <p className="mt-0.5 text-xs text-text-tertiary">无可用 HTTP Header</p>
          </div>
        )}
      </Section>
      <NotesSection notes={request.notes} />
    </>
  );
}

function TimingTab({
  request,
  timing,
  duration,
  setupDuration,
}: {
  request: RequestItem;
  timing: ReturnType<typeof buildRequestTimingWaterfall>;
  duration: number | undefined;
  setupDuration: number | undefined;
}) {
  return (
    <>
      <Section title="计时总览">
        <Row label="总耗时" value={formatDuration(duration)} mono />
        <Row label="连接建立" value={formatDuration(setupDuration)} mono />
        {request.timingRecords && request.timingRecords.length > 0 && <Row label="阶段数" value={String(request.timingRecords.length)} mono />}
      </Section>
      <Section title="阶段耗时">
        {timing.phases.length > 0 ? (
          <div className="space-y-2.5" aria-label="请求连接阶段瀑布图">
            {timing.phases.map((phase, index) => (
              <div key={phase.name + "-" + index} className="grid grid-cols-[7rem_1fr_4rem] items-center gap-2">
                <span className="truncate text-xs text-text-secondary" title={phase.name}>{phase.name}</span>
                <div className="relative h-2.5 overflow-hidden rounded-pill bg-elevated" aria-hidden="true">
                  <span className="absolute h-full rounded-pill bg-accent" style={{ left: phase.offsetPercent + "%", width: Math.min(phase.widthPercent, 100 - phase.offsetPercent) + "%" }} />
                </div>
                <span className="text-right font-mono text-xs tabular-nums text-text-primary">{formatDuration(phase.durationMs)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-tertiary">此请求没有可用的连接阶段数据。实际有什么阶段就展示什么，不会虚构。</p>
        )}
      </Section>
    </>
  );
}

const NOTE_VARIANTS: Record<string, "success" | "warning" | "danger" | "muted" | "info" | "purple"> = {
  Rule: "purple",
  DNS: "warning",
  MITM: "info",
  Script: "info",
  Rewrite: "info",
  Proxy: "success",
  QUIC: "info",
  STUN: "warning",
  HTTP: "success",
};

function NotesSection({ notes }: { notes?: string[] }) {
  if (!notes || notes.length === 0) {
    return <Section title="处理记录"><p className="text-xs text-text-tertiary">无处理记录（notes 为空）。</p></Section>;
  }
  return (
    <Section title="处理记录">
      <ul className="space-y-1.5">
        {notes.map((note, index) => {
          const { tag, text } = noteTag(note);
          const variant = (tag ? NOTE_VARIANTS[tag] : undefined) ?? "muted";
          return (
            <li key={index} className="flex items-start gap-2">
              {tag ? <Badge variant={variant}>{tag}</Badge> : null}
              <span className="min-w-0 break-words text-xs text-text-secondary">{text}</span>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function CopyRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="shrink-0 text-xs text-text-secondary">{label}</span>
      <span className="min-w-0 flex-1 break-all text-right font-mono text-xs text-text-primary">{value}</span>
      <Button size="icon" variant="ghost" className="touch-target h-7 w-7 shrink-0" aria-label="复制 URL" onClick={onCopy}>
        {copied ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border/50 pb-4 last:border-b-0 last:pb-0">
      <h3 className="mb-2.5 text-[13px] font-semibold text-text-primary">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-0.5">
      <span className="shrink-0 text-xs text-text-secondary">{label}</span>
      <span className={"min-w-0 break-all text-right text-[13px] text-text-primary " + (mono ? "font-mono text-xs" : "")}>{value}</span>
    </div>
  );
}
