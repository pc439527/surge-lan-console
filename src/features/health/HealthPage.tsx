import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, CircleDashed, CircleX, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { MetricStrip } from "@/components/ui/MetricStrip";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataEmpty, DataLoading, ErrorStateView } from "@/components/data-state";
import { NoClientNotice } from "@/features/shared/NoClientNotice";
import { useSurgeClientState } from "@/app/surge-client-context";
import { healthFromCapability, type HealthStatus } from "@/domain/health";
import { useCapabilitiesQuery } from "@/features/shared/capability";
import { coreApi, type ErrorTrendPoint, type HealthAnalyticsRange } from "@/lib/core-api";
import { cn } from "@/lib/cn";

const meta: Record<HealthStatus, { label: string; variant: "success" | "warning" | "danger" | "muted" }> = {
  healthy: { label: "正常", variant: "success" },
  warning: { label: "需检查", variant: "warning" },
  unavailable: { label: "不可用", variant: "danger" },
  na: { label: "N/A", variant: "muted" },
  unknown: { label: "未知", variant: "muted" },
};

function statusIcon(status: HealthStatus) {
  switch (status) {
    case "healthy":
      return { Icon: CheckCircle2, color: "text-success" as const };
    case "unavailable":
      return { Icon: CircleX, color: "text-danger" as const };
    case "na":
      return { Icon: CircleDashed, color: "text-text-tertiary" as const };
    default:
      return { Icon: CircleAlert, color: "text-warning" as const };
  }
}

export function HealthPage() {
  const { client, connection, connectionId, demoMode } = useSurgeClientState();
  const capability = useCapabilitiesQuery();
  const [errorRange, setErrorRange] = useState<HealthAnalyticsRange>("24h");
  const errors = useQuery({
    queryKey: ["core", "analytics", "errors", connectionId, errorRange],
    queryFn: () => coreApi.getErrorAnalytics(connectionId!, errorRange),
    enabled: !!connectionId && !demoMode,
    staleTime: 60_000,
  });
  const health = useMemo(
    () => (capability.data ? healthFromCapability(capability.data) : null),
    [capability.data],
  );

  if (!client) return <NoClientNotice page="Health Center" />;

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow="Health Center"
        title="健康中心"
        description={<>连接、网络与平台能力 · {connection?.name ?? (demoMode ? "演示模式" : "当前连接")}</>}
        actions={
          <Button variant="secondary" size="sm" onClick={() => void capability.refetch()} disabled={capability.isFetching}>
            <RefreshCw className={`h-4 w-4 ${capability.isFetching ? "animate-spin" : ""}`} />
            重新检查
          </Button>
        }
      />

      {capability.isPending ? (
        <DataLoading rows={5} />
      ) : capability.isError ? (
        <ErrorStateView error={capability.error} onRetry={() => void capability.refetch()} />
      ) : health ? (
        <HealthReport health={health} />
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-sm text-text-secondary">正在等待能力探测结果…</CardContent>
        </Card>
      )}

      {!demoMode && connectionId && (
        <ErrorTrendCard
          points={errors.data?.points ?? []}
          notificationFailuresGlobal={errors.data?.notificationFailuresGlobal ?? 0}
          range={errorRange}
          loading={errors.isLoading}
          error={errors.isError ? errors.error : null}
          onRangeChange={setErrorRange}
          onRetry={() => void errors.refetch()}
        />
      )}
    </div>
  );
}

