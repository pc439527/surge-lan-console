import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock3, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TrafficChart } from "@/features/traffic/TrafficChart";
import { TrafficStatsTable, type TrafficStatsRow } from "@/features/traffic/TrafficStatsTable";
import { useSurgeClientState } from "@/app/surge-client-context";
import { NoClientNotice } from "@/features/shared/NoClientNotice";
import { summarizeTraffic } from "@/api/surge-client";
import { useRawTrafficQuery } from "@/features/shared/queries";
import { usePageVisible } from "@/hooks/use-page-visibility";
import { formatBytes, formatUptime } from "@/lib/format";
import { normalizeEpoch } from "@/api/normalize";

type Range = "1m" | "5m" | "15m" | "30m";

const RANGES: { value: Range; label: string }[] = [
  { value: "1m", label: "1 分钟" },
  { value: "5m", label: "5 分钟" },
  { value: "15m", label: "15 分钟" },
  { value: "30m", label: "30 分钟" },
];

const WINDOW_MS: Record<Range, number> = { "1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000 };

/** Keep the last 30 minutes (1s sampling) in the ring buffer; the UI filters on top. */
const MAX_POINTS = 1800;

interface TrafficSample {
  time: number;
  uploadRate: number;
  downloadRate: number;
  totalUpload: number;
  totalDownload: number;
}

/** Surge session start as a display string; falls back to "—". */
function formatStartTime(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return "—";
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * 实时统计 — the full /v1/traffic payload (interfaces + connectors + runtime),
 * backed by the same single-cache raw query the Dashboard summary derives from.
 */
export function TrafficPage() {
  const { client, connectionId } = useSurgeClientState();
  const traffic = useRawTrafficQuery();
  const visible = usePageVisible();
  const [range, setRange] = useState<Range>("5m");
  const [samples, setSamples] = useState<TrafficSample[]>([]);

  // Switching Surge instances must never mix charts or show stale stats.
  useEffect(() => {
    setSamples([]);
  }, [connectionId]);

  // Ring buffer: append while the tab is visible, cap at MAX_POINTS (30 min).
  // Hidden tabs stop appending (their Date.now() drifts anyway) — TanStack
  // Query pauses polling and refetches on return (see queries.ts).
  useEffect(() => {
    if (!traffic.data || !visible) return;
    const summary = summarizeTraffic(traffic.data);
    setSamples((prev) => {
      const next = [
        ...prev,
        {
          time: Date.now(),
          uploadRate: summary.uploadRate,
          downloadRate: summary.downloadRate,
          totalUpload: summary.totalUpload,
          totalDownload: summary.totalDownload,
        },
      ];
      return next.length > MAX_POINTS ? next.slice(next.length - MAX_POINTS) : next;
    });
  }, [traffic.data, connectionId, visible]);

  const windowSamples = useMemo(() => {
    const cutoff = Date.now() - WINDOW_MS[range];
    return samples.filter((p) => p.time >= cutoff);
  }, [samples, range]);

  // Window totals = last cumulative value - first cumulative value.
  const totals = useMemo(() => {
    if (windowSamples.length < 2) return { upload: 0, download: 0 };
    const first = windowSamples[0];
    const last = windowSamples[windowSamples.length - 1];
    return {
      upload: Math.max(0, last.totalUpload - first.totalUpload),
      download: Math.max(0, last.totalDownload - first.totalDownload),
    };
  }, [windowSamples]);

  const summary = useMemo(() => (traffic.data ? summarizeTraffic(traffic.data) : null), [traffic.data]);

  const startTimeMs = traffic.data?.startTime ? normalizeEpoch(traffic.data.startTime) : undefined;
  const uptimeMs =
    startTimeMs !== undefined ? Math.max(0, Date.now() - startTimeMs) : undefined;

  const interfaceRows = useMemo<TrafficStatsRow[]>(
    () => Object.entries(traffic.data?.interface ?? {}).map(([name, stats]) => ({ name, ...stats })),
    [traffic.data],
  );

  const connectorRows = useMemo<TrafficStatsRow[]>(
    () => Object.entries(traffic.data?.connector ?? {}).map(([name, stats]) => ({ name, ...stats })),
    [traffic.data],
  );

  if (!client) return <NoClientNotice page="实时统计" />;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold text-text-primary">实时统计</h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            查看 Surge 网络接口、策略连接器与实时流量使用情况
          </p>
        </div>
      </header>

      {traffic.isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <AlertTriangle className="h-7 w-7 text-danger" />
            <p className="text-sm font-medium text-danger">实时统计加载失败</p>
            <p className="text-xs text-text-tertiary">无法从 Surge 获取实时流量数据。</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => traffic.refetch()}>
              重新加载
            </Button>
          </CardContent>
        </Card>
      ) : traffic.isLoading ? (
        <div className="space-y-6">
          <Card>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>网络接口</CardTitle>
            </CardHeader>
            <CardContent>
              <Skeleton className="h-40 w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>连接器统计</CardTitle>
            </CardHeader>
            <CardContent>
              <Skeleton className="h-40 w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>流量趋势</CardTitle>
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
          {/* 运行信息 — Surge session start + uptime */}
          <Card>
            <CardHeader>
              <CardTitle>运行信息</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex items-start gap-3">
                <CalendarDays className="mt-0.5 h-4 w-4 text-text-tertiary" aria-hidden="true" />
                <div>
                  <p className="text-[13px] text-text-secondary">开启时间</p>
                  <p className="mt-0.5 text-sm font-medium tabular-nums text-text-primary">
                    {formatStartTime(startTimeMs)}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock3 className="mt-0.5 h-4 w-4 text-text-tertiary" aria-hidden="true" />
                <div>
                  <p className="text-[13px] text-text-secondary">运行时长</p>
                  <p className="mt-0.5 text-sm font-medium tabular-nums text-text-primary">
                    {uptimeMs !== undefined ? formatUptime(uptimeMs) : "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 网络接口 */}
          <Card>
            <CardHeader>
              <CardTitle>网络接口</CardTitle>
            </CardHeader>
            <CardContent>
              <TrafficStatsTable
                kind="interface"
                rows={interfaceRows}
                emptyMessage="当前 Surge 未返回网络接口统计数据"
              />
            </CardContent>
          </Card>

          {/* 连接器实时统计 */}
          <Card>
            <CardHeader>
              <CardTitle>连接器统计</CardTitle>
            </CardHeader>
            <CardContent>
              <TrafficStatsTable
                kind="connector"
                rows={connectorRows}
                emptyMessage="当前 Surge 未返回连接器流量统计数据"
              />
            </CardContent>
          </Card>

          {/* 流量趋势 — chart stays, KPI becomes a lightweight summary line */}
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>流量趋势</CardTitle>
                <p className="mt-0.5 text-xs text-text-tertiary">1 秒采样 · 保留最近 30 分钟</p>
              </div>
              <SegmentedControl<Range> label="时间范围" options={RANGES} value={range} onChange={setRange} />
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SummaryStat label="当前上传" value={formatBytes(summary?.uploadRate ?? 0) + "/s"} />
                <SummaryStat label="当前下载" value={formatBytes(summary?.downloadRate ?? 0) + "/s"} />
                <SummaryStat label="窗口上传" value={formatBytes(totals.upload)} />
                <SummaryStat label="窗口下载" value={formatBytes(totals.download)} />
              </div>
              {windowSamples.length === 0 ? (
                <div className="flex h-64 items-center justify-center text-sm text-text-tertiary">
                  正在等待实时流量样本…
                </div>
              ) : (
                <TrafficChart
                  series={windowSamples.map((s) => ({ time: s.time, upload: s.uploadRate, download: s.downloadRate }))}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/** Compact stat cell used above the trend chart (kept light on purpose). */
function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-border bg-elevated/40 px-3 py-2.5">
      <p className="text-xs text-text-tertiary">{label}</p>
      <p className="mt-0.5 text-[15px] font-semibold tabular-nums text-text-primary">{value}</p>
    </div>
  );
}
