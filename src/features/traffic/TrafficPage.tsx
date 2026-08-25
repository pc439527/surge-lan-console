import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { MetricStrip } from "@/components/ui/MetricStrip";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TrafficChart } from "@/features/traffic/TrafficChart";
import { TrafficStatsTable, type TrafficStatsRow } from "@/features/traffic/TrafficStatsTable";
import { DataEmpty, ErrorStateView } from "@/components/data-state";
import { useSurgeClientState } from "@/app/surge-client-context";
import { NoClientNotice } from "@/features/shared/NoClientNotice";
import { summarizeTraffic } from "@/api/surge-client";
import { useRawTrafficQuery, useTrafficAnalyticsQuery } from "@/features/shared/queries";
import { usePageVisible } from "@/hooks/use-page-visibility";
import { formatBytes, formatUptime } from "@/lib/format";
import { normalizeEpoch } from "@/api/normalize";
import { coreApi } from "@/lib/core-api";

type Range = "1m" | "5m" | "15m" | "30m";
type HistoryRange = "24h" | "7d" | "30d";

const RANGES: { value: Range; label: string }[] = [
  { value: "1m", label: "1 分钟" },
  { value: "5m", label: "5 分钟" },
  { value: "15m", label: "15 分钟" },
  { value: "30m", label: "30 分钟" },
];

