import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Activity, ArrowRight, CheckCircle2, Globe, Radar, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { TrafficChart } from "@/features/traffic/TrafficChart";
import { formatTime, formatEventTime, formatUptime } from "@/lib/format";
import { BUILD_INFO } from "@/lib/version";
import { normalizeEpoch } from "@/api/normalize";
import { useSurgeClientState } from "@/app/surge-client-context";
import { PLATFORM_LABEL } from "@/api/capability";
import { useCapabilitiesQuery } from "@/features/shared/capability";
import { MetricCards } from "./MetricCards";
import {
  useActiveRequestsQuery,
  useEventsQuery,
  usePolicyGroupsQuery,
  useRecentRequestsQuery,
  useTrafficQuery,
} from "./dashboard-queries";
import { useFeaturesQuery, useOutboundModeQuery } from "@/features/shared/queries";
import { useGroupSelectionsQuery } from "@/features/policies/policies-queries";
import { coreApi } from "@/lib/core-api";
import { OutboundModeControl } from "./OutboundModeControl";
import type { DisplayEvent } from "./dashboard-queries";
import { buildDashboardHealth, type DashboardHealthTone } from "./dashboard-health";

/**
 * Dashboard V2 — Apple HIG 2026 / macOS 27 inspired web-console layout.
 * The page intentionally avoids a wall of equal-weight cards:
 * hero status -> one metric strip -> primary traffic + status rail -> summaries.
 */
const PRIORITY_GROUPS = [
  "Proxy",
  "Telegram",
  "YouTube",
  "Netflix",
  "Spotify",
  "Apple",
  "GlobalMedia",
  "Intelligence",
];
const MAX_DASHBOARD_GROUPS = 8;

function statusColor(code: string | null | undefined): "success" | "warning" | "danger" | "muted" {
  if (code === "Completed") return "success";
  if (code === "Active") return "warning";
  return "muted";
}

function statusText(code: string | null | undefined): string {
  if (code === "Completed") return "已完成";
  if (code === "Active") return "活动中";
  return code ?? "—";
}

function eventVariant(level: string): "default" | "warning" | "danger" {
  if (level === "error") return "danger";
  if (level === "warn") return "warning";
  return "default";
}

