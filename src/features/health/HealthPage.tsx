import { useMemo } from "react";
import { CheckCircle2, CircleAlert, CircleDashed, CircleX, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { MetricStrip } from "@/components/ui/MetricStrip";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataLoading, ErrorStateView } from "@/components/data-state";
import { NoClientNotice } from "@/features/shared/NoClientNotice";
import { useSurgeClientState } from "@/app/surge-client-context";
import { healthFromCapability, type HealthStatus } from "@/domain/health";
import { useCapabilitiesQuery } from "@/features/shared/capability";

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
  const { client, connection, demoMode } = useSurgeClientState();
  const capability = useCapabilitiesQuery();
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
