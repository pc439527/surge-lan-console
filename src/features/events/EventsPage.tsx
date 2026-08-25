import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricStrip } from "@/components/ui/MetricStrip";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton } from "@/components/ui/Skeleton";
import { useSurgeClientState } from "@/app/surge-client-context";
import { NoClientNotice } from "@/features/shared/NoClientNotice";
import { DataEmpty, ErrorStateView } from "@/components/data-state";
import { formatEventTime } from "@/lib/format";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useEventsQuery, type DisplayEvent } from "@/features/shared/queries";
import { coreApi, type ErrorTrendPoint, type HealthAnalyticsRange } from "@/lib/core-api";
import { cn } from "@/lib/cn";

type Filter = "all" | "info" | "warn" | "error";

function variant(level: string): "default" | "warning" | "danger" {
  if (level === "error") return "danger";
  if (level === "warn") return "warning";
  return "default";
}

export function EventsPage() {
  const { client, connectionId } = useSurgeClientState();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [historyRange, setHistoryRange] = useState<HealthAnalyticsRange>("24h");
  const searchRef = useRef<HTMLInputElement>(null);

  useKeyboardShortcuts({ "/": () => searchRef.current?.focus() });

  const eventsQuery = useEventsQuery();
  const errorHistory = useQuery({
    queryKey: ["core", "analytics", "errors", connectionId, historyRange],
    queryFn: () => coreApi.getErrorAnalytics(connectionId!, historyRange),
    enabled: !!client && !!connectionId,
    staleTime: 60_000,
  });
  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e: DisplayEvent) => {
      if (filter !== "all" && e.level !== filter) return false;
      if (q && !e.message.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [events, filter, search]);

  const counts = useMemo(() => ({
    error: events.filter((event) => event.level === "error").length,
    warn: events.filter((event) => event.level === "warn").length,
    info: events.filter((event) => event.level === "info").length,
  }), [events]);

  const historyTotals = useMemo(() => {
    const points = errorHistory.data?.points ?? [];
    return points.reduce((total, point) => ({
      warnings: total.warnings + point.surgeWarnings,
      errors: total.errors + point.surgeErrors,
      jobs: total.jobs + point.jobFailures,
      total: total.total + point.total,
    }), { warnings: 0, errors: 0, jobs: 0, total: 0 });
  }, [errorHistory.data]);

  if (!client) return <NoClientNotice page="事件" />;

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        title="事件"
        description="查看 Surge 实时事件，并结合 Local Core 历史采样分析警告、错误与后台任务失败趋势。"
        actions={(
          <Button variant="secondary" size="sm" onClick={() => void Promise.all([eventsQuery.refetch(), errorHistory.refetch()])} disabled={eventsQuery.isFetching || errorHistory.isFetching}>
            <RefreshCw className={cn("h-3.5 w-3.5", (eventsQuery.isFetching || errorHistory.isFetching) && "animate-spin")} />
            刷新
          </Button>
        )}
      />

      <MetricStrip
        items={[
          { label: "错误", value: counts.error, detail: "当前 Surge Event", tone: counts.error > 0 ? "danger" : "success" },
          { label: "警告", value: counts.warn, detail: "当前 Surge Event", tone: counts.warn > 0 ? "warning" : "muted" },
          { label: "历史异常", value: historyTotals.total, detail: historyRange === "24h" ? "过去 24 小时" : "过去 7 天", tone: historyTotals.total > 0 ? "warning" : "success" },
          { label: "最新事件", value: events[0] ? formatEventTime(events[0].time) : "—", detail: `${events.length} 条实时事件`, tone: "muted" },
        ]}
      />

      <Card className="overflow-hidden">
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Error Trend</CardTitle>
            <p className="mt-1 text-xs text-text-tertiary">当前连接：Surge Warning / Error + Scheduler Failure；Bark 发送失败因缺少 connection_id，仅作为全局指标单独展示。</p>
          </div>
          <SegmentedControl<HealthAnalyticsRange>
            label="历史范围"
            options={[{ value: "24h", label: "24h" }, { value: "7d", label: "7d" }]}
            value={historyRange}
            onChange={setHistoryRange}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          {errorHistory.isLoading ? (
            <><Skeleton className="h-16 w-full" /><Skeleton className="h-36 w-full" /></>
          ) : errorHistory.isError ? (
            <ErrorStateView error={errorHistory.error} api="/api/analytics/errors" compact onRetry={() => errorHistory.refetch()} />
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-4">
                <TrendMetric label="Surge Warning" value={historyTotals.warnings} tone="warning" />
                <TrendMetric label="Surge Error" value={historyTotals.errors} tone="danger" />
                <TrendMetric label="Job Failure" value={historyTotals.jobs} tone="danger" />
                <TrendMetric label="Bark Failure · 全局" value={errorHistory.data?.notificationFailuresGlobal ?? 0} tone="muted" />
              </div>
              <ErrorTrendChart points={errorHistory.data?.points ?? []} />
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl<Filter>
          label="事件级别"
          options={[
            { value: "all", label: `全部 ${events.length}` },
            { value: "error", label: `错误 ${counts.error}` },
            { value: "warn", label: `警告 ${counts.warn}` },
            { value: "info", label: `信息 ${counts.info}` },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <Input ref={searchRef} className="pl-9" placeholder="搜索事件…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between gap-3 pb-2">
          <div>
            <CardTitle>事件流</CardTitle>
            <p className="mt-1 text-xs text-text-tertiary">实时读取 Surge /v1/events；历史趋势由 Core Collector 持久化，不依赖页面常驻。</p>
          </div>
          <span className="text-xs tabular-nums text-text-tertiary">{filtered.length} 条</span>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-1 sm:px-4">
          {eventsQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : eventsQuery.isError ? (
            <ErrorStateView error={eventsQuery.error} api="/v1/events" compact onRetry={() => eventsQuery.refetch()} />
          ) : events.length === 0 ? (
            <DataEmpty title="暂无事件" description="Surge 当前没有返回系统事件。" compact />
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-tertiary">没有匹配的事件。</p>
          ) : (
            <div className="divide-y divide-border/45">
              {filtered.map((evt: DisplayEvent) => (
                <div
                  key={evt.id}
                  className={cn(
                    "grid grid-cols-[4.75rem_auto_minmax(0,1fr)] items-start gap-3 rounded-[12px] px-2.5 py-2.5 transition-colors duration-hover hover:bg-elevated/55 sm:grid-cols-[5.25rem_auto_minmax(0,1fr)] sm:px-3",
                    evt.level === "error" && "bg-danger/[0.035]",
                    evt.level === "warn" && "bg-warning/[0.025]",
                  )}
                >
                  <span className="pt-0.5 font-mono text-xs tabular-nums text-text-tertiary">{formatEventTime(evt.time)}</span>
                  <Badge variant={variant(evt.level)} className="mt-0.5 uppercase">{evt.level}</Badge>
                  <span className={cn("min-w-0 break-words text-[13px] leading-5 text-text-primary", evt.level === "error" && "font-medium")}>{evt.message}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TrendMetric({ label, value, tone }: { label: string; value: number; tone: "warning" | "danger" | "muted" }) {
  const valueClass = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-text-secondary";
  return <div className="rounded-[12px] bg-surface-tertiary/45 px-3 py-2.5"><p className="text-[10px] uppercase tracking-wide text-text-tertiary">{label}</p><p className={cn("mt-1 font-mono text-lg font-semibold tabular-nums", valueClass)}>{value}</p></div>;
}

function ErrorTrendChart({ points }: { points: ErrorTrendPoint[] }) {
  const max = Math.max(1, ...points.map((point) => point.total));
  const hasData = points.some((point) => point.total > 0);
  if (!points.length) return <DataEmpty title="暂无历史异常数据" description="等待 Event Collector 与 Scheduler 产生历史样本。" compact />;

  return (
    <div>
      <div className="flex h-36 items-end gap-1 rounded-[14px] border border-border/55 bg-surface-tertiary/20 px-3 pb-3 pt-4" aria-label="异常历史趋势">
        {points.map((point) => (
          <div key={point.bucketStart} className="flex min-w-0 flex-1 flex-col justify-end" title={`${new Date(point.bucketStart).toLocaleString()} · Warning ${point.surgeWarnings} · Error ${point.surgeErrors} · Job ${point.jobFailures}`}>
            <div className="flex min-h-[2px] w-full flex-col justify-end overflow-hidden rounded-[3px] bg-border/35" style={{ height: `${Math.max(2, (point.total / max) * 100)}%` }}>
              {point.jobFailures > 0 && <div className="bg-danger/55" style={{ flex: point.jobFailures }} />}
              {point.surgeErrors > 0 && <div className="bg-danger" style={{ flex: point.surgeErrors }} />}
              {point.surgeWarnings > 0 && <div className="bg-warning" style={{ flex: point.surgeWarnings }} />}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-text-tertiary">
        <span>{new Date(points[0]?.bucketStart ?? Date.now()).toLocaleString()}</span>
        <span>{hasData ? `峰值 ${max} 次 / bucket` : "区间内无异常"}</span>
        <span>{new Date(points.at(-1)?.bucketStart ?? Date.now()).toLocaleString()}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-text-tertiary">
        <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-warning" />Surge Warning</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-danger" />Surge Error</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-danger/55" />Scheduler Failure</span>
      </div>
    </div>
  );
}
