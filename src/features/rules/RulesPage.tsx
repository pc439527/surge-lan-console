import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { useSurgeClient, useSurgeClientState } from "@/app/surge-client-context";
import { surgeKeys } from "@/lib/surge-keys";
import { NoClientNotice } from "@/features/shared/NoClientNotice";
import { DataEmpty, ErrorStateView } from "@/components/data-state";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import type { RuleInfo } from "@/api/types";
import { cn } from "@/lib/cn";

/**
 * Rules (OPTIMIZATION_PLAN Task 05, §39–40).
 * Normalized via normalizeRules — a failed parse shows "解析失败", never
 * "没有规则". Search + type filter, with the total count in the footer.
 */

const TYPE_FILTERS = ["all", "DOMAIN", "RULE-SET", "IP-CIDR", "GEOIP", "FINAL", "DOMAIN-SUFFIX", "PROCESS-NAME"];

export function RulesPage() {
  const { client, connectionId } = useSurgeClientState();
  const surgeClient = useSurgeClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const searchRef = useRef<HTMLInputElement>(null);

  useKeyboardShortcuts({ "/": () => searchRef.current?.focus() });

  const rulesQuery = useQuery({
    queryKey: surgeKeys.rules(connectionId),
    queryFn: () => surgeClient!.getRules(),
    enabled: !!surgeClient,
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rulesQuery.data ?? []).filter((rule) => {
      if (typeFilter !== "all" && rule.type !== typeFilter) return false;
      if (q) {
        const content = (rule.content ?? "").toLowerCase();
        const policy = (rule.policy ?? "").toLowerCase();
        const type = (rule.type ?? "").toLowerCase();
        if (!content.includes(q) && !policy.includes(q) && !type.includes(q)) return false;
      }
      return true;
    });
  }, [rulesQuery.data, search, typeFilter]);

  if (!client) return <NoClientNotice page="Rules" />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[26px] font-semibold text-text-primary">Rules</h1>
        <p className="mt-0.5 text-sm text-text-secondary">当前配置的活动规则集 · 共 {(rulesQuery.data ?? []).length} 条</p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <Input ref={searchRef} className="pl-9" placeholder="搜索规则内容、策略或类型…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setTypeFilter(f)}
              className={cn(
                "rounded-pill border border-border px-2.5 py-1 text-xs font-medium transition-colors duration-hover",
                typeFilter === f
                  ? "border-accent/40 bg-accent/12 text-accent"
                  : "text-text-secondary hover:bg-surface hover:text-text-primary",
              )}
            >
              {f === "all" ? "ALL" : f}
              {f !== "all" && typeCounts.get(f) !== undefined && (
                <span className="ml-1 text-[10px] text-text-tertiary">{typeCounts.get(f)}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>规则集</CardTitle>
          <span className="text-xs text-text-tertiary">{filtered.length} 条</span>
        </CardHeader>
        <CardContent>
          {rulesQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : rulesQuery.isError ? (
            <ErrorStateView error={rulesQuery.error} api="/v1/rules" compact onRetry={() => rulesQuery.refetch()} />
          ) : rulesQuery.data?.length === 0 ? (
            <DataEmpty
              title="没有返回规则"
              description="请求记录显示规则正在执行，但 /v1/rules 未返回数据 — 可能是 API 响应结构解析失败，请到「设置 → API Diagnostics」查看 Raw Structure。"
              compact
            />
          ) : filtered.length === 0 ? (
            <DataEmpty title="没有匹配的规则" description="调整搜索词或类型筛选后重试。" compact />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left text-xs font-medium text-text-tertiary">Type</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-text-tertiary">Content</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-text-tertiary">Policy</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((rule, i) => (
                    <RuleRow key={i} rule={rule} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RuleRow({ rule }: { rule: RuleInfo }) {
  return (
    <tr className="border-b border-border/50">
      <td className="px-3 py-2.5 align-top">
        <Badge variant="muted" className="font-mono text-[11px]">{rule.type ?? "—"}</Badge>
      </td>
      <td className="px-3 py-2.5 font-mono text-xs text-text-primary">{rule.content || "—"}</td>
      <td className="px-3 py-2.5 text-[13px] text-text-secondary">{rule.policy || "—"}</td>
    </tr>
  );
}
