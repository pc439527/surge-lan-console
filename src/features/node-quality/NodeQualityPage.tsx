import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Gauge, Loader2, RefreshCw, Zap } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { MetricStrip } from "@/components/ui/MetricStrip";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { DataEmpty, ErrorStateView } from "@/components/data-state";
import { NoClientNotice } from "@/features/shared/NoClientNotice";
import { useSurgeClientState } from "@/app/surge-client-context";
import { usePolicyGroupsQuery, usePolicyTestResultsQuery, useTestAllGroupsMutation } from "@/features/policies/policies-queries";
import { coreApi, type HealthAnalyticsRange } from "@/lib/core-api";
import { cn } from "@/lib/cn";
import { NodeLatencyBadge } from "./NodeLatencyBadge";
import { dedupeNodeQualities, nodeQuality, rankNodes } from "./node-quality";

export function NodeQualityPage() {
  const { client, connectionId } = useSurgeClientState();
  const groups = usePolicyGroupsQuery();
  const results = usePolicyTestResultsQuery();
  const testAll = useTestAllGroupsMutation();
  const [historyRange, setHistoryRange] = useState<HealthAnalyticsRange>("24h");
  const history = useQuery({
    queryKey: ["core", "analytics", "policy-health", connectionId, historyRange],
    queryFn: () => coreApi.getPolicyHealthAnalytics(connectionId!, historyRange),
    enabled: !!client && !!connectionId,
    staleTime: 60_000,
  });
  const rows = useMemo(
    () => rankNodes(dedupeNodeQualities(
      (groups.data ?? []).flatMap((group) =>
        group.policies.map((name) => nodeQuality(
          name,
          group.name,
          results.data?.[group.name]?.[name],
          {
            lineHash: group.lineHashes[name],
            typeDescription: group.types[name] ?? "",
          },
        )),
      ),
    )),
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
        description="按真实节点去重查看实时延迟，并结合后台采样分析长期 P50、P95 与可用率。"
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
          { label: "当前可达率", value: rows.length ? `${reachableRate}%` : "—", detail: `${reachable} / ${rows.length} 可达`, tone: reachableRate >= 90 ? "success" : reachableRate >= 70 ? "warning" : "danger" },
        ]}
      />

      {measured.length === 0 && rows.length > 0 && (
        <div className="flex items-center gap-3 rounded-[14px] border border-accent/20 bg-accent/[0.04] px-4 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-accent/10 text-accent">
            <Gauge className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-medium text-text-primary">等待节点测速数据</p>
            <p className="mt-0.5 text-xs text-text-secondary">点击“一键测速”，系统会依次测试全部策略组并合并同一节点的结果。</p>
          </div>
        </div>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>历史质量</CardTitle>
            <p className="mt-1 text-xs text-text-tertiary">来自 Local Core Node Quality Collector；同一真实节点跨策略组只计一次。</p>
          </div>
          <div className="flex rounded-[12px] border border-border bg-surface p-0.5">
            {(["24h", "7d"] as HealthAnalyticsRange[]).map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setHistoryRange(range)}
                className={cn(
                  "touch-target rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors duration-hover",
                  historyRange === range ? "bg-accent/12 text-accent" : "text-text-secondary hover:text-text-primary",
                )}
              >
                {range === "24h" ? "24 小时" : "7 天"}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {history.isLoading ? (
            <div className="space-y-2 p-5"><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /></div>
          ) : history.isError ? (
            <div className="p-5"><ErrorStateView error={history.error} api="/api/analytics/policy-health" compact onRetry={() => history.refetch()} /></div>
          ) : !history.data?.nodes.length ? (
            <DataEmpty title="暂无历史节点质量" description="等待后台 Node Quality Collector 产生采样后，这里会显示 P50、P95 与可用率。" compact />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse">
                <thead className="bg-surface-panel/95">
                  <tr className="border-b border-border text-left text-xs text-text-tertiary">
                    <th className="px-5 py-3 font-medium">节点</th>
                    <th className="px-3 py-3 font-medium">所属策略组</th>
                    <th className="px-3 py-3 font-medium">P50</th>
                    <th className="px-3 py-3 font-medium">P95</th>
                    <th className="px-3 py-3 font-medium">可用率</th>
                    <th className="px-3 py-3 font-medium">采样</th>
                    <th className="px-5 py-3 text-right font-medium">最近状态</th>
                  </tr>
                </thead>
                <tbody>
                  {history.data.nodes.map((node) => (
                    <tr key={node.key} className="border-b border-border/45 text-[13px] last:border-b-0 hover:bg-elevated/35">
                      <td className="px-5 py-3 font-medium text-text-primary">{node.name}</td>
                      <td className="max-w-[280px] px-3 py-3 text-text-secondary"><span className="line-clamp-2">{node.groups.join(" · ") || "—"}</span></td>
                      <td className="px-3 py-3 font-mono tabular-nums text-text-secondary">{node.p50Ms === null ? "—" : `${Math.round(node.p50Ms)}ms`}</td>
                      <td className="px-3 py-3 font-mono tabular-nums text-text-secondary">{node.p95Ms === null ? "—" : `${Math.round(node.p95Ms)}ms`}</td>
                      <td className="px-3 py-3"><AvailabilityBadge value={node.availabilityPercent} /></td>
                      <td className="px-3 py-3 font-mono tabular-nums text-text-tertiary">{node.reachableCount}/{node.sampleCount}</td>
                      <td className="px-5 py-3 text-right"><NodeLatencyBadge latency={node.lastLatencyMs} reachable={node.lastReachable} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <Card><DataEmpty title="没有节点数据" description="当前 Surge 实例没有返回策略组节点。" /></Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>实时节点排名</CardTitle>
              <p className="mt-1 text-xs text-text-tertiary">按当前测速结果排序；所属多个策略组时合并展示，重复测速结果取中位延迟。</p>
            </div>
            <span className="text-xs text-text-tertiary">{rows.length} 个唯一节点</span>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse">
                <thead className="sticky top-0 z-[1] bg-surface-panel/95 backdrop-blur-md">
                  <tr className="border-b border-border text-left text-xs text-text-tertiary">
                    <th className="w-16 px-5 py-3 font-medium">排名</th>
                    <th className="px-3 py-3 font-medium">节点</th>
                    <th className="px-3 py-3 font-medium">所属策略组</th>
                    <th className="px-3 py-3 font-medium">延迟</th>
                    <th className="px-5 py-3 text-right font-medium">评分</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr
                      key={row.id}
                      className={cn(
                        "border-b border-border/45 text-[13px] transition-colors duration-hover last:border-b-0 hover:bg-elevated/35",
                        index < 3 && "bg-accent/[0.025]",
                      )}
                    >
                      <td className="px-5 py-3 font-mono text-xs tabular-nums text-text-tertiary">#{index + 1}</td>
                      <td className="px-3 py-3 font-medium text-text-primary">
                        <div className="min-w-0">
                          <p className="truncate">{row.name}</p>
                          {row.typeDescription && <p className="mt-0.5 font-mono text-[10px] text-text-tertiary">{row.typeDescription}</p>}
                        </div>
                      </td>
                      <td className="max-w-[320px] px-3 py-3 text-text-secondary" title={row.groups.join(" · ")}>
                        <span className="line-clamp-2">{row.groups.join(" · ")}</span>
                      </td>
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

function AvailabilityBadge({ value }: { value: number }) {
  const variant = value >= 99 ? "success" : value >= 90 ? "warning" : "danger";
  return <Badge variant={variant}>{value.toFixed(1)}%</Badge>;
}
