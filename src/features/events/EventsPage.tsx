import { useMemo, useRef, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricStrip } from "@/components/ui/MetricStrip";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton } from "@/components/ui/Skeleton";
import { useSurgeClientState } from "@/app/surge-client-context";
import { NoClientNotice } from "@/features/shared/NoClientNotice";
import { DataEmpty, ErrorStateView } from "@/components/data-state";
import { formatEventTime } from "@/lib/format";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useEventsQuery, type DisplayEvent } from "@/features/shared/queries";
import { cn } from "@/lib/cn";

type Filter = "all" | "info" | "warn" | "error";

function variant(level: string): "default" | "warning" | "danger" {
  if (level === "error") return "danger";
  if (level === "warn") return "warning";
  return "default";
}

export function EventsPage() {
  const { client } = useSurgeClientState();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useKeyboardShortcuts({ "/": () => searchRef.current?.focus() });

  const eventsQuery = useEventsQuery();
  const events = eventsQuery.data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e: DisplayEvent) => {
      if (filter !== "all" && e.level !== filter) return false;
      if (q && !e.message.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [events, filter, search]);

  const counts = useMemo(() => ({
    error: events.filter((event) => event.level === "error").length,
    warn: events.filter((event) => event.level === "warn").length,
    info: events.filter((event) => event.level === "info").length,
  }), [events]);

  if (!client) return <NoClientNotice page="事件" />;

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        title="事件"
        description="Surge 系统事件流 · 信息、警告与错误。"
        actions={(
          <Button variant="secondary" size="sm" onClick={() => eventsQuery.refetch()} disabled={eventsQuery.isFetching}>
            <RefreshCw className={cn("h-3.5 w-3.5", eventsQuery.isFetching && "animate-spin")} />
            刷新
          </Button>
        )}
      />

      <MetricStrip
        items={[
          { label: "错误", value: counts.error, detail: "ERROR", tone: counts.error > 0 ? "danger" : "success" },
          { label: "警告", value: counts.warn, detail: "WARN", tone: counts.warn > 0 ? "warning" : "muted" },
          { label: "信息", value: counts.info, detail: "INFO", tone: "accent" },
          { label: "最新事件", value: events[0] ? formatEventTime(events[0].time) : "—", detail: `${events.length} 条事件`, tone: "muted" },
        ]}
      />

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl<Filter>
          label="事件级别"
          options={[
            { value: "all", label: `全部 ${events.length}` },
            { value: "error", label: `错误 ${counts.error}` },
            { value: "warn", label: `警告 ${counts.warn}` },
            { value: "info", label: `信息 ${counts.info}` },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <Input ref={searchRef} className="pl-9" placeholder="搜索事件…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between gap-3 pb-2">
          <div>
            <CardTitle>事件流</CardTitle>
            <p className="mt-1 text-xs text-text-tertiary">按 Surge 返回顺序展示，错误使用更高视觉优先级。</p>
          </div>
          <span className="text-xs tabular-nums text-text-tertiary">{filtered.length} 条</span>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-1 sm:px-4">
          {eventsQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : eventsQuery.isError ? (
            <ErrorStateView error={eventsQuery.error} api="/v1/events" compact onRetry={() => eventsQuery.refetch()} />
          ) : events.length === 0 ? (
            <DataEmpty title="暂无事件" description="Surge 当前没有返回系统事件。" compact />
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-tertiary">没有匹配的事件。</p>
          ) : (
            <div className="divide-y divide-border/45">
              {filtered.map((evt: DisplayEvent) => (
                <div
                  key={evt.id}
                  className={cn(
                    "grid grid-cols-[4.75rem_auto_minmax(0,1fr)] items-start gap-3 rounded-[12px] px-2.5 py-2.5 transition-colors duration-hover hover:bg-elevated/55 sm:grid-cols-[5.25rem_auto_minmax(0,1fr)] sm:px-3",
                    evt.level === "error" && "bg-danger/[0.035]",
                    evt.level === "warn" && "bg-warning/[0.025]",
                  )}
                >
                  <span className="pt-0.5 font-mono text-xs tabular-nums text-text-tertiary">{formatEventTime(evt.time)}</span>
                  <Badge variant={variant(evt.level)} className="mt-0.5 uppercase">{evt.level}</Badge>
                  <span className={cn("min-w-0 break-words text-[13px] leading-5 text-text-primary", evt.level === "error" && "font-medium")}>{evt.message}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
