import { useMemo } from "react";
import { CheckCircle2, CircleAlert, CircleDashed, CircleX, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataLoading, ErrorStateView } from "@/components/data-state";
import { NoClientNotice } from "@/features/shared/NoClientNotice";
import { useSurgeClientState } from "@/app/surge-client-context";
import { healthFromCapability, type HealthStatus } from "@/domain/health";
import { useCapabilitiesQuery } from "@/features/shared/capability";

/**
 * Health Center (v0.6.0, P0-4).
 *
 * Surge has NO /v1/health endpoint — this page derives its report from the
 * Capability Probe (the same one that feeds the sidebar / dashboard /
 * Diagnostics), computed inline with useMemo. Refresh triggers exactly ONE
 * probe run; there is no second query that could read stale capability data.
 *
 * Status taxonomy per review: Healthy / Warning / Unavailable / N/A / Unknown.
 * "不支持"（平台正常差异）→ N/A，绝不把整体健康拖成异常。
 */

const meta: Record<HealthStatus, { label: string; variant: "success" | "warning" | "danger" | "muted" }> = {
  healthy: { label: "OK", variant: "success" },
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

  // P0-4: health is a pure derivation of the capability probe — derived with
  // useMemo, never a second query that could race the refetch.
  const health = useMemo(
    () => (capability.data ? healthFromCapability(capability.data) : null),
    [capability.data],
  );

  if (!client) return <NoClientNotice page="Health Center" />;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold text-text-primary">Health Center</h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            连接、网络与平台能力 · {connection?.name ?? (demoMode ? "演示模式" : "当前连接")}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void capability.refetch()} disabled={capability.isFetching}>
          <RefreshCw className={`h-4 w-4 ${capability.isFetching ? "animate-spin" : ""}`} />
          重新检查
        </Button>
      </header>

      {capability.isPending ? (
        <DataLoading rows={5} />
      ) : capability.isError ? (
        <ErrorStateView error={capability.error} onRetry={() => void capability.refetch()} />
      ) : health ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {health.checks.map((check) => {
                const item = meta[check.status];
                const { Icon, color } = statusIcon(check.status);
                return (
                  <Card key={check.id}>
                    <CardHeader className="flex-row items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${color}`} />
                        {check.label}
                      </CardTitle>
                      <Badge variant={item.variant}>{item.label}</Badge>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-semibold text-text-primary">
                        {check.latencyMs === null ? "—" : `${check.latencyMs}ms`}
                      </p>
                      <p className="mt-1 text-sm text-text-secondary">{check.detail}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            <p className="text-xs text-text-tertiary">
              来源：Capability Probe（实测端点 · 非虚构 /v1/health）· 检查时间：
              {new Date(health.checkedAt).toLocaleString()}
            </p>
          </>
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-sm text-text-secondary">
              正在等待能力探测结果…
            </CardContent>
          </Card>
        )}
    </div>
  );
}