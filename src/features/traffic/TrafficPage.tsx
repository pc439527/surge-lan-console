import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TrafficChart } from "@/features/traffic/TrafficChart";
import { useSurgeClientState } from "@/app/surge-client-context";
import { NoClientNotice } from "@/features/shared/NoClientNotice";
import { useTrafficQuery } from "@/features/shared/queries";
import { usePageVisible } from "@/hooks/use-page-visibility";
import { formatBytes } from "@/lib/format";

type Range = "1m" | "5m" | "15m" | "30m";

const RANGES: { value: Range; label: string }[] = [
  { value: "1m", label: "1 分钟" },
  { value: "5m", label: "5 分钟" },
  { value: "15m", label: "15 分钟" },
  { value: "30m", label: "30 分钟" },
];

const WINDOW_MS: Record<Range, number> = { "1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000 };

/** Task 09: always keep the last 30 minutes (1s sampling), UI filters on top. */
const MAX_POINTS = 1800;

interface TrafficSample {
  time: number;
  uploadRate: number;
  downloadRate: number;
  totalUpload: number;
  totalDownload: number;
}

export function TrafficPage() {
  const { client, connectionId } = useSurgeClientState();
  const traffic = useTrafficQuery();
  const visible = usePageVisible();
  const [range, setRange] = useState<Range>("5m");
  const [samples, setSamples] = useState<TrafficSample[]>([]);

  // Switching Surge instances must never mix charts (Fix 05).
  useEffect(() => {
    setSamples([]);
  }, [connectionId]);

  // Ring buffer: append while the tab is visible, cap at MAX_POINTS (30 min).
  // Hidden tabs stop appending (their Date.now() drifts anyway) — refetch on
  // return (plan §33).
  useEffect(() => {
    if (!traffic.data || !visible) return;
    setSamples((prev) => {
      const next = [
        ...prev,
        {
          time: Date.now(),
          uploadRate: traffic.data!.uploadRate,
          downloadRate: traffic.data!.downloadRate,
          totalUpload: traffic.data!.totalUpload,
          totalDownload: traffic.data!.totalDownload,
        },
      ];
      if (next.length > MAX_POINTS) {
        return next.slice(next.length - MAX_POINTS);
      }
      return next;
    });
  }, [traffic.data, connectionId, visible]);

  // UI filter: keep only points inside the selected window.
  const windowSamples = useMemo(() => {
    const cutoff = Date.now() - WINDOW_MS[range];
    return samples.filter((p) => p.time >= cutoff);
  }, [samples, range]);

  // Fix 09 / §35: window totals = last cumulative value − first cumulative value.
  const totals = useMemo(() => {
    if (windowSamples.length < 2) return { upload: 0, download: 0 };
    const first = windowSamples[0];
    const last = windowSamples[windowSamples.length - 1];
    return {
      upload: Math.max(0, last.totalUpload - first.totalUpload),
      download: Math.max(0, last.totalDownload - first.totalDownload),
    };
  }, [windowSamples]);

  if (!client) return <NoClientNotice page="Traffic" />;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold text-text-primary">Traffic</h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            上传 vs 下载 · 1 秒采样 · 保留最近 30 分钟
          </p>
        </div>
        <SegmentedControl<Range> label="时间范围" options={RANGES} value={range} onChange={setRange} />
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-[13px] text-text-secondary">当前上传</p>
          <p className="mt-2 text-[28px] font-semibold tabular-nums text-accent">{formatBytes(traffic.data?.uploadRate ?? 0)}/s</p>
        </Card>
        <Card className="p-4">
          <p className="text-[13px] text-text-secondary">当前下载</p>
          <p className="mt-2 text-[28px] font-semibold tabular-nums text-chart-download">{formatBytes(traffic.data?.downloadRate ?? 0)}/s</p>
        </Card>
        <Card className="p-4">
          <p className="text-[13px] text-text-secondary">窗口流量</p>
          <p className="mt-2 text-[28px] font-semibold tabular-nums text-text-primary">
            {formatBytes(totals.download)} <span className="text-sm font-normal text-text-tertiary">↓</span>{" "}
            {formatBytes(totals.upload)} <span className="text-sm font-normal text-text-tertiary">↑</span>
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>流量趋势</CardTitle>
        </CardHeader>
        <CardContent>
          {traffic.isLoading ? (
            <Skeleton className="h-80 w-full" />
          ) : (
            <TrafficChart series={windowSamples.map((s) => ({ time: s.time, upload: s.uploadRate, download: s.downloadRate }))} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
