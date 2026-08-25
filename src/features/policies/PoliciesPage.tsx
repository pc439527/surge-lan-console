import { useState } from "react";
import { ArrowRight, CheckCircle2, Gauge, Loader2, RefreshCw, Zap } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Drawer, DrawerBody, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/Drawer";
import { MetricStrip } from "@/components/ui/MetricStrip";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useSurgeClientState } from "@/app/surge-client-context";
import { NoClientNotice } from "@/features/shared/NoClientNotice";
import { policyLatencyMs } from "@/lib/request";
import { latencyTone } from "@/lib/latency";
import { NodeLatencyBadge } from "@/features/node-quality/NodeLatencyBadge";
import { cn } from "@/lib/cn";
import {
  useGroupSelectionsQuery,
  usePolicyGroupsQuery,
  usePolicyTestResultsQuery,
  useSelectFastestPolicyMutation,
  useSelectPolicyMutation,
  useTestGroupMutation,
} from "./policies-queries";
import { findFastestPolicy } from "./fastest-policy";

export function PoliciesPage() {
  const { client } = useSurgeClientState();
  const groups = usePolicyGroupsQuery();
  const groupNames = groups.data?.map((g) => g.name) ?? [];
  const selections = useGroupSelectionsQuery(groupNames);
  const selectPolicy = useSelectPolicyMutation();
  const selectFastest = useSelectFastestPolicyMutation();
  const testGroup = useTestGroupMutation();
  const [drawerGroup, setDrawerGroup] = useState<string | null>(null);
  const [testedGroups, setTestedGroups] = useState<Set<string>>(() => new Set());
  const testResults = usePolicyTestResultsQuery();

  if (!client) return <NoClientNotice page="Policies" />;

  const loading = groups.isLoading;
  const drawer = drawerGroup ? groups.data?.find((g) => g.name === drawerGroup) : undefined;
  const totalNodes = (groups.data ?? []).reduce((total, group) => total + group.policies.length, 0);
  const selectedCount = Object.values(selections.data ?? {}).filter(Boolean).length;

  const handleTestAll = (groupName: string) => {
    selectFastest.reset();
    const model = groups.data?.find((group) => group.name === groupName);
    const policies = (model?.policies ?? []).map((name) => ({
      name,
      typeDescription: model?.types[name] ?? "",
      lineHash: model?.lineHashes[name],
    }));
    testGroup.mutate({ group: groupName, policies }, {
      onSuccess: () => setTestedGroups((prev) => new Set(prev).add(groupName)),
    });
  };

  const groupTestSummary = (groupName: string) => {
    if (!testedGroups.has(groupName)) return null;
    const entries = testResults.data?.[groupName] ?? {};
    let best: { ms: number; name: string } | null = null;
    let reachable = 0;
    for (const [name, entry] of Object.entries(entries)) {
      const ms = policyLatencyMs(entry);
      if (entry.ok === true) reachable += 1;
      if (ms !== null && (!best || ms < best.ms)) best = { ms, name };
    }
    return { best, reachable, total: Object.keys(entries).length };
  };

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow="Policies"
        title="策略"
        description="策略组与当前选路；点击条目查看节点详情、执行组测速并切换策略。"
      />

      {groups.isError ? (
        <Card className="p-6 text-center">
          <p className="text-sm font-medium text-danger">策略组加载失败</p>
          <Button className="mt-3" size="sm" variant="secondary" onClick={() => groups.refetch()}>
            重试
          </Button>
        </Card>
      ) : loading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-[16px]" />
          <Skeleton className="h-64 w-full rounded-[18px]" />
        </div>
      ) : (
        <>
          <MetricStrip
            items={[
              { label: "策略组", value: String(groups.data?.length ?? 0), detail: `${totalNodes} 个节点`, tone: "muted" },
              { label: "已选择", value: String(selectedCount), detail: "当前明确选路", tone: selectedCount > 0 ? "success" : "muted" },
              { label: "本次已测速", value: String(testedGroups.size), detail: "当前浏览器会话", tone: testedGroups.size > 0 ? "accent" : "muted" },
              { label: "待检查", value: String(Math.max(0, (groups.data?.length ?? 0) - testedGroups.size)), detail: "尚未执行组测速", tone: testedGroups.size === (groups.data?.length ?? 0) ? "success" : "warning" },
            ]}
          />

          <Card className="overflow-hidden p-3 sm:p-4">
            <div className="mb-3 flex items-start justify-between gap-4 px-1">
              <div>
                <h2 className="text-[15px] font-semibold text-text-primary">策略组</h2>
                <p className="mt-1 text-xs text-text-tertiary">延迟分级：&lt;100ms 绿色 · 100–250ms 黄色 · &gt;250ms 红色。</p>
              </div>
              <span className="shrink-0 text-xs tabular-nums text-text-tertiary">{groups.data?.length ?? 0} 组</span>
            </div>

            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {groups.data?.map((group) => {
                const summary = groupTestSummary(group.name);
                const selection = selections.data?.[group.name];
                return (
                  <button
                    key={group.name}
                    type="button"
                    aria-label={`${group.name} 查看详情`}
                    onClick={() => setDrawerGroup(group.name)}
                    className="group flex min-h-[112px] w-full flex-col rounded-[14px] border border-transparent bg-surface-tertiary/55 p-4 text-left outline-none transition-all duration-hover hover:border-accent/25 hover:bg-elevated/55 focus-visible:ring-2 focus-visible:ring-accent/50"
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-text-primary">{group.name}</span>
                      <Badge className="max-w-[55%] shrink-0 truncate">{selection ?? "—"}</Badge>
                    </div>

                    <div className="mt-2 flex w-full items-center justify-between gap-3 text-xs">
                      <span className="text-text-tertiary">当前节点</span>
                      <span className="min-w-0 truncate text-right text-[13px] text-text-secondary">{selection ?? "未选择"}</span>
                    </div>

                    <div className="mt-auto flex w-full items-end justify-between gap-3 pt-3">
                      <div className="min-w-0 text-xs text-text-tertiary">
                        <span>{group.policies.length} 个节点</span>
                        {summary && (
                          <span className="ml-2">
                            {summary.best ? (
                              <span className={cn("font-mono tabular-nums", toneText[latencyTone(summary.best.ms)])}>
                                {Math.round(summary.best.ms)}ms · {summary.reachable}/{summary.total} 可达
                              </span>
                            ) : (
                              <span>{summary.reachable > 0 ? `${summary.reachable}/${summary.total} 可达` : "全部超时"}</span>
                            )}
                          </span>
                        )}
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-accent">
                        查看详情 <ArrowRight className="h-3.5 w-3.5 transition-transform duration-hover group-hover:translate-x-0.5" />
                      </span>
                    </div>
                  </button>
                );
              })}
              {(groups.data?.length ?? 0) === 0 && (
                <p className="col-span-full py-10 text-center text-sm text-text-tertiary">没有返回策略组。</p>
              )}
            </div>
          </Card>
        </>
      )}

      <Drawer open={!!drawerGroup} onOpenChange={(open) => { if (!open) setDrawerGroup(null); }}>
        <DrawerContent side="right" className="w-[min(520px,100vw)]">
          {drawer && (
            <>
              <DrawerHeader className="pr-12">
                <div className="flex items-center justify-between gap-2">
                  <DrawerTitle className="truncate">{drawer.name}</DrawerTitle>
                  <Badge className="shrink-0">{selections.data?.[drawer.name] ?? "未选择"}</Badge>
                </div>
                <DrawerDescription>
                  {drawer.policies.length} 个策略 · 当前 {selections.data?.[drawer.name] ?? "—"}
                </DrawerDescription>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => handleTestAll(drawer.name)} disabled={testGroup.isPending || selectFastest.isPending}>
                    {testGroup.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                    {testGroup.isPending ? "测速中…" : "测速全部"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={
                      !testedGroups.has(drawer.name) || testGroup.isPending || selectFastest.isPending ||
                      !findFastestPolicy(drawer.policies, testResults.data?.[drawer.name])
                    }
                    onClick={() => selectFastest.mutate({
                      group: drawer.name,
                      policies: drawer.policies,
                      results: testResults.data?.[drawer.name],
                    })}
                  >
                    {selectFastest.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gauge className="h-3.5 w-3.5" />}
                    {selectFastest.isPending
                      ? "选择中…"
                      : !testedGroups.has(drawer.name)
                        ? "请先测速"
                        : findFastestPolicy(drawer.policies, testResults.data?.[drawer.name])
                          ? "自动选择最快"
                          : Object.values(testResults.data?.[drawer.name] ?? {}).some((entry) => entry.ok === true)
                            ? "无延迟数据"
                            : "无可用节点"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleTestAll(drawer.name)}
                    disabled={testGroup.isPending || selectFastest.isPending}
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", testGroup.isPending && "animate-spin")} />
                    重新测速
                  </Button>
                </div>
                <div className="mt-2 min-h-5 text-xs" aria-live="polite">
                  {testGroup.isError && <span className="text-danger">测速失败，请重试。</span>}
                  {selectFastest.isError && <span className="text-danger">自动选择失败，当前节点未更改。</span>}
                  {selectFastest.isSuccess && selectFastest.data.group === drawer.name && (
                    <span className="inline-flex items-center gap-1 text-success">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      已选择 {selectFastest.data.name}（{Math.round(selectFastest.data.latencyMs)}ms）
                    </span>
                  )}
                </div>
              </DrawerHeader>

              <DrawerBody className="scrollbar-thin p-3">
                {drawer.policies.map((policyName) => {
                  const isSelected = selections.data?.[drawer.name] === policyName;
                  const type = drawer.types[policyName];
                  return (
                    <button
                      key={policyName}
                      type="button"
                      onClick={() => selectPolicy.mutate({ group: drawer.name, policy: policyName })}
                      disabled={selectPolicy.isPending}
                      className="touch-target flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left hover:bg-elevated/60"
                    >
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-pill", isSelected ? "bg-accent" : "bg-text-tertiary/40")} />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">{policyName}</span>
                      {type && <span className="shrink-0 font-mono text-[11px] text-text-tertiary">{type}</span>}
                      {testedGroups.has(drawer.name) && (
                        <NodeLatencyBadge
                          latency={policyLatencyMs(testResults.data?.[drawer.name]?.[policyName])}
                          reachable={testResults.data?.[drawer.name]?.[policyName]?.ok === true}
                          testedAt={Date.now()}
                        />
                      )}
                    </button>
                  );
                })}
                {drawer.policies.length === 0 && (
                  <p className="py-8 text-center text-sm text-text-tertiary">该策略组暂无节点。</p>
                )}
              </DrawerBody>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}

const toneText: Record<ReturnType<typeof latencyTone>, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  muted: "text-text-tertiary",
};
