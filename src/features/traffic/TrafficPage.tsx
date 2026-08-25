import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { MetricStrip } from "@/components/ui/MetricStrip";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TrafficChart } from "@/features/traffic/TrafficChart";
import { TrafficStatsTable, type TrafficStatsRow } from "@/features/traffic/TrafficStatsTable";
import { ErrorStateView } from "@/components/data-state";
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
const MAX_POINTS = 1800;

interface TrafficSample {
  time: number;
  uploadRate: number;
  downloadRate: number;
  totalUpload: number;
  totalDownload: number;
}

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

export function TrafficPage() {
  const { client, connectionId } = useSurgeClientState();
  const traffic = useRawTrafficQuery();
  const visible = usePageVisible();
  const [range, setRange] = useState<Range>("5m");
  const [samples, setSamples] = useState<TrafficSample[]>([]);

  useEffect(() => {
    setSamples([]);
  }, [connectionId]);

  useEffect(() => {
    if (!traffic.data || !visible) return;
    const summary = summarizeTraffic(traffic.data);
    setSamples((previous) => {
      const next = [
        ...previous,
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
    return samples.filter((sample) => sample.time >= cutoff);
  }, [samples, range]);

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
  const uptimeMs = startTimeMs !== undefined ? Math.max(0, Date.now() - startTimeMs) : undefined;

  const interfaceRows = useMemo<TrafficStatsRow[]>(
    () => Object.entries(traffic.data?.interface ?? {}).map(([name, stats]) => ({ name, ...stats })),
    [traffic.data],
  );

  const connectorRows = useMemo<TrafficStatsRow[]>(
    () => Object.entries(traffic.data?.connector ?? {}).map(([name, stats]) => ({ name, ...stats })),
    [traffic.data],
  );

  if (!client) return <NoClientNotice page="流量" />;

  const currentRate = (summary?.uploadRate ?? 0) + (summary?.downloadRate ?? 0);

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow="实时统计"
        title="流量"
        description={
          traffic.isLoading
            ? "正在读取 Surge 网络接口、策略连接器与实时流量数据…"
            : `启动于 ${formatStartTime(startTimeMs)} · 1 秒采样 · 最多保留最近 30 分钟`
        }
      />

      {traffic.isError ? (
        <Card>
          <CardContent>
            <ErrorStateView error={traffic.error} api="/v1/traffic" onRetry={() => traffic.refetch()} />
          </CardContent>
        </Card>
      ) : traffic.isLoading ? (
        <div className="space-y-5">
          <Skeleton className="h-28 w-full rounded-[16px]" />
          <Card><CardContent><Skeleton className="h-40 w-full" /></CardContent></Card>
          <Card><CardContent><Skeleton className="h-52 w-full" /></CardContent></Card>
          <Card><CardContent><Skeleton className="h-72 w-full" /></CardContent></Card>
        </div>
      ) : (
        <>
          <MetricStrip
            items={[
              { label: "运行时长", value: uptimeMs !== undefined ? formatUptime(uptimeMs) : "—", detail: "当前 Surge 会话", tone: "success" },
              { label: "网络接口", value: interfaceRows.length, detail: "interface", tone: "accent" },
              { label: "连接器", value: connectorRows.length, detail: "connector", tone: "accent" },
              { label: "当前总速率", value: `${formatBytes(currentRate)}/s`, detail: "上传 + 下载", tone: currentRate > 0 ? "success" : "muted" },
            ]}
          />

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>网络接口</CardTitle>
                <p className="mt-1 text-xs text-text-tertiary">设备接口的累计流量、当前速率与峰值速率。</p>
              </div>
              <span className="text-xs tabular-nums text-text-tertiary">{interfaceRows.length} 个接口</span>
            </CardHeader>
            <CardContent>
              <TrafficStatsTable
                kind="interface"
                rows={interfaceRows}
                emptyMessage="当前 Surge 未返回网络接口统计数据"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>连接器统计</CardTitle>
                <p className="mt-1 text-xs text-text-tertiary">按策略连接器查看累计与实时流量，便于识别主要出口。</p>
              </div>
              <span className="text-xs tabular-nums text-text-tertiary">{connectorRows.length} 个连接器</span>
            </CardHeader>
            <CardContent>
              <TrafficStatsTable
                kind="connector"
                rows={connectorRows}
                emptyMessage="当前 Surge 未返回连接器流量统计数据"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>流量趋势</CardTitle>
                <p className="mt-0.5 text-xs text-text-tertiary">1 秒采样 · 切换时间窗口不会丢失已采集的 30 分钟缓存</p>
              </div>
              <SegmentedControl<Range> label="时间范围" options={RANGES} value={range} onChange={setRange} />
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryStat label="当前上传" value={`${formatBytes(summary?.uploadRate ?? 0)}/s`} tone="upload" />
                <SummaryStat label="当前下载" value={`${formatBytes(summary?.downloadRate ?? 0)}/s`} tone="download" />
                <SummaryStat label="窗口上传" value={formatBytes(totals.upload)} />
                <SummaryStat label="窗口下载" value={formatBytes(totals.download)} />
              </div>
              {windowSamples.length === 0 ? (
                <div className="flex h-64 items-center justify-center text-sm text-text-tertiary">正在等待实时流量样本…</div>
              ) : (
                <TrafficChart
                  series={windowSamples.map((sample) => ({
                    time: sample.time,
                    upload: sample.uploadRate,
                    download: sample.downloadRate,
                  }))}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: string; tone?: "upload" | "download" }) {
  return (
    <div className="rounded-[12px] bg-surface-tertiary/55 px-3 py-2.5">
      <div className="flex items-center gap-2 text-xs text-text-tertiary">
        {tone && <span className={tone === "upload" ? "h-1.5 w-1.5 rounded-pill bg-chart-upload" : "h-1.5 w-1.5 rounded-pill bg-chart-download"} />}
        <span>{label}</span>
      </div>
      <p className="mt-1 text-[15px] font-semibold tabular-nums text-text-primary">{value}</p>
    </div>
  );
}