function HealthReport({ health }: { health: ReturnType<typeof healthFromCapability> }) {
  const healthyCount = health.checks.filter((check) => check.status === "healthy").length;
  const unavailableCount = health.checks.filter((check) => check.status === "unavailable").length;
  const warningCount = health.checks.filter((check) => check.status === "warning").length;
  const measured = health.checks.filter((check) => check.latencyMs !== null);
  const slowest = measured.reduce<(typeof measured)[number] | null>(
    (current, check) => !current || (check.latencyMs ?? 0) > (current.latencyMs ?? 0) ? check : current,
    null,
  );

  return (
    <>
      <MetricStrip
        items={[
          {
            label: "整体状态",
            value: `${healthyCount} / ${health.checks.length}`,
            detail: warningCount + unavailableCount > 0 ? `${warningCount + unavailableCount} 项需关注` : "全部检查正常",
            tone: warningCount + unavailableCount > 0 ? "warning" : "success",
          },
          {
            label: "最慢端点",
            value: slowest?.latencyMs === null || !slowest ? "—" : `${Math.round(slowest.latencyMs)}ms`,
            detail: slowest?.label ?? "暂无延迟数据",
            tone: slowest?.latencyMs && slowest.latencyMs > 250 ? "warning" : "accent",
          },
          {
            label: "不可用",
            value: String(unavailableCount),
            detail: unavailableCount > 0 ? "端点暂时不可达" : "无不可用端点",
            tone: unavailableCount > 0 ? "danger" : "success",
          },
          {
            label: "检查时间",
            value: new Date(health.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            detail: "Capability Probe",
            tone: "muted",
          },
        ]}
      />

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>能力检查</CardTitle>
            <p className="mt-1 text-xs text-text-tertiary">状态与延迟分开表达：平台正常差异不会被误判为系统故障。</p>
          </div>
          <span className="shrink-0 text-xs text-text-tertiary">{health.checks.length} 项</span>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border/50">
            {health.checks.map((check) => {
              const item = meta[check.status];
              const { Icon, color } = statusIcon(check.status);
              const latencyColor = check.latencyMs === null
                ? "text-text-tertiary"
                : check.latencyMs > 250
                  ? "text-warning"
                  : "text-text-primary";

              return (
                <div
                  key={check.id}
                  className="grid gap-3 px-5 py-4 transition-colors duration-hover hover:bg-elevated/35 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-surface-tertiary/80">
                      <Icon className={`h-4 w-4 ${color}`} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-primary">{check.label}</p>
                      <p className="mt-0.5 truncate text-xs text-text-secondary">{check.detail}</p>
                    </div>
                  </div>
                  <span className={`font-mono text-[13px] font-medium tabular-nums ${latencyColor}`}>
                    {check.latencyMs === null ? "—" : `${Math.round(check.latencyMs)}ms`}
                  </span>
                  <Badge variant={item.variant}>{item.label}</Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-text-tertiary">
        来源：Capability Probe（实测端点 · 非虚构 /v1/health）· 检查时间：{new Date(health.checkedAt).toLocaleString()}
      </p>
    </>
  );
}

function ErrorTrendCard({
  points,
  notificationFailuresGlobal,
  range,
  loading,
  error,
  onRangeChange,
  onRetry,
}: {
  points: ErrorTrendPoint[];
  notificationFailuresGlobal: number;
  range: HealthAnalyticsRange;
  loading: boolean;
  error: unknown;
  onRangeChange: (range: HealthAnalyticsRange) => void;
  onRetry: () => void;
}) {
  const totals = points.reduce(
    (current, point) => ({
      warnings: current.warnings + point.surgeWarnings,
      errors: current.errors + point.surgeErrors,
      jobs: current.jobs + point.jobFailures,
    }),
    { warnings: 0, errors: 0, jobs: 0 },
  );
  const incidentTotal = totals.warnings + totals.errors + totals.jobs;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Error Trend</CardTitle>
          <p className="mt-1 text-xs text-text-tertiary">当前连接的 Surge warning/error 与 Scheduler failure；Bark 失败作为 Console 全局指标单独显示。</p>
        </div>
        <div className="flex rounded-[12px] border border-border bg-surface p-0.5">
          {(["24h", "7d"] as HealthAnalyticsRange[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onRangeChange(value)}
              className={cn(
                "touch-target rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors duration-hover",
                range === value ? "bg-accent/12 text-accent" : "text-text-secondary hover:text-text-primary",
              )}
            >
              {value === "24h" ? "24 小时" : "7 天"}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <SkeletonTrend />
        ) : error ? (
          <ErrorStateView error={error} api="/api/analytics/errors" compact onRetry={onRetry} />
        ) : incidentTotal === 0 && notificationFailuresGlobal === 0 ? (
          <DataEmpty title="当前时间范围没有错误" description="Surge、Scheduler 与 Bark 都没有记录到需要关注的失败。" compact />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <ErrorMetric label="Surge Error" value={totals.errors} tone="danger" />
              <ErrorMetric label="Surge Warning" value={totals.warnings} tone="warning" />
              <ErrorMetric label="Scheduler Failure" value={totals.jobs} tone="danger" />
              <ErrorMetric label="Bark Failure · 全局" value={notificationFailuresGlobal} tone="muted" />
            </div>
            <ErrorBars points={points} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-text-tertiary">
              <span>柱高 = 当前连接每个时间桶的异常总数</span>
              <span>24h 按 1 小时聚合 · 7d 按 6 小时聚合</span>
              <span>Bark Failure 不进入柱状趋势，因为现有通知历史是 Console 全局口径</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ErrorBars({ points }: { points: ErrorTrendPoint[] }) {
  const max = Math.max(1, ...points.map((point) => point.total));
  return (
    <div className="rounded-[14px] border border-border/55 bg-surface-tertiary/20 px-3 pb-2 pt-4">
      <div className="flex h-28 items-end gap-1" role="img" aria-label={`异常趋势，共 ${points.reduce((sum, point) => sum + point.total, 0)} 次`}>
        {points.map((point) => (
          <div key={point.bucketStart} className="group relative flex min-w-0 flex-1 items-end justify-center self-stretch">
            <div
              className={cn("w-full max-w-4 rounded-t-[4px]", point.total > 0 ? "bg-danger/65" : "bg-border/45")}
              style={{ height: point.total > 0 ? `${Math.max(8, point.total / max * 100)}%` : "2px" }}
            />
            <div className="pointer-events-none absolute bottom-full z-10 mb-2 hidden w-44 rounded-[10px] border border-border bg-surface-panel p-2 text-[10px] shadow-lg group-hover:block">
              <p className="font-medium text-text-primary">{new Date(point.bucketStart).toLocaleString()}</p>
              <p className="mt-1 text-text-tertiary">Error {point.surgeErrors} · Warning {point.surgeWarnings} · Job {point.jobFailures}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-text-tertiary">
        <span>{points[0] ? new Date(points[0].bucketStart).toLocaleString() : "—"}</span>
        <span>{points.at(-1) ? new Date(points.at(-1)!.bucketStart).toLocaleString() : "—"}</span>
      </div>
    </div>
  );
}

function ErrorMetric({ label, value, tone }: { label: string; value: number; tone: "danger" | "warning" | "muted" }) {
  const valueClass = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-text-primary";
  return (
    <div className="rounded-[12px] bg-surface-tertiary/45 px-3 py-2.5">
      <p className="text-[10px] text-text-tertiary">{label}</p>
      <p className={cn("mt-0.5 font-mono text-xl font-semibold tabular-nums", valueClass)}>{value}</p>
    </div>
  );
}

function SkeletonTrend() {
  return <div className="space-y-3"><div className="grid grid-cols-4 gap-2"><DataLoading rows={1} /><DataLoading rows={1} /><DataLoading rows={1} /><DataLoading rows={1} /></div><DataLoading rows={2} /></div>;
}
