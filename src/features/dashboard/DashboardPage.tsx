import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Activity, ArrowRight, CheckCircle2, Globe, Radar, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { TrafficChart } from "@/features/traffic/TrafficChart";
import { formatTime, formatEventTime, formatUptime, formatBytes } from "@/lib/format";
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
import { surgeKeys } from "@/lib/surge-keys";
import { OutboundModeControl } from "./OutboundModeControl";
import type { DisplayEvent } from "./dashboard-queries";

/**
 * Dashboard (OPTIMIZATION_PLAN Task 02) — an overview, not full management.
 *  - KPI row: Upload / Download / Connections / Session Traffic
 *  - Row 1: Realtime Traffic (5 min) + Surge Status
 *  - Row 2: Important Policy Groups (≤8, prioritized) + System Status
 *  - Row 3: Recent Requests + Recent Events
 * Grids use items-start so a tall card (e.g. many policy groups) never
 * stretches its row partner — the traffic chart stays 256px.
 */

/** Prioritized groups shown on the dashboard (fall back to first-available). */
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

const TRAIL_MAX = 300; // 5 分钟 · 1 秒采样

export function DashboardPage() {
  const { client, missingKey, connectionId, connection, demoMode } = useSurgeClientState();
  const traffic = useTrafficQuery();
  const active = useActiveRequestsQuery();
  const recent = useRecentRequestsQuery();
  const events = useEventsQuery();
  const groups = usePolicyGroupsQuery();
  const features = useFeaturesQuery();
  // v0.3.0 Capability Engine：平台判定 + API 延迟（/v1/outbound 探测）。
  const capability = useCapabilitiesQuery();

  // T14: the dashboard only shows ≤8 groups — compute them first so the
  // selections query never fires N requests for groups the page won't render.
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

  // T15: DNS availability comes from /v1/dns — the Feature API has no DNS flag.
  const dnsQuery = useQuery({
    queryKey: surgeKeys.dns(connectionId),
    queryFn: ({ signal }) => client!.getDnsCache(signal),
    enabled: !!client && !missingKey,
    staleTime: 60_000,
    refetchInterval: false,
  });

  // Rolling window for the chart (Fix 06): effects only, no setState in useMemo.
  const [trail, setTrail] = useState<{ time: number; upload: number; download: number }[]>([]);
  const latestTraffic = traffic.data;

  // Switching Surge instances must never mix charts (Fix 05).
  useEffect(() => {
    setTrail([]);
  }, [connectionId]);

  useEffect(() => {
    if (!latestTraffic) return;
    setTrail((prev) => [
      ...prev,
      { time: Date.now(), upload: latestTraffic.uploadRate, download: latestTraffic.downloadRate },
    ].slice(-TRAIL_MAX));
  }, [latestTraffic, connectionId]);

  if (!client) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-[26px] font-semibold text-text-primary">Dashboard</h1>
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

  // System status: uptime from traffic.startTime (normalized, Task 07).
  const uptimeMs = traffic.data?.startTime
    ? Date.now() - (normalizeEpoch(traffic.data.startTime) ?? Date.now())
    : undefined;
  const apiHealthy = traffic.isSuccess || groups.isSuccess;
  const healthItems = [
    { label: "API", healthy: apiHealthy },
    { label: "DNS", healthy: dnsQuery.isSuccess },
    { label: "Proxy", healthy: outboundModeQuery.isSuccess },
    { label: "Nodes", healthy: groups.isSuccess && (groups.data?.length ?? 0) > 0 },
  ];
  const healthyCount = healthItems.filter((item) => item.healthy).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold text-text-primary">Dashboard</h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            {connection ? `${connection.name} · ${connection.host}:${connection.port}` : "当前 Surge 实例实时概览"}
          </p>
        </div>
        <OutboundModeControl />
      </header>

      {/* Device and health share one aligned overview row. */}
      <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(360px,1fr)]">
      <Card className="flex items-center p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-accent/12 text-accent">
              <Activity className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text-primary">
                {connection ? connection.name : demoMode ? "演示模式" : "未连接"}
              </p>
              <p className="font-mono text-xs text-text-tertiary">
                {connection
                  ? `${connection.protocol}://${connection.host}:${connection.port}`
                  : demoMode
                    ? "Mock Surge 数据"
                    : "请先添加连接"}
              </p>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Badge variant="info">
              {capability.data ? PLATFORM_LABEL[capability.data.platform] : "平台探测中…"}
              {capability.data && !capability.data.platformDetected && (
                <span className="text-[10px] text-text-tertiary">· 手动指定</span>
              )}
            </Badge>
            <Badge variant={apiHealthy ? "success" : "danger"}>
              {apiHealthy ? "API Healthy" : "API Unavailable"}
            </Badge>
            {demoMode && <Badge variant="warning">DEMO</Badge>}
          </div>
        </div>
      </Card>

      <Card className="flex items-center border-success/20 bg-surface-primary p-4">
        <div className="flex w-full flex-wrap items-center gap-4">
          <div className="flex min-w-[190px] flex-1 items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-pill bg-success/12 text-success"><CheckCircle2 className="h-5 w-5" /></span>
            <div><p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">Surge Health</p><p className="text-lg font-semibold text-text-primary">{healthyCount === healthItems.length ? "运行正常" : healthyCount >= 2 ? "部分服务异常" : "需要检查"}</p></div>
          </div>
          <div className="flex flex-wrap gap-2">{healthItems.map((item) => <Badge key={item.label} variant={item.healthy ? "success" : "danger"}>{item.label} · {item.healthy ? "OK" : "异常"}</Badge>)}</div>
        </div>
      </Card>
      </div>

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

      <Card>
        <CardHeader className="flex-row items-center justify-between"><div><CardTitle>节点质量</CardTitle><p className="mt-1 text-xs text-text-tertiary">查看节点排名、延迟和可用性</p></div><Button variant="secondary" size="sm" asChild><Link to="/node-quality"><Radar className="h-3.5 w-3.5" />打开节点中心</Link></Button></CardHeader>
      </Card>

      {/* Row 1 — Traffic + Surge Status（12 列网格：图 8 / 状态 4） */}
      <div className="dashboard-primary-grid grid grid-cols-1 items-start gap-3 sm:gap-4 xl:grid-cols-12">
        <Card className="min-w-0 xl:col-span-8">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>实时流量</CardTitle>
            <span className="text-xs text-text-tertiary">
              最近 5 分钟 · 1 秒采样 · 会话流量 
              {formatBytes((traffic.data?.totalUpload ?? 0) + (traffic.data?.totalDownload ?? 0))}
            </span>
          </CardHeader>
          <CardContent>
            {traffic.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : traffic.isError ? (
              <WidgetError label="流量不可用" />
            ) : (
              <TrafficChart series={trail} />
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 xl:col-span-4">
          <CardHeader>
            <CardTitle>Surge 状态</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <StatusRow label="模式" value={outboundModeQuery.data?.toUpperCase() ?? "—"} mono />
            <StatusRow
              label="DNS API"
              value={dnsQuery.isSuccess ? "Available" : dnsQuery.isError ? "Unavailable" : "—"}
              tone={dnsQuery.isSuccess ? "success" : "muted"}
            />
            {featureRows.map((row) => {
              const enabled = features.data?.[row.key];
              return (
                <StatusRow
                  key={row.key}
                  label={row.label}
                  value={enabled === undefined ? "—" : enabled ? "Enabled" : "Disabled"}
                  tone={enabled === undefined ? "muted" : enabled ? "success" : "muted"}
                />
              );
            })}
            <div className="pt-1 text-[11px] text-text-tertiary">
              功能开关请到「设置」中调整。
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2 — Policy Summary + System Status（12 列网格：策略 8 / 系统 4） */}
      <div className="dashboard-primary-grid grid grid-cols-1 items-start gap-3 sm:gap-4 xl:grid-cols-12">
        <Card className="min-w-0 xl:col-span-8">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>重要策略组</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/policies" className="text-text-secondary">
                查看全部 <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {groups.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : groups.isError ? (
              <WidgetError label="策略组不可用" />
            ) : dashboardGroups.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-tertiary">没有返回策略组。</p>
            ) : (
              dashboardGroups.map((g) => (
                <div key={g.name} className="flex items-center justify-between rounded-sm border border-border bg-elevated/50 px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <Globe className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
                    <span className="truncate text-sm text-text-primary">{g.name}</span>
                  </div>
                  <Badge>{selections.data?.[g.name] ?? "—"}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 xl:col-span-4">
          <CardHeader>
            <CardTitle>系统状态</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <StatusRow
              label="平台"
              value={capability.data ? PLATFORM_LABEL[capability.data.platform] : "探测中…"}
              tone={capability.data && capability.data.platform !== "unknown" ? "success" : "muted"}
            />
            <StatusRow label="API" value={apiHealthy ? "Healthy" : "Unavailable"} tone={apiHealthy ? "success" : "danger"} />
            <StatusRow label="连接" value={connection ? `${connection.host}:${connection.port}` : "—"} mono />
            <StatusRow label="Version" value={`v${BUILD_INFO.version}`} mono />
            <StatusRow label="Commit" value={BUILD_INFO.commit} mono />
            <StatusRow label="Uptime" value={uptimeMs !== undefined ? formatUptime(uptimeMs) : "—"} />
            <div className="pt-1 text-[11px] text-text-tertiary">
              版本与提交信息在构建时写入，用于核对部署与 GitHub main 是否一致。
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3 — Requests + Events */}
      <div className="dashboard-secondary-grid grid grid-cols-1 items-start gap-3 sm:gap-4 xl:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>最近请求</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/requests" className="text-text-secondary">
                查看全部 <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-1.5">
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
                <div key={req.id} className="flex items-center gap-3 rounded-sm px-2 py-1.5 hover:bg-elevated/60">
                  <span className="w-12 shrink-0 font-mono text-xs text-text-tertiary">{formatTime(new Date(req.startDate).toISOString())}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">{hostOf(req.URL)}</span>
                  <Badge variant={statusColor(req.status)}>{statusText(req.status)}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>最近事件</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/events" className="text-text-secondary">
                查看全部 <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-1.5">
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
                <div key={evt.id} className="flex items-start gap-3 rounded-sm px-2 py-1.5 hover:bg-elevated/60">
                  <span className="w-16 shrink-0 font-mono text-xs text-text-tertiary">{formatEventTime(evt.time)}</span>
                  <Badge variant={eventVariant(evt.level)} className="mt-0.5 uppercase">
                    {evt.level}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">{evt.message}</span>
                </div>
              ))
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

function StatusRow({ label, value, tone, mono }: { label: string; value: string; tone?: "success" | "danger" | "muted"; mono?: boolean }) {
  const badge = tone === "success" ? <Badge variant="success">{value}</Badge>
    : tone === "danger" ? <Badge variant="danger">{value}</Badge>
    : <span className={`text-[13px] text-text-secondary ${mono ? "font-mono text-xs" : ""}`}>{value}</span>;
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] text-text-secondary">{label}</span>
      {badge}
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
