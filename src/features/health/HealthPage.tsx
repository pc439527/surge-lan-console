import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, CircleX, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataView } from "@/components/data-state/DataView";
import { DataLoading } from "@/components/data-state/DataState";
import { NoClientNotice } from "@/features/shared/NoClientNotice";
import { useSurgeClient, useSurgeClientState } from "@/app/surge-client-context";
import { healthFromCapability, type HealthStatus } from "@/domain/health";
import { useCapabilitiesQuery } from "@/features/shared/capability";
import { surgeKeys } from "@/lib/surge-keys";

const meta: Record<HealthStatus, { label: string; variant: "success" | "warning" | "danger" | "muted" }> = { healthy: { label: "OK", variant: "success" }, degraded: { label: "需检查", variant: "warning" }, unavailable: { label: "不可用", variant: "danger" }, unsupported: { label: "不支持", variant: "warning" }, unknown: { label: "未知", variant: "muted" } };

export function HealthPage() {
  const { client, connectionId, connection, demoMode } = useSurgeClientState();
  const surgeClient = useSurgeClient();
  const capability = useCapabilitiesQuery();
  const query = useQuery({ queryKey: surgeKeys.health(connectionId), queryFn: () => healthFromCapability(capability.data!), enabled: !!surgeClient && capability.isSuccess, staleTime: 30_000, refetchInterval: false });
  if (!client) return <NoClientNotice page="Health Center" />;
  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-[26px] font-semibold text-text-primary">Health Center</h1><p className="mt-0.5 text-sm text-text-secondary">连接、网络与平台能力 · {connection?.name ?? (demoMode ? "演示模式" : "当前连接")}</p></div><Button variant="secondary" size="sm" onClick={() => { void capability.refetch(); void query.refetch(); }} disabled={capability.isFetching}><RefreshCw className={`h-4 w-4 ${capability.isFetching ? "animate-spin" : ""}`} />重新检查</Button></header>
    <DataView query={query} api="/v1/health" loading={<DataLoading rows={5} />} empty={<Card><CardContent className="py-12 text-center text-sm text-text-secondary">暂无健康检查结果</CardContent></Card>}>{(report) => <div className="grid gap-4 md:grid-cols-2">{report.checks.map((check) => { const item = meta[check.status]; const Icon = check.status === "healthy" ? CheckCircle2 : check.status === "unavailable" ? CircleX : CircleAlert; return <Card key={check.id}><CardHeader className="flex-row items-center justify-between"><CardTitle className="flex items-center gap-2"><Icon className={`h-4 w-4 ${check.status === "healthy" ? "text-success" : check.status === "unavailable" ? "text-danger" : "text-warning"}`} />{check.label}</CardTitle><Badge variant={item.variant}>{item.label}</Badge></CardHeader><CardContent><p className="text-2xl font-semibold text-text-primary">{check.latencyMs === null ? "—" : `${check.latencyMs}ms`}</p><p className="mt-1 text-sm text-text-secondary">{check.detail}</p></CardContent></Card>; })}</div>}</DataView>
    {query.data && <p className="text-xs text-text-tertiary">检查时间：{new Date(query.data.checkedAt).toLocaleString()}</p>}
  </div>;
}
