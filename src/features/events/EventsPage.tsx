import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton } from "@/components/ui/Skeleton";
import { useSurgeClientState } from "@/app/surge-client-context";
import { NoClientNotice } from "@/features/shared/NoClientNotice";
import { formatEventTime } from "@/lib/format";
import { useEventsQuery, type DisplayEvent } from "@/features/dashboard/dashboard-queries";

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

  const eventsQuery = useEventsQuery();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (eventsQuery.data ?? []).filter((e: DisplayEvent) => {
      if (filter !== "all" && e.level !== filter) return false;
      if (q && !e.message.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [eventsQuery.data, filter, search]);

  if (!client) return <NoClientNotice page="Events" />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[26px] font-semibold text-text-primary">Events</h1>
        <p className="mt-0.5 text-sm text-text-secondary">事件中心 — 信息、警告与错误</p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl<Filter>
          label="事件级别"
          options={[
            { value: "all", label: "全部" },
            { value: "info", label: "信息" },
            { value: "warn", label: "警告" },
            { value: "error", label: "错误" },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <Input className="pl-9" placeholder="搜索事件..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>事件流</CardTitle>
        </CardHeader>
        <CardContent>
          {eventsQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((evt: DisplayEvent) => (
                <div key={evt.id} className="flex items-start gap-3 rounded-sm px-2 py-2 hover:bg-elevated/60">
                  <span className="w-16 shrink-0 pt-0.5 font-mono text-xs text-text-tertiary">
                    {formatEventTime(evt.time)}
                  </span>
                  <Badge variant={variant(evt.level)} className="mt-0.5 uppercase">{evt.level}</Badge>
                  <span className="min-w-0 flex-1 break-words text-[13px] text-text-primary">{evt.message}</span>
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="py-10 text-center text-sm text-text-tertiary">没有匹配的事件。</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
