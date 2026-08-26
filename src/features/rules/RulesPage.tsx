import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { MetricStrip } from "@/components/ui/MetricStrip";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useSurgeClient, useSurgeClientState } from "@/app/surge-client-context";
import { surgeKeys } from "@/lib/surge-keys";
import { NoClientNotice } from "@/features/shared/NoClientNotice";
import { DataEmpty, ErrorStateView } from "@/components/data-state";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import type { RuleInfo } from "@/api/types";
import { cn } from "@/lib/cn";
import { CapabilityNotice } from "@/features/shared/CapabilityNotice";
import { useCapabilityFeature } from "@/features/shared/capability";

const TYPE_FILTERS = ["all", "DOMAIN", "RULE-SET", "IP-CIDR", "GEOIP", "FINAL", "DOMAIN-SUFFIX", "PROCESS-NAME"];

export function RulesPage() {
  const { client, connectionId } = useSurgeClientState();
  const surgeClient = useSurgeClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const searchRef = useRef<HTMLInputElement>(null);

  useKeyboardShortcuts({ "/": () => searchRef.current?.focus() });

  const capRules = useCapabilityFeature("rules");
  const capUnsupported = capRules === "unsupported";

  const rulesQuery = useQuery({
    queryKey: surgeKeys.rules(connectionId),
    queryFn: () => surgeClient!.getRules(),
    enabled: !!surgeClient && !capUnsupported,
    staleTime: 60_000,
  });

  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const rule of rulesQuery.data ?? []) {
      const key = rule.type ?? "—";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [rulesQuery.data]);

  const topRuleTypes = useMemo(() => {
    return [...typeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [typeCounts]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (rulesQuery.data ?? []).filter((rule) => {
      if (typeFilter !== "all" && rule.type !== typeFilter) return false;
      if (!query) return true;
      return [rule.content ?? "", rule.policy ?? "", rule.type ?? ""]
        .some((value) => value.toLowerCase().includes(query));
    });
  }, [rulesQuery.data, search, typeFilter]);

  if (!client) return <NoClientNotice page="规则" />;

  const totalRules = rulesQuery.data?.length ?? 0;
  const primaryType = topRuleTypes[0];

  return (
    <div className="min-w-0 space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow="Surge"
        title="规则"
        description="查看当前配置正在使用的规则，并按类型、内容或策略快速筛选。"
      />

      {capUnsupported ? (
        <CapabilityNotice feature="rules" api="/v1/rules" />
      ) : (
        <>
          <MetricStrip
            items={[
              { label: "规则总数", value: totalRules, detail: "当前配置", tone: "accent" },
              { label: "当前匹配", value: filtered.length, detail: typeFilter === "all" ? "全部类型" : typeFilter, tone: "success" },
              { label: "规则类型", value: typeCounts.size, detail: "已识别类型", tone: "muted" },
              { label: "主要类型", value: primaryType?.[0] ?? "—", detail: primaryType ? `${primaryType[1]} 条` : "暂无数据", tone: "muted" },
            ]}
          />

          <div className="content-panel min-w-0 overflow-hidden rounded-[16px] p-3">
            <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                <Input
                  ref={searchRef}
                  className="pl-9"
                  placeholder="搜索规则内容、策略或类型…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div className="scrollbar-none flex w-full min-w-0 max-w-full gap-1.5 overflow-x-auto overscroll-x-contain pb-0.5 lg:w-auto lg:max-w-[62%]">
                {TYPE_FILTERS.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    aria-pressed={typeFilter === filter}
                    onClick={() => setTypeFilter(filter)}
                    className={cn(
                      "shrink-0 rounded-pill border border-border px-2.5 py-1.5 text-xs font-medium transition-colors duration-hover",
                      typeFilter === filter
                        ? "border-accent/40 bg-accent/12 text-accent"
                        : "text-text-secondary hover:bg-surface hover:text-text-primary",
                    )}
                  >
                    {filter === "all" ? "全部" : filter}
                    {filter !== "all" && typeCounts.get(filter) !== undefined && (
                      <span className="ml-1 text-[11px] text-text-tertiary">{typeCounts.get(filter)}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-text-tertiary">
              <span>显示 {filtered.length} / {totalRules}</span>
              {topRuleTypes.map(([type, count]) => (
                <span key={type} className="font-mono">{type} {count}</span>
              ))}
            </div>
          </div>

          <Card className="min-w-0">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>规则集</CardTitle>
              <span className="text-xs tabular-nums text-text-tertiary">{filtered.length} 条</span>
            </CardHeader>
            <CardContent className="min-w-0">
              {rulesQuery.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : rulesQuery.isError ? (
                <ErrorStateView error={rulesQuery.error} api="/v1/rules" compact onRetry={() => rulesQuery.refetch()} />
              ) : rulesQuery.data?.length === 0 ? (
                <DataEmpty
                  title="没有返回规则"
                  description="请求记录显示规则正在执行，但 /v1/rules 未返回数据。可能是 API 响应结构解析失败，请到「设置 → API 诊断」查看原始结构。"
                  compact
                />
              ) : filtered.length === 0 ? (
                <DataEmpty title="没有匹配的规则" description="调整搜索词或类型筛选后重试。" compact />
              ) : (
                <div className="max-w-full overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-3 py-2 text-left text-xs font-medium text-text-tertiary">类型</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-text-tertiary">内容</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-text-tertiary">策略</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((rule, index) => <RuleRow key={index} rule={rule} />)}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function RuleRow({ rule }: { rule: RuleInfo }) {
  return (
    <tr className="border-b border-border/50 transition-colors duration-hover hover:bg-elevated/45">
      <td className="px-3 py-2.5 align-top">
        <Badge variant="muted" className="font-mono text-[11px]">{rule.type ?? "—"}</Badge>
      </td>
      <td className="max-w-[900px] px-3 py-2.5 font-mono text-xs text-text-primary">
        <span className="block break-all">{rule.content || "—"}</span>
      </td>
      <td className="px-3 py-2.5 text-[13px] text-text-secondary">{rule.policy || "—"}</td>
    </tr>
  );
}
