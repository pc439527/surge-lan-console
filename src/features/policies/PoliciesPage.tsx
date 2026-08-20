import { useState } from "react";
import { ArrowRight, CheckCircle2, Gauge, Loader2, RefreshCw, Zap } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Drawer, DrawerBody, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/Drawer";
import { Skeleton } from "@/components/ui/Skeleton";
import { useSurgeClientState } from "@/app/surge-client-context";
import { NoClientNotice } from "@/features/shared/NoClientNotice";
import { policyLatencyMs, policyLatencyView } from "@/lib/request";
import { latencyTone } from "@/lib/latency";
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

/**
 * Policies (v0.2.1, T06/T07).
 *
 * The list page only shows Group Cards — a 24-node group never stretches the
 * page. Clicking a card opens a right Drawer (≤520px) with:
 *   - sticky header: group name, current selection, [测速全部] [刷新]
 *   - independently scrolling body: per-policy rows (dot · name · type ·
 *     latency badge with <100/100–250/>250/超时 grading)
 *
 * There is deliberately NO per-node "测试" button: /v1/policy_groups/test
 * tests the whole group, so a per-row button would be a lie. "测速全部" in the
 * header runs the group test, then test results are fetched once and cached
 * 30s (no 15s polling loop).
 */
export function PoliciesPage() {
  const { client } = useSurgeClientState();
  const groups = usePolicyGroupsQuery();
  const groupNames = groups.data?.map((g) => g.name) ?? [];
  const selections = useGroupSelectionsQuery(groupNames);
  const selectPolicy = useSelectPolicyMutation();
  const selectFastest = useSelectFastestPolicyMutation();
  const testGroup = useTestGroupMutation();

  // Which group's drawer is open (null = closed).
  const [drawerGroup, setDrawerGroup] = useState<string | null>(null);
  // Groups the user has tested this session — enables the test-results query
  // (no polling before the first test).
  const [testedGroups, setTestedGroups] = useState<Set<string>>(() => new Set());
  const testResults = usePolicyTestResultsQuery();

  if (!client) return <NoClientNotice page="Policies" />;

  const loading = groups.isLoading;
  const drawer = drawerGroup ? groups.data?.find((g) => g.name === drawerGroup) : undefined;

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

  /** 某策略组测速后的最佳（最低）延迟与可达节点数；未测速返回 null。 */
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
    <div className="space-y-6">
      <header>
        <h1 className="text-[26px] font-semibold text-text-primary">Policies</h1>
        <p className="mt-0.5 text-sm text-text-secondary">
          策略组 · 点击卡片查看节点详情 · 延迟分级：&lt;100 绿 / 100–250 橙 / &gt;250 红
        </p>
      </header>

      {groups.isError ? (
        <Card className="p-6 text-center">
          <p className="text-sm font-medium text-danger">策略组加载失败</p>
          <Button className="mt-3" size="sm" variant="secondary" onClick={() => groups.refetch()}>
            重试
          </Button>
        </Card>
      ) : loading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.data?.map((group) => {
            const summary = groupTestSummary(group.name);
            return (
            <Card
              key={group.name}
              className="p-0 transition-colors duration-hover hover:border-accent/40"
            >
              <button
                type="button"
                onClick={() => setDrawerGroup(group.name)}
                className="flex w-full flex-col gap-2.5 rounded-lg p-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-text-primary">{group.name}</span>
                  <Badge className="shrink-0">{selections.data?.[group.name] ?? "—"}</Badge>
                </div>
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="shrink-0 text-text-tertiary">当前节点</span>
                  <span className="min-w-0 truncate text-[13px] text-text-secondary">
                    {selections.data?.[group.name] ?? "未选择"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-tertiary">节点数量</span>
                  <span className="text-[13px] text-text-secondary">{group.policies.length}</span>
                </div>
                {summary && (
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="shrink-0 text-text-tertiary">测速</span>
                    {summary.best ? (
                      <span
                        className={cn(
                          "min-w-0 truncate font-mono tabular-nums",
                          toneText[latencyTone(summary.best.ms)],
                        )}
                      >
                        ● {Math.round(summary.best.ms)}ms · {summary.best.name}
                        {summary.total > 1 && `（${summary.reachable}/${summary.total} 可达）`}
                      </span>
                    ) : (
                      <span className="text-text-tertiary">{summary.reachable > 0 ? `${summary.reachable}/${summary.total} 可达 · 无延迟数据` : "全部超时"}</span>
                    )}
                  </div>
                )}
                <div className="flex items-center justify-end gap-1 pt-1 text-xs text-accent">
                  查看详情 <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </button>
            </Card>
            );
          })}
          {(groups.data?.length ?? 0) === 0 && !groups.isError && (
            <p className="py-8 text-center text-sm text-text-tertiary">没有返回策略组。</p>
          )}
        </div>
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
                    {testGroup.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Zap className="h-3.5 w-3.5" />
                    )}
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
                  const latency = policyLatencyView(testResults.data?.[drawer.name]?.[policyName]);
                  const type = drawer.types[policyName];
                  return (
                    <button
                      key={policyName}
                      type="button"
                      onClick={() => selectPolicy.mutate({ group: drawer.name, policy: policyName })}
                      disabled={selectPolicy.isPending}
                      className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-left hover:bg-elevated/60"
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-pill",
                          isSelected ? "bg-accent" : "bg-text-tertiary/40",
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">{policyName}</span>
                      {type && <span className="shrink-0 font-mono text-[10px] text-text-tertiary">{type}</span>}
                      {testedGroups.has(drawer.name) && (
                        <Badge variant={latency.tone} className="shrink-0 font-mono tabular-nums">
                          {latency.label}
                        </Badge>
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
