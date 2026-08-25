import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Globe, Loader2, RefreshCw, Trash2, Zap } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricStrip } from "@/components/ui/MetricStrip";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { useSurgeClient, useSurgeClientState } from "@/app/surge-client-context";
import { surgeKeys } from "@/lib/surge-keys";
import { coreApi, type DnsTrendPoint, type HealthAnalyticsRange } from "@/lib/core-api";
import { NoClientNotice } from "@/features/shared/NoClientNotice";
import { DataEmpty, ErrorStateView } from "@/components/data-state";
import { normalizeDns, type NormalizedDns } from "@/api/normalize";
import type { DnsCacheEntry, DnsLocalEntry } from "@/api/types";
import { cn } from "@/lib/cn";

type Tab = "dynamic" | "local";

export function DnsPage() {
  const { client, connectionId } = useSurgeClientState();
  const surgeClient = useSurgeClient();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [domain, setDomain] = useState("");
  const [testedDomain, setTestedDomain] = useState("");
  const [tab, setTab] = useState<Tab>("dynamic");
  const [search, setSearch] = useState("");
  const [historyRange, setHistoryRange] = useState<HealthAnalyticsRange>("24h");

  const dnsQuery = useQuery<NormalizedDns>({
    queryKey: surgeKeys.dns(connectionId),
    queryFn: async () => normalizeDns(await surgeClient!.getDnsCache()),
    enabled: !!surgeClient,
    refetchInterval: 30_000,
  });

  const dnsHistory = useQuery({
    queryKey: ["core", "analytics", "dns", connectionId, historyRange],
    queryFn: () => coreApi.getDnsAnalytics(connectionId!, historyRange),
    enabled: !!client && !!connectionId,
    staleTime: 60_000,
  });

  const flush = useMutation({
    mutationFn: () => surgeClient!.flushDns(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: surgeKeys.dns(connectionId) });
      toast.success("DNS 缓存已清除");
      setConfirmOpen(false);
    },
    onError: () => toast.error("清除 DNS 缓存失败"),
  });

  const dnsTest = useMutation({
    mutationFn: (d: string) => surgeClient!.testDnsDelay(d),
    onSuccess: (_data, variables) => {
      setTestedDomain(variables);
      toast.success("DNS 测试完成");
    },
    onError: () => toast.error("DNS 测试失败"),
  });

  const filteredCache = useMemo(() => {
    const q = search.trim().toLowerCase();
    const entries = dnsQuery.data?.dnsCache ?? [];
    if (!q) return entries;
    return entries.filter((e) => e.domain.toLowerCase().includes(q) || (e.data ?? []).some((d) => d.toLowerCase().includes(q)));
  }, [dnsQuery.data, search]);

  const filteredLocal = useMemo(() => {
    const q = search.trim().toLowerCase();
    const entries = dnsQuery.data?.local ?? [];
    if (!q) return entries;
    return entries.filter((e) => (e.domain ?? "").toLowerCase().includes(q) || (e.data ?? "").toLowerCase().includes(q));
  }, [dnsQuery.data, search]);

  const serverCount = useMemo(() => {
    const servers = new Set<string>();
    for (const entry of dnsQuery.data?.dnsCache ?? []) if (entry.server) servers.add(entry.server);
    for (const entry of dnsQuery.data?.local ?? []) if (entry.server) servers.add(entry.server);
    return servers.size;
  }, [dnsQuery.data]);

  if (!client) return <NoClientNotice page="DNS" />;

  const latestTest = dnsTest.data !== undefined ? formatDnsResult(dnsTest.data) : "—";

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        title="DNS"
        description="查看动态缓存、本地记录和解析链路，并结合后台采样分析 DNS 延迟趋势。"
        actions={(
          <>
            <Button variant="secondary" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: surgeKeys.dns(connectionId) })}>
              <RefreshCw className="h-3.5 w-3.5" />
              刷新
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setConfirmOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              清除缓存
            </Button>
          </>
        )}
      />

      <MetricStrip
        items={[
          { label: "动态缓存", value: dnsQuery.data?.dnsCache.length ?? 0, detail: "缓存条目", tone: "accent" },
          { label: "本地记录", value: dnsQuery.data?.local.length ?? 0, detail: "静态映射", tone: "muted" },
          { label: "DNS 服务器", value: serverCount, detail: "当前可见来源", tone: serverCount > 0 ? "success" : "muted" },
          { label: "最近测试", value: latestTest, detail: testedDomain || "尚未执行", tone: dnsTest.data !== undefined ? "success" : "muted" },
        ]}
      />

      <DnsTrendCard
        points={dnsHistory.data?.points ?? []}
        loading={dnsHistory.isLoading}
        error={dnsHistory.isError ? dnsHistory.error : null}
        range={historyRange}
        onRangeChange={setHistoryRange}
        onRetry={() => dnsHistory.refetch()}
      />

      <div className="grid items-start gap-4 min-[1360px]:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="space-y-3 pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex rounded-[12px] border border-border bg-surface p-0.5">
                {([
                  { value: "dynamic", label: `动态缓存 ${dnsQuery.data?.dnsCache.length ?? 0}` },
                  { value: "local", label: `本地记录 ${dnsQuery.data?.local.length ?? 0}` },
                ] as { value: Tab; label: string }[]).map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTab(t.value)}
                    className={cn(
                      "touch-target rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors duration-hover",
                      tab === t.value ? "bg-accent/12 text-accent" : "text-text-secondary hover:text-text-primary",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="relative w-full sm:w-64">
                <Globe className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
                <Input className="pl-8" placeholder="搜索域名或 IP…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {dnsQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            ) : dnsQuery.isError ? (
              <ErrorStateView error={dnsQuery.error} api="/v1/dns" compact onRetry={() => dnsQuery.refetch()} />
            ) : tab === "dynamic" ? (
              filteredCache.length === 0 ? (
                <DataEmpty title="动态缓存为空" description="当前 Surge 实例没有返回缓存条目。" compact />
              ) : (
                <>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="px-3 py-2 text-left text-xs font-medium text-text-tertiary">域名</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-text-tertiary">IP</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-text-tertiary">服务器</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-text-tertiary">路径</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-text-tertiary">查询</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-text-tertiary">TTL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCache.map((entry, i) => <DynamicRow key={`${entry.domain}-${i}`} entry={entry} />)}
                      </tbody>
                    </table>
                  </div>
                  <div className="space-y-2 md:hidden">
                    {filteredCache.map((entry, i) => (
                      <div key={`${entry.domain}-${i}`} className="rounded-[14px] bg-elevated/55 px-3 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text-primary">{entry.domain}</span>
                          <Badge variant="muted">{formatExpiry(entry.expiresTime)}</Badge>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-text-tertiary">
                          <span>{(entry.data ?? []).join(", ") || "—"}</span>
                          {entry.server && <span>· {entry.server}</span>}
                          {entry.timeCost !== undefined && <span>· {entry.timeCost}ms</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )
            ) : filteredLocal.length === 0 ? (
              <DataEmpty title="没有本地记录" description="当前配置没有本地 DNS 映射（/etc/hosts 或 Surge local DNS）。" compact />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-3 py-2 text-left text-xs font-medium text-text-tertiary">域名</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-text-tertiary">地址</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-text-tertiary">来源</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-text-tertiary">DNS</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-text-tertiary">注释</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLocal.map((entry, i) => <LocalRow key={`${entry.domain}-${i}`} entry={entry} />)}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
          <p className="px-5 pb-4 pt-1 text-xs leading-relaxed text-text-tertiary">
            服务器 = DNS 解析来源 · 路径 = 解析链路 · 查询 = 单次解析耗时 · TTL = 缓存剩余时间。
          </p>
        </Card>

        <Card className="lg:sticky lg:top-24">
          <CardHeader className="pb-2">
            <CardTitle className="text-[17px]">解析诊断</CardTitle>
            <p className="text-xs leading-relaxed text-text-tertiary">
              对指定域名调用 POST /v1/test/dns_delay。返回结果会先转换成可读延迟，不直接展示难读的原始对象。
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <Input
                className="pl-9"
                placeholder="example.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && domain.trim() && !dnsTest.isPending) dnsTest.mutate(domain.trim());
                }}
              />
            </div>
            <Button className="w-full" onClick={() => dnsTest.mutate(domain.trim())} disabled={!domain.trim() || dnsTest.isPending}>
              {dnsTest.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              {dnsTest.isPending ? "测试中…" : "测试 DNS 延迟"}
            </Button>

            {dnsTest.data !== undefined ? (
              <div className="rounded-[14px] bg-surface-tertiary/55 p-3.5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    测试完成
                  </div>
                  <Badge variant="success">成功</Badge>
                </div>
                <div className="divide-y divide-border/50">
                  <DiagnosticRow label="域名" value={testedDomain || domain.trim() || "—"} mono />
                  <DiagnosticRow label="结果" value={formatDnsResult(dnsTest.data)} mono highlight />
                  <DiagnosticRow label="接口" value="POST /v1/test/dns_delay" mono />
                </div>
              </div>
            ) : (
              <div className="rounded-[14px] border border-dashed border-border px-4 py-6 text-center">
                <p className="text-sm text-text-secondary">尚未执行 DNS 测试</p>
                <p className="mt-1 text-xs text-text-tertiary">输入域名后即可查看解析延迟。</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>清除 DNS 缓存？</DialogTitle>
            <DialogDescription>这将清除设备上的所有 DNS 缓存条目，此操作不可撤销。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={() => flush.mutate()} disabled={flush.isPending}>
              {flush.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              清除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DnsTrendCard({
  points,
  loading,
  error,
  range,
  onRangeChange,
  onRetry,
}: {
  points: DnsTrendPoint[];
  loading: boolean;
  error: unknown;
  range: HealthAnalyticsRange;
  onRangeChange: (range: HealthAnalyticsRange) => void;
  onRetry: () => void;
}) {
  const values = points.map((point) => point.delayMs);
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const p95 = percentile(values, 0.95);
  const peak = values.length ? Math.max(...values) : null;
  const latest = points.at(-1);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>DNS 延迟趋势</CardTitle>
          <p className="mt-1 text-xs text-text-tertiary">后台 DNS Health Check 的真实 `/v1/test/dns_delay` 结果，不是 Core→Surge API RTT。</p>
        </div>
        <div className="flex rounded-[12px] border border-border bg-surface p-0.5">
          {(["24h", "7d"] as HealthAnalyticsRange[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onRangeChange(value)}
              className={cn(
                "touch-target rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors duration-hover",
                range === value ? "bg-accent/12 text-accent" : "text-text-secondary hover:text-text-primary",
              )}
            >
              {value === "24h" ? "24 小时" : "7 天"}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-36 w-full" />
        ) : error ? (
          <ErrorStateView error={error} api="/api/analytics/dns" compact onRetry={onRetry} />
        ) : points.length === 0 ? (
          <DataEmpty title="暂无 DNS 历史数据" description="等待后台 DNS Health Check 产生采样后，这里会显示延迟趋势。" compact />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 rounded-[14px] border border-border/55 bg-surface-tertiary/20 p-3">
              <DnsSparkline points={points} />
              <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-text-tertiary">
                <span>{new Date(points[0]!.sampledAt).toLocaleString()}</span>
                <span>{new Date(latest!.sampledAt).toLocaleString()}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
              <TrendMetric label="平均" value={average === null ? "—" : `${Math.round(average)}ms`} />
              <TrendMetric label="P95" value={p95 === null ? "—" : `${Math.round(p95)}ms`} />
              <TrendMetric label="峰值" value={peak === null ? "—" : `${Math.round(peak)}ms`} />
              <TrendMetric label="采样" value={String(points.length)} detail={latest?.domain ?? "—"} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DnsSparkline({ points }: { points: DnsTrendPoint[] }) {
  const values = points.map((point) => point.delayMs);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(1, max - min);
  const coordinates = points.map((point, index) => {
    const x = points.length === 1 ? 50 : index / (points.length - 1) * 100;
    const y = 29 - ((point.delayMs - min) / span) * 26;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  const latest = points.at(-1)!;

  return (
    <div className="text-accent" role="img" aria-label={`DNS 延迟趋势，共 ${points.length} 个采样，最近 ${Math.round(latest.delayMs)} 毫秒`}>
      <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-28 w-full overflow-visible">
        <line x1="0" y1="29" x2="100" y2="29" stroke="currentColor" strokeOpacity="0.12" vectorEffect="non-scaling-stroke" />
        <polyline points={coordinates} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

function TrendMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-[12px] bg-surface-tertiary/45 px-3 py-2.5">
      <p className="text-[10px] text-text-tertiary">{label}</p>
      <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-text-primary">{value}</p>
      {detail && <p className="mt-0.5 truncate text-[10px] text-text-tertiary">{detail}</p>}
    </div>
  );
}

function DiagnosticRow({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <span className="shrink-0 text-xs text-text-secondary">{label}</span>
      <span className={cn("min-w-0 break-all text-right text-[13px] text-text-primary", mono && "font-mono text-xs", highlight && "font-semibold text-success")}>{value}</span>
    </div>
  );
}

function DynamicRow({ entry }: { entry: DnsCacheEntry }) {
  return (
    <tr className="border-b border-border/50 last:border-b-0 hover:bg-elevated/35">
      <td className="px-3 py-2.5 text-[13px] text-text-primary">{entry.domain}</td>
      <td className="px-3 py-2.5">
        <div className="space-y-0.5">
          {(entry.data ?? []).map((ip, i) => <span key={i} className="block font-mono text-xs text-text-secondary">{ip}</span>)}
          {(entry.data ?? []).length === 0 && <span className="font-mono text-xs text-text-tertiary">—</span>}
        </div>
      </td>
      <td className="px-3 py-2.5 font-mono text-xs text-text-tertiary">{entry.server ?? "—"}</td>
      <td className="px-3 py-2.5 font-mono text-xs text-text-tertiary">{entry.path ?? "—"}</td>
      <td className="px-3 py-2.5 font-mono text-xs text-text-tertiary">{entry.timeCost === undefined ? "—" : `${entry.timeCost}ms`}</td>
      <td className="px-3 py-2.5"><Badge variant="muted">{formatExpiry(entry.expiresTime)}</Badge></td>
    </tr>
  );
}

function LocalRow({ entry }: { entry: DnsLocalEntry }) {
  return (
    <tr className="border-b border-border/50 last:border-b-0 hover:bg-elevated/35">
      <td className="px-3 py-2.5 text-[13px] text-text-primary">{entry.domain ?? "—"}</td>
      <td className="px-3 py-2.5 font-mono text-xs text-text-secondary">{entry.data ?? "—"}</td>
      <td className="px-3 py-2.5 text-xs text-text-secondary">{entry.source ?? "—"}</td>
      <td className="px-3 py-2.5 font-mono text-xs text-text-tertiary">{entry.server ?? "—"}</td>
      <td className="px-3 py-2.5 text-xs text-text-tertiary">{entry.comment ?? "—"}</td>
    </tr>
  );
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(percentileValue * sorted.length) - 1));
  return sorted[index] ?? null;
}

function formatExpiry(ts: number | undefined): string {
  if (ts === undefined || !Number.isFinite(ts)) return "—";
  const diff = ts - Date.now();
  if (diff <= 0) return "已过期";
  return Math.max(1, Math.round(diff / 1000)) + "s";
}

function formatDnsResult(data: unknown): string {
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["latency", "delay"]) {
      const ms = latencyToMsText(obj[key]);
      if (ms !== null) return ms;
    }
    if (typeof obj.result === "string") return latencyToMsText(obj.result) ?? obj.result;
  }
  if (typeof data === "string") return latencyToMsText(data) ?? data;
  return JSON.stringify(data, null, 2);
}

function latencyToMsText(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1 ? `${Math.round(value * 1000)}ms` : `${Math.round(value)}ms`;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    const numeric = Number.parseFloat(trimmed);
    if (Number.isFinite(numeric)) return numeric < 1 ? `${Math.round(numeric * 1000)}ms` : `${Math.round(numeric)}ms`;
  }
  return null;
}
