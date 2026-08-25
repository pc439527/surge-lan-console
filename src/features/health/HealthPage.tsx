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
import { coreApi, type HealthAnalyticsRange, type RuntimeTrendPoint } from "@/lib/core-api";
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
  const [runtimeRange, setRuntimeRange] = useState<HealthAnalyticsRange>("24h");
  const runtime = useQuery({
    queryKey: ["core", "analytics", "runtime", connectionId, runtimeRange],
    queryFn: () => coreApi.getRuntimeAnalytics(connectionId!, runtimeRange),
    enabled: !!connectionId && !demoMode,
    staleTime: 60_000,
  });
  const health = useMemo(
    () => (capability.data ? healthFromCapability(capability.data) : null),
    [capability.data],
  );
  const refresh = async () => {
    if (connectionId && !demoMode) {
      await Promise.all([capability.refetch(), runtime.refetch()]);
      return;
    }
    await capability.refetch();
  };
  const refreshing = capability.isFetching || (Boolean(connectionId) && !demoMode && runtime.isFetching);

  if (!client) return <NoClientNotice page="Health Center" />;

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow="Health Center"
        title="健康中心"
        description={<>连接、运行状态与平台能力 · {connection?.name ?? (demoMode ? "演示模式" : "当前连接")}</>}
        actions={
          <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
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
        <RuntimeCard
          points={runtime.data?.points ?? []}
          range={runtimeRange}
          loading={runtime.isLoading}
          error={runtime.isError ? runtime.error : null}
          onRangeChange={setRuntimeRange}
          onRetry={() => void runtime.refetch()}
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

function RuntimeCard({
  points,
  range,
  loading,
  error,
  onRangeChange,
  onRetry,
}: {
  points: RuntimeTrendPoint[];
  range: HealthAnalyticsRange;
  loading: boolean;
  error: unknown;
  onRangeChange: (range: HealthAnalyticsRange) => void;
  onRetry: () => void;
}) {
  const latest = points.at(-1) ?? null;
  const memoryPoints = points.filter((point) => point.memoryBytes !== null);
  const averageMemory = memoryPoints.length > 0
    ? memoryPoints.reduce((sum, point) => sum + (point.memoryBytes ?? 0), 0) / memoryPoints.length
    : null;
  const peakMemory = memoryPoints.length > 0 ? Math.max(...memoryPoints.map((point) => point.memoryBytes ?? 0)) : null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-4">
        <div>
          <CardTitle>Runtime · Memory / Uptime</CardTitle>
          <p className="mt-1 text-xs text-text-tertiary">每 5 分钟持久化；优先使用 Surge /v1/metrics，旧版本仅从 /v1/traffic.startTime 回退 Uptime。</p>
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
          <DataLoading rows={3} />
        ) : error ? (
          <ErrorStateView error={error} api="/api/analytics/runtime" compact onRetry={onRetry} />
        ) : points.length === 0 ? (
          <DataEmpty title="暂无 Runtime 历史" description="Metrics Collector 会每 5 分钟生成一条 Memory/Uptime 样本。" compact />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <RuntimeMetric label="Engine Uptime" value={latest?.uptimeSeconds === null || !latest ? "N/A" : formatDuration(latest.uptimeSeconds)} detail={latest?.source === "metrics" ? "/v1/metrics" : "traffic.startTime fallback"} />
              <RuntimeMetric label="Memory" value={latest?.memoryBytes === null || !latest ? "N/A" : formatBytes(latest.memoryBytes)} detail={averageMemory === null ? "当前设备未暴露 Memory" : `平均 ${formatBytes(averageMemory)}`} />
              <RuntimeMetric label="Active Requests" value={latest?.activeRequests === null || !latest ? "N/A" : String(Math.round(latest.activeRequests))} detail="当前并发请求" />
              <RuntimeMetric label="DNS Cache" value={latest?.dnsCacheEntries === null || !latest ? "N/A" : String(Math.round(latest.dnsCacheEntries))} detail={latest?.activeBans === null || !latest ? "Unauthorized Ban N/A" : `Unauthorized Ban ${Math.round(latest.activeBans)}`} />
            </div>

            {memoryPoints.length > 0 ? (
              <MemoryTrend points={memoryPoints} peakMemory={peakMemory ?? 0} />
            ) : (
              <div className="rounded-[14px] border border-dashed border-border px-4 py-6 text-center">
                <p className="text-sm text-text-secondary">当前 Surge 未提供内存指标</p>
                <p className="mt-1 text-xs text-text-tertiary">Uptime 仍由 traffic.startTime 持续记录；Memory 不做估算。</p>
              </div>
            )}

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-text-tertiary">
              <span>{points.length} 个样本</span>
              <span>最新：{latest ? new Date(latest.sampledAt).toLocaleString() : "—"}</span>
              <span>数据保留 7 天</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RuntimeMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[12px] bg-surface-tertiary/45 px-3 py-2.5">
      <p className="text-[10px] text-text-tertiary">{label}</p>
      <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-text-primary">{value}</p>
      <p className="mt-0.5 truncate text-[10px] text-text-tertiary">{detail}</p>
    </div>
  );
}

function MemoryTrend({ points, peakMemory }: { points: RuntimeTrendPoint[]; peakMemory: number }) {
  const width = 1000;
  const height = 120;
  const max = Math.max(1, peakMemory);
  const coords = points.map((point, index) => {
    const x = points.length <= 1 ? width / 2 : index / (points.length - 1) * width;
    const y = height - ((point.memoryBytes ?? 0) / max) * (height - 12) - 6;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <div className="rounded-[14px] border border-border/55 bg-surface-tertiary/20 px-3 pb-3 pt-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-text-secondary">Memory Trend</p>
        <p className="font-mono text-[10px] text-text-tertiary">peak {formatBytes(peakMemory)}</p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-28 w-full" role="img" aria-label="Surge 内存使用趋势">
        <polyline points={coords} fill="none" className="stroke-accent" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex items-center justify-between text-[10px] text-text-tertiary">
        <span>{new Date(points[0]?.sampledAt ?? Date.now()).toLocaleString()}</span>
        <span>{new Date(points.at(-1)?.sampledAt ?? Date.now()).toLocaleString()}</span>
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "N/A";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
