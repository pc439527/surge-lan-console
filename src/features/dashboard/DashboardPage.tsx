import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { TrafficChart } from "@/features/traffic/TrafficChart";
import { formatTime, formatEventTime } from "@/lib/format";
import { useSurgeClientState } from "@/app/surge-client-context";
import { MetricCards } from "./MetricCards";
import {
  useActiveRequestsQuery,
  useEventsQuery,
  usePolicyGroupsQuery,
  useRecentRequestsQuery,
  useTrafficQuery,
} from "./dashboard-queries";
import { OutboundModeControl } from "./OutboundModeControl";
import type { DisplayEvent } from "./dashboard-queries";

function statusColor(code: string | undefined): "success" | "warning" | "danger" | "muted" {
  if (code === "Completed") return "success";
  if (code === "Active") return "warning";
  return "muted";
}

function statusText(code: string | undefined): string {
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
  const { client, missingKey } = useSurgeClientState();
  const traffic = useTrafficQuery();
  const active = useActiveRequestsQuery();
  const recent = useRecentRequestsQuery();
  const events = useEventsQuery();
  const groups = usePolicyGroupsQuery();

  // Rolling window for the chart — reuse cached snapshots across re-renders
  const [trail, setTrail] = useState<{ time: number; upload: number; download: number }[]>([]);
  const latestTraffic = traffic.data;
  useMemo(() => {
    if (!latestTraffic) return;
    setTrail((prev) => {
      const next = [
        ...prev,
        { time: Date.now(), upload: latestTraffic.uploadRate, download: latestTraffic.downloadRate },
      ].slice(-120);
      return next;
    });
  }, [latestTraffic]);

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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold text-text-primary">Dashboard</h1>
          <p className="mt-0.5 text-sm text-text-secondary">当前 Surge 实例实时概览</p>
        </div>
        <OutboundModeControl />
      </header>

      <MetricCards
        data={{
          uploadRate: traffic.data?.uploadRate ?? 0,
          downloadRate: traffic.data?.downloadRate ?? 0,
          activeRequests: active.data?.length ?? 0,
          totalTraffic:
            (traffic.data?.totalUpload ?? 0) + (traffic.data?.totalDownload ?? 0),
          loading,
        }}
      />

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>流量</CardTitle>
            <span className="text-xs text-text-tertiary">5 分钟 · 1 秒采样</span>
          </CardHeader>
          <CardContent>
            {traffic.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <TrafficChart series={trail} />
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>策略组</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {groups.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              groups.data?.map((g) => (
                <div key={g.name} className="flex items-center justify-between rounded-sm border border-border bg-elevated/50 px-3 py-2.5">
                  <span className="text-sm text-text-primary">{g.name}</span>
                  <Badge>{g.policies[0] ?? "—"}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
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

        <Card>
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

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}