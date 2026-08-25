import { useMemo } from "react";
import { Gauge, Loader2, RefreshCw, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { MetricStrip } from "@/components/ui/MetricStrip";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { DataEmpty, ErrorStateView } from "@/components/data-state";
import { NoClientNotice } from "@/features/shared/NoClientNotice";
import { useSurgeClientState } from "@/app/surge-client-context";
import { usePolicyGroupsQuery, usePolicyTestResultsQuery, useTestAllGroupsMutation } from "@/features/policies/policies-queries";
import { cn } from "@/lib/cn";
import { NodeLatencyBadge } from "./NodeLatencyBadge";
import { nodeQuality, rankNodes } from "./node-quality";

export function NodeQualityPage() {
  const { client } = useSurgeClientState();
  const groups = usePolicyGroupsQuery();
  const results = usePolicyTestResultsQuery();
  const testAll = useTestAllGroupsMutation();
  const rows = useMemo(
    () => rankNodes(
      (groups.data ?? []).flatMap((group) =>
        group.policies.map((name) => nodeQuality(name, group.name, results.data?.[group.name]?.[name])),
      ),
    ),
    [groups.data, results.data],
  );

  if (!client) return <NoClientNotice page="Node Quality" />;
  if (groups.isLoading) return <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (groups.isError) return <ErrorStateView error={groups.error} api="/v1/policy_groups" onRetry={() => groups.refetch()} />;

  const measured = rows.filter((row) => row.latencyMs !== null);
  const reachable = rows.filter((row) => row.reachable).length;
  const reachableRate = rows.length > 0 ? Math.round((reachable / rows.length) * 100) : 0;

  const runAll = () => testAll.mutate(
    (groups.data ?? []).map((group) => ({
      name: group.name,
      policies: group.policies.map((name) => ({
        name,
        typeDescription: group.types[name] ?? "",
        lineHash: group.lineHashes[name],
      })),
    })),
  );

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow="Node Quality"
        title="节点质量"
        description="统一查看节点延迟、可用性与综合评分；排序结果用于快速识别当前质量最好的出口。"
        actions={
          <>
            <Button onClick={runAll} disabled={testAll.isPending || !groups.data?.length}>
              {testAll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              {testAll.isPending ? "测速中…" : "一键测速"}
            </Button>
            <Button variant="secondary" onClick={() => groups.refetch()} disabled={testAll.isPending}>
              <RefreshCw className="h-4 w-4" />
              刷新节点
            </Button>
          </>
        }
      />

      <MetricStrip
        items={[
          { label: "节点总数", value: String(rows.length), detail: `${groups.data?.length ?? 0} 个策略组`, tone: "muted" },
          { label: "已有测速", value: String(measured.length), detail: rows.length ? `${Math.round((measured.length / rows.length) * 100)}% 覆盖` : "暂无节点", tone: "accent" },
          { label: "最快延迟", value: measured[0] ? `${Math.round(measured[0].latencyMs!)}ms` : "—", detail: measured[0]?.name ?? "等待测速", tone: measured[0] ? "success" : "muted" },
          { label: "可达率", value: rows.length ? `${reachableRate}%` : "—", detail: `${reachable} / ${rows.length} 可达`, tone: reachableRate >= 90 ? "success" : reachableRate >= 70 ? "warning" : "danger" },
        ]}
      />

      {measured.length === 0 && rows.length > 0 && (
        <div className="flex items-center gap-3 rounded-[14px] border border-accent/20 bg-accent/[0.04] px-4 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-accent/10 text-accent">
            <Gauge className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-medium text-text-primary">等待节点测速数据</p>
            <p className="mt-0.5 text-xs text-text-secondary">点击“一键测速”，系统会依次测试全部策略组。</p>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <Card><DataEmpty title="没有节点数据" description="当前 Surge 实例没有返回策略组节点。" /></Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>节点排名</CardTitle>
              <p className="mt-1 text-xs text-text-tertiary">按综合评分排序；延迟仅作为其中一个质量信号。</p>
            </div>
            <span className="text-xs text-text-tertiary">{rows.length} 个节点</span>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse">
                <thead className="sticky top-0 z-[1] bg-surface-panel/95 backdrop-blur-md">
                  <tr className="border-b border-border text-left text-xs text-text-tertiary">
                    <th className="w-16 px-5 py-3 font-medium">排名</th>
                    <th className="px-3 py-3 font-medium">节点</th>
                    <th className="px-3 py-3 font-medium">策略组</th>
                    <th className="px-3 py-3 font-medium">延迟</th>
                    <th className="px-5 py-3 text-right font-medium">评分</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr
                      key={row.group + row.name}
                      className={cn(
                        "border-b border-border/45 text-[13px] transition-colors duration-hover last:border-b-0 hover:bg-elevated/35",
                        index < 3 && "bg-accent/[0.025]",
                      )}
                    >
                      <td className="px-5 py-3 font-mono text-xs tabular-nums text-text-tertiary">#{index + 1}</td>
                      <td className="px-3 py-3 font-medium text-text-primary">{row.name}</td>
                      <td className="px-3 py-3 text-text-secondary">{row.group}</td>
                      <td className="px-3 py-3"><NodeLatencyBadge latency={row.latencyMs} reachable={row.reachable} /></td>
                      <td className="px-5 py-3 text-right font-mono font-medium tabular-nums text-text-secondary">{row.score ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