export function DashboardPage() {
  const { client, missingKey, connectionId, connection, demoMode } = useSurgeClientState();
  const traffic = useTrafficQuery();
  const active = useActiveRequestsQuery();
  const recent = useRecentRequestsQuery();
  const events = useEventsQuery();
  const groups = usePolicyGroupsQuery();
  const features = useFeaturesQuery();
  const capability = useCapabilitiesQuery();

  const dashboardGroups = useMemo(() => {
    const all = groups.data ?? [];
    if (all.length === 0) return [];
    const byName = new Map(all.map((g) => [g.name, g]));
    const ordered: typeof all = [];
    for (const name of PRIORITY_GROUPS) {
      const g = byName.get(name);
      if (g) ordered.push(g);
    }
    for (const g of all) {
      if (!ordered.includes(g)) ordered.push(g);
    }
    return ordered.slice(0, MAX_DASHBOARD_GROUPS);
  }, [groups.data]);
  const dashboardGroupNames = useMemo(() => dashboardGroups.map((g) => g.name), [dashboardGroups]);
  const selections = useGroupSelectionsQuery(dashboardGroupNames);
  const outboundModeQuery = useOutboundModeQuery();

  const trafficHistory = useQuery({
    queryKey: ["core", "traffic-analytics", connectionId, "24h"],
    queryFn: () => coreApi.getTrafficAnalytics(connectionId!, "24h"),
    enabled: !!client && !!connectionId && !missingKey && !demoMode,
    staleTime: 4 * 60_000,
    refetchInterval: 5 * 60_000,
    retry: false,
  });

  const trafficHistorySeries = useMemo(
    () => (trafficHistory.data?.points ?? []).map((point) => ({
      time: new Date(point.bucketStart).getTime(),
      upload: point.avgUploadRate,
      download: point.avgDownloadRate,
    })),
    [trafficHistory.data],
  );

  if (!client) {
    return (
      <div className="space-y-6">
        <header>
          <p className="text-xs font-medium text-text-tertiary">Surge LAN Console</p>
          <h1 className="mt-1 text-[30px] font-semibold tracking-[-0.025em] text-text-primary">Surge 概览</h1>
        </header>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <Activity className="h-8 w-8 text-text-tertiary" />
            <p className="text-sm text-text-secondary">
              {missingKey
                ? "当前连接缺少 API 密钥 — 请到「连接」中填写。"
                : demoMode
                  ? "演示模式已启用 — 正在展示模拟 Surge 数据。"
                  : "没有活动连接。请添加并选择 Surge 实例，或启用演示模式。"}
            </p>
            <Button asChild>
              <Link to="/connections">打开连接</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const loading = traffic.isLoading || active.isLoading;
  const uptimeMs = traffic.data?.startTime
    ? Date.now() - (normalizeEpoch(traffic.data.startTime) ?? Date.now())
    : undefined;
  const dashboardHealth = buildDashboardHealth(capability.data);
  const healthItems = dashboardHealth.items;
  const apiItem = healthItems[0]!;
  const dnsItem = healthItems.find((item) => item.key === "dns")!;

  return (
    <div className="space-y-5 lg:space-y-6">
      <section className="dashboard-hero rounded-[28px] p-5 sm:p-6 lg:p-7">
        <div className="relative z-[1] flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium text-text-secondary">
              <span className={`h-2 w-2 rounded-pill ${healthDotClass(dashboardHealth.tone)}`} />
              实时控制台
            </div>
            <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.035em] text-text-primary sm:text-[34px]">Surge 概览</h1>
            <p className="mt-1.5 truncate text-sm text-text-secondary">
              {connection
                ? `${connection.name} · ${connection.protocol}://${connection.host}:${connection.port}`
                : demoMode
                  ? "演示模式 · Mock Surge 数据"
                  : "当前 Surge 实例实时概览"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <OutboundModeControl />
            <Button variant="secondary" size="md" asChild>
              <Link to="/node-quality">
                <Radar className="h-4 w-4" aria-hidden="true" />
                节点中心
              </Link>
            </Button>
          </div>
        </div>

        <div className="relative z-[1] mt-5 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
          <Badge variant="info">
            {capability.data ? PLATFORM_LABEL[capability.data.platform] : "平台探测中…"}
            {capability.data && !capability.data.platformDetected && <span className="text-[11px] text-text-tertiary"> · 手动指定</span>}
          </Badge>
          {healthItems.map((item) => (
            <Badge key={item.key} variant={item.tone}>
              {item.label} · {item.text}
            </Badge>
          ))}
          {demoMode && <Badge variant="warning">DEMO</Badge>}
        </div>
      </section>

      <MetricCards
        data={{
          uploadRate: traffic.data?.uploadRate ?? 0,
          downloadRate: traffic.data?.downloadRate ?? 0,
          activeRequests: active.data?.length ?? 0,
          totalTraffic: (traffic.data?.totalUpload ?? 0) + (traffic.data?.totalDownload ?? 0),
          uptime: uptimeMs !== undefined ? formatUptime(uptimeMs) : "—",
          loading,
        }}
      />

      <div className="dashboard-primary-grid grid grid-cols-1 items-start gap-4 xl:grid-cols-12">
        <Card className="min-w-0 overflow-hidden xl:col-span-8">
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>24 小时流量趋势</CardTitle>
              <p className="mt-1 text-xs text-text-tertiary">Core SQLite · 5 分钟聚合 · 每 5 分钟刷新</p>
            </div>
            <div className="rounded-pill border border-border/70 bg-surface-tertiary/70 px-3 py-1.5 text-xs text-text-secondary">
              5 分钟粒度
            </div>
          </CardHeader>
          <CardContent>
            {demoMode ? (
              <HistoricalTrafficNotice title="演示模式暂无历史流量" detail="历史曲线来自 Core SQLite，真实连接运行后会自动形成 24 小时趋势。" />
            ) : trafficHistory.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : trafficHistory.isError ? (
              <HistoricalTrafficNotice title="历史流量暂不可用" detail="无法读取 Core SQLite 的 24 小时聚合数据，请稍后重试。" />
            ) : trafficHistorySeries.length === 0 ? (
              <HistoricalTrafficNotice title="暂无 24 小时历史流量" detail="Metrics Collector 产生采样后，这里会按 5 分钟桶自动形成趋势曲线。" />
            ) : (
              <TrafficChart series={trafficHistorySeries} height="clamp(240px, 28vw, 320px)" />
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 xl:col-span-4">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <span className={`flex h-10 w-10 items-center justify-center rounded-pill ${healthIconClass(dashboardHealth.tone)}`}>
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-medium text-text-tertiary">运行状态</p>
                <CardTitle className="mt-0.5 text-[17px]">{dashboardHealth.label}</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <div className="mb-3 flex flex-wrap gap-1.5 border-b border-border/60 pb-3">
              {healthItems.map((item) => (
                <Badge key={item.key} variant={item.tone}>
                  {item.label} · {item.text}
                </Badge>
              ))}
            </div>
            <StatusRow label="出站模式" value={outboundModeQuery.data?.toUpperCase() ?? "—"} mono />
            <StatusRow
              label="平台"
              value={capability.data ? PLATFORM_LABEL[capability.data.platform] : "探测中…"}
              tone={capability.data && capability.data.platform !== "unknown" ? "success" : "muted"}
            />
            <StatusRow label="API" value={apiItem.text} tone={apiItem.tone} />
            <StatusRow label="DNS API" value={dnsItem.text} tone={dnsItem.tone} />
            {featureRows.map((row) => {
              const enabled = features.data?.[row.key];
              return (
                <StatusRow
                  key={row.key}
                  label={row.label}
                  value={enabled === undefined ? "—" : enabled ? "启用" : "关闭"}
                  tone={enabled === undefined ? "muted" : enabled ? "success" : "muted"}
                />
              );
            })}
            <div className="my-3 border-t border-border/60" />
            <StatusRow label="连接" value={connection ? `${connection.host}:${connection.port}` : "—"} mono />
            <StatusRow label="版本" value={`v${BUILD_INFO.version}`} mono />
            <StatusRow label="提交" value={BUILD_INFO.commit} mono />
            <StatusRow label="运行时长" value={uptimeMs !== undefined ? formatUptime(uptimeMs) : "—"} />
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>重要策略组</CardTitle>
            <p className="mt-1 text-xs text-text-tertiary">当前选路摘要 · 最多展示 8 个高优先级策略组</p>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/policies" className="text-text-secondary">
              查看全部 <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {groups.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : groups.isError ? (
            <WidgetError label="策略组不可用" />
          ) : dashboardGroups.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-tertiary">没有返回策略组。</p>
          ) : (
            <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
              {dashboardGroups.map((g) => (
                <div key={g.name} className="flex min-w-0 items-center justify-between gap-3 rounded-[14px] bg-surface-tertiary/65 px-3.5 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-surface-primary text-text-tertiary shadow-sm">
                      <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <span className="truncate text-[13px] font-medium text-text-primary">{g.name}</span>
                  </div>
                  <Badge>{selections.data?.[g.name] ?? "—"}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="dashboard-secondary-grid grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>最近请求</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/requests" className="text-text-secondary">
                查看全部 <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-0.5">
            {recent.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : recent.isError ? (
              <WidgetError label="请求不可用" />
            ) : recent.data?.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-tertiary">暂无请求。</p>
            ) : (
              recent.data?.slice(0, 6).map((req) => (
                <div key={req.id} className="flex items-center gap-3 border-b border-border/45 px-1 py-2.5 last:border-b-0 hover:bg-elevated/45">
                  <span className="w-12 shrink-0 font-mono text-xs text-text-tertiary">{formatTime(new Date(req.startDate).toISOString())}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">{hostOf(req.URL)}</span>
                  <Badge variant={statusColor(req.status)}>{statusText(req.status)}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>最近事件</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/events" className="text-text-secondary">
                查看全部 <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-0.5">
            {events.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : events.isError ? (
              <WidgetError label="事件不可用" />
            ) : events.data?.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-tertiary">暂无事件。</p>
            ) : (
              events.data?.slice(0, 5).map((evt: DisplayEvent) => (
                <div key={evt.id} className="flex items-start gap-3 border-b border-border/45 px-1 py-2.5 last:border-b-0 hover:bg-elevated/45">
                  <span className="w-16 shrink-0 font-mono text-xs text-text-tertiary">{formatEventTime(evt.time)}</span>
                  <Badge variant={eventVariant(evt.level)} className="mt-0.5 uppercase">
                    {evt.level}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">{evt.message}</span>
                </div>
              ))}
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const featureRows = [
  { key: "mitm" as const, label: "MitM" },
  { key: "rewrite" as const, label: "Rewrite" },
  { key: "scripting" as const, label: "Scripting" },
  { key: "capture" as const, label: "Capture" },
];

function StatusRow({ label, value, tone, mono }: { label: string; value: string; tone?: "success" | "warning" | "danger" | "muted"; mono?: boolean }) {
  const badge = tone === "success" ? <Badge variant="success">{value}</Badge>
    : tone === "warning" ? <Badge variant="warning">{value}</Badge>
    : tone === "danger" ? <Badge variant="danger">{value}</Badge>
    : <span className={`text-[13px] text-text-secondary ${mono ? "font-mono text-xs" : ""}`}>{value}</span>;
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] text-text-secondary">{label}</span>
      {badge}
    </div>
  );
}

function healthDotClass(tone: DashboardHealthTone): string {
  if (tone === "success") return "bg-success";
  if (tone === "warning") return "bg-warning";
  if (tone === "danger") return "bg-danger";
  return "bg-text-tertiary";
}

function healthIconClass(tone: DashboardHealthTone): string {
  if (tone === "success") return "bg-success/12 text-success";
  if (tone === "danger") return "bg-danger/12 text-danger";
  if (tone === "warning") return "bg-warning/12 text-warning";
  return "bg-surface text-text-tertiary";
}

function HistoricalTrafficNotice({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-2 px-4 text-center">
      <Activity className="h-6 w-6 text-text-tertiary" aria-hidden="true" />
      <p className="text-sm font-medium text-text-primary">{title}</p>
      <p className="max-w-md text-xs leading-5 text-text-tertiary">{detail}</p>
    </div>
  );
}

function WidgetError({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <ShieldCheck className="h-6 w-6 text-text-tertiary" />
      <p className="text-sm text-text-secondary">{label}</p>
      <p className="text-xs text-text-tertiary">API 返回异常 — 请到「设置 → API Diagnostics」查看。</p>
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