const HISTORY_RANGES: { value: HistoryRange; label: string }[] = [
  { value: "24h", label: "24 小时" },
  { value: "7d", label: "7 天" },
  { value: "30d", label: "30 天" },
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
  const [historyRange, setHistoryRange] = useState<HistoryRange>("24h");
  const [historyRequested, setHistoryRequested] = useState(false);
  const [samples, setSamples] = useState<TrafficSample[]>([]);
  const history = useTrafficAnalyticsQuery(historyRange, historyRequested);
  const policyHistory = useQuery({
    queryKey: ["core", "analytics", "policy-traffic", connectionId, historyRange],
    queryFn: () => coreApi.getPolicyTrafficAnalytics(connectionId!, historyRange),
    enabled: historyRequested && !!connectionId,
    staleTime: 60_000,
  });

  useEffect(() => {
    setSamples([]);
    setHistoryRequested(false);
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

  const historySummary = useMemo(() => {
    const points = history.data?.points ?? [];
    return {
      upload: points.reduce((sum, point) => sum + point.uploadBytesDelta, 0),
      download: points.reduce((sum, point) => sum + point.downloadBytesDelta, 0),
      maxUpload: points.reduce((max, point) => Math.max(max, point.maxUploadRate), 0),
      maxDownload: points.reduce((max, point) => Math.max(max, point.maxDownloadRate), 0),
      samples: points.reduce((sum, point) => sum + point.sampleCount, 0),
      resolutionSeconds: points[0]?.bucketSeconds ?? (historyRange === "24h" ? 300 : 3600),
    };
  }, [history.data, historyRange]);

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
            : `启动于 ${formatStartTime(startTimeMs)} · 1 秒采样 · 实时窗口保留最近 30 分钟，长期历史由 Core SQLite 聚合保存`
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
              <TrafficStatsTable kind="interface" rows={interfaceRows} emptyMessage="当前 Surge 未返回网络接口统计数据" />
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
              <TrafficStatsTable kind="connector" rows={connectorRows} emptyMessage="当前 Surge 未返回连接器流量统计数据" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>实时流量趋势</CardTitle>
                <p className="mt-0.5 text-xs text-text-tertiary">浏览器 1 秒采样 · 切换时间窗口不会丢失已采集的 30 分钟缓存</p>
              </div>
              <SegmentedControl<Range> label="实时范围" options={RANGES} value={range} onChange={setRange} />
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
                <TrafficChart series={windowSamples.map((sample) => ({ time: sample.time, upload: sample.uploadRate, download: sample.downloadRate }))} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>历史流量趋势</CardTitle>
                <p className="mt-0.5 text-xs text-text-tertiary">Core 后台采集并写入 SQLite；24 小时使用 5 分钟桶，7/30 天使用 1 小时桶。</p>
              </div>
              {historyRequested ? (
                <SegmentedControl<HistoryRange> label="历史范围" options={HISTORY_RANGES} value={historyRange} onChange={setHistoryRange} />
              ) : (
                <Button size="sm" variant="secondary" onClick={() => setHistoryRequested(true)}>加载历史趋势</Button>
              )}
            </CardHeader>
            <CardContent>
              {!historyRequested ? (
                <div className="rounded-[14px] border border-dashed border-border px-4 py-8 text-center">
                  <p className="text-sm text-text-secondary">历史数据按需读取，不影响实时页面刷新。</p>
                  <p className="mt-1 text-xs text-text-tertiary">启用后可查看最近 24 小时、7 天与 30 天的持久化流量趋势。</p>
                </div>
              ) : history.isLoading ? (
                <Skeleton className="h-72 w-full" />
              ) : history.isError ? (
                <ErrorStateView error={history.error} api="/api/analytics/traffic" compact onRetry={() => history.refetch()} />
              ) : (history.data?.points.length ?? 0) === 0 ? (
                <DataEmpty title="暂无历史流量样本" description="Metrics Collector 会持续写入聚合数据；新部署需要先运行一段时间后才会形成历史趋势。" compact />
              ) : (
                <>
                  <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <SummaryStat label="历史上传" value={formatBytes(historySummary.upload)} />
                    <SummaryStat label="历史下载" value={formatBytes(historySummary.download)} />
                    <SummaryStat label="峰值上传" value={`${formatBytes(historySummary.maxUpload)}/s`} tone="upload" />
                    <SummaryStat label="峰值下载" value={`${formatBytes(historySummary.maxDownload)}/s`} tone="download" />
                  </div>
                  <TrafficChart series={(history.data?.points ?? []).map((point) => ({ time: new Date(point.bucketStart).getTime(), upload: point.avgUploadRate, download: point.avgDownloadRate }))} />
                  <p className="mt-3 text-xs text-text-tertiary">
                    {historySummary.samples} 个原始样本 · {historySummary.resolutionSeconds === 300 ? "5 分钟" : "1 小时"}聚合 · 图表展示平均速率，峰值与累计流量使用独立统计字段。
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Policy Traffic</CardTitle>
                <p className="mt-1 text-xs text-text-tertiary">来自 Surge /v1/metrics 的 per-policy 累计 counter；Core 按 5 分钟样本计算增量，并自动处理引擎重启归零。</p>
              </div>
              {historyRequested && <span className="shrink-0 text-xs text-text-tertiary">{historyRange === "24h" ? "24 小时" : historyRange === "7d" ? "7 天" : "30 天"}</span>}
            </CardHeader>
            <CardContent>
              {!historyRequested ? (
                <div className="rounded-[14px] border border-dashed border-border px-4 py-7 text-center">
                  <p className="text-sm text-text-secondary">加载上方历史趋势后，同时读取策略流量。</p>
                  <p className="mt-1 text-xs text-text-tertiary">支持 24 小时 / 7 天 / 30 天，与历史总流量共用时间范围。</p>
                </div>
              ) : !connectionId ? (
                <DataEmpty title="Policy Traffic 不适用于当前模式" description="需要已保存的 Core 连接才能读取历史策略流量。" compact />
              ) : policyHistory.isLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : policyHistory.isError ? (
                <ErrorStateView error={policyHistory.error} api="/api/analytics/policy-traffic" compact onRetry={() => policyHistory.refetch()} />
              ) : (policyHistory.data?.policies.length ?? 0) === 0 ? (
                <DataEmpty title="暂无 Policy Traffic" description="需要支持 /v1/metrics 的 Surge 版本，并至少形成两个 5 分钟 counter 样本后才能计算增量。" compact />
              ) : (
                <PolicyTrafficTable policies={policyHistory.data?.policies ?? []} />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function PolicyTrafficTable({ policies }: { policies: NonNullable<Awaited<ReturnType<typeof coreApi.getPolicyTrafficAnalytics>>["policies"]> }) {
  const grandTotal = policies.reduce((sum, policy) => sum + policy.totalBytes, 0);
  const max = Math.max(1, ...policies.map((policy) => policy.totalBytes));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse">
        <thead>
          <tr className="border-b border-border text-left text-xs text-text-tertiary">
            <th className="w-14 px-3 py-2.5 font-medium">#</th>
            <th className="px-3 py-2.5 font-medium">策略</th>
            <th className="px-3 py-2.5 text-right font-medium">下载</th>
            <th className="px-3 py-2.5 text-right font-medium">上传</th>
            <th className="px-3 py-2.5 text-right font-medium">总量</th>
            <th className="w-56 px-3 py-2.5 font-medium">占比</th>
          </tr>
        </thead>
        <tbody>
          {policies.slice(0, 50).map((policy, index) => {
            const share = grandTotal > 0 ? policy.totalBytes / grandTotal * 100 : 0;
            return (
              <tr key={policy.name} className="border-b border-border/45 text-[13px] last:border-b-0 hover:bg-elevated/35">
                <td className="px-3 py-3 font-mono text-xs text-text-tertiary">#{index + 1}</td>
                <td className="max-w-[280px] px-3 py-3 font-medium text-text-primary"><span className="block truncate" title={policy.name}>{policy.name}</span></td>
                <td className="px-3 py-3 text-right font-mono text-xs tabular-nums text-text-secondary">{formatBytes(policy.downloadBytes)}</td>
                <td className="px-3 py-3 text-right font-mono text-xs tabular-nums text-text-secondary">{formatBytes(policy.uploadBytes)}</td>
                <td className="px-3 py-3 text-right font-mono text-xs font-semibold tabular-nums text-text-primary">{formatBytes(policy.totalBytes)}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-border/50"><div className="h-full rounded-pill bg-accent" style={{ width: `${Math.max(1, policy.totalBytes / max * 100)}%` }} /></div>
                    <span className="w-12 text-right font-mono text-[10px] tabular-nums text-text-tertiary">{share.toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-text-tertiary">{policies.length} 个策略 · 区间总流量 {formatBytes(grandTotal)} · counter reset 已按新值重新累计。</p>
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
