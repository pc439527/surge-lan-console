import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TrafficChart } from "@/features/traffic/TrafficChart";
import { useSurgeClientState } from "@/app/surge-client-context";
import { NoClientNotice } from "@/features/shared/NoClientNotice";
import { useTrafficQuery } from "@/features/dashboard/dashboard-queries";
import { formatBytes } from "@/lib/format";

type Range = "1m" | "5m" | "15m" | "30m";

const RANGES: { value: Range; label: string }[] = [
  { value: "1m", label: "1 分钟" },
  { value: "5m", label: "5 分钟" },
  { value: "15m", label: "15 分钟" },
  { value: "30m", label: "30 分钟" },
];

const WINDOW_SECONDS: Record<Range, number> = { "1m": 60, "5m": 300, "15m": 900, "30m": 1800 };

export function TrafficPage() {
  const { client } = useSurgeClientState();
  const traffic = useTrafficQuery();
  const [range, setRange] = useState<Range>("5m");
  const [samples, setSamples] = useState<{ time: number; upload: number; download: number }[]>([]);

  // 1s sampling with a rolling window of the selected range
  useEffect(() => {
    if (!traffic.data) return;
    const windowMs = WINDOW_SECONDS[range] * 1000;
    setSamples((prev) => {
      const next = [
        ...prev,
        { time: Date.now(), upload: traffic.data!.uploadRate, download: traffic.data!.downloadRate },
      ];
      const cutoff = Date.now() - windowMs;
      return next.filter((p) => p.time >= cutoff);
    });
  }, [traffic.data, range]);

  const totals = useMemo(
    () =>
      samples.reduce(
        (acc, p) => ({ upload: acc.upload + p.upload, download: acc.download + p.download }),
        { upload: 0, download: 0 },
      ),
    [samples],
  );

  if (!client) return <NoClientNotice page="Traffic" />;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold text-text-primary">Traffic</h1>
          <p className="mt-0.5 text-sm text-text-secondary">上传 vs 下载 · 1 秒采样</p>
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
          <p className="mt-2 text-[28px] font-semibold tabular-nums text-[#bf5af2]">{formatBytes(traffic.data?.downloadRate ?? 0)}/s</p>
        </Card>
        <Card className="p-4">
          <p className="text-[13px] text-text-secondary">窗口总量</p>
          <p className="mt-2 text-[28px] font-semibold tabular-nums text-text-primary">
            {formatBytes(totals.download)}
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
            <TrafficChart series={samples} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}