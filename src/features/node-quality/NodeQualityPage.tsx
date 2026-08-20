import { useMemo } from "react";
import { Gauge, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { DataEmpty, ErrorStateView } from "@/components/data-state";
import { NoClientNotice } from "@/features/shared/NoClientNotice";
import { useSurgeClientState } from "@/app/surge-client-context";
import { usePolicyGroupsQuery, usePolicyTestResultsQuery } from "@/features/policies/policies-queries";
import { NodeLatencyBadge } from "./NodeLatencyBadge";
import { nodeQuality, rankNodes } from "./node-quality";

export function NodeQualityPage() {
  const { client } = useSurgeClientState();
  const groups = usePolicyGroupsQuery();
  const results = usePolicyTestResultsQuery();
  const rows = useMemo(() => rankNodes((groups.data ?? []).flatMap((group) => group.policies.map((name) => nodeQuality(name, group.name, results.data?.[group.name]?.[name])))), [groups.data, results.data]);
  if (!client) return <NoClientNotice page="Node Quality" />;
  if (groups.isLoading) return <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (groups.isError) return <ErrorStateView error={groups.error} api="/v1/policy_groups" onRetry={() => groups.refetch()} />;
  const measured = rows.filter((row) => row.latencyMs !== null);
  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-[26px] font-semibold text-text-primary">节点质量中心</h1><p className="mt-0.5 text-sm text-text-secondary">统一查看节点延迟、可用性和综合评分。</p></div><Button variant="secondary" onClick={() => groups.refetch()}><RefreshCw className="h-4 w-4" />刷新</Button></header>
    <div className="grid gap-4 sm:grid-cols-3"><Stat label="节点总数" value={String(rows.length)} /><Stat label="已有测速" value={String(measured.length)} /><Stat label="最快延迟" value={measured[0] ? Math.round(measured[0].latencyMs!) + "ms" : "—"} /></div>
    {measured.length === 0 && rows.length > 0 && <Card><CardContent className="flex flex-col items-center gap-2 py-8 text-center"><Gauge className="h-6 w-6 text-accent" /><p className="text-sm font-medium text-text-primary">等待节点测速数据</p><p className="text-xs text-text-secondary">请在「策略」页面打开策略组并执行“测速全部”，结果会自动同步。</p></CardContent></Card>}
    {rows.length === 0 ? <Card><DataEmpty title="没有节点数据" description="当前 Surge 实例没有返回策略组节点。" /></Card> : <Card><CardHeader><CardTitle>节点排名</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full border-collapse"><thead><tr className="border-b border-border text-left text-xs text-text-tertiary"><th className="px-3 py-2">节点</th><th className="px-3 py-2">策略组</th><th className="px-3 py-2">延迟</th><th className="px-3 py-2">评分</th></tr></thead><tbody>{rows.map((row) => <tr key={row.group + row.name} className="border-b border-border/50 text-[13px]"><td className="px-3 py-2.5 font-medium text-text-primary">{row.name}</td><td className="px-3 py-2.5 text-text-secondary">{row.group}</td><td className="px-3 py-2.5"><NodeLatencyBadge latency={row.latencyMs} reachable={row.reachable} /></td><td className="px-3 py-2.5 font-mono tabular-nums text-text-secondary">{row.score ?? "—"}</td></tr>)}</tbody></table></div></CardContent></Card>}
  </div>;
}
function Stat({ label, value }: { label: string; value: string }) { return <Card className="p-4"><p className="text-xs text-text-tertiary">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-text-primary">{value}</p></Card>; }
