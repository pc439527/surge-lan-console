import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Globe, Loader2, RefreshCw, Trash2, Zap } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
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
import { NoClientNotice } from "@/features/shared/NoClientNotice";
import { DataEmpty, ErrorStateView } from "@/components/data-state";
import { normalizeDns, type NormalizedDns } from "@/api/normalize";
import type { DnsCacheEntry, DnsLocalEntry } from "@/api/types";
import { cn } from "@/lib/cn";

/**
 * DNS (OPTIMIZATION_PLAN Task 06, §20–24).
 * Shows BOTH dynamic cache and local records (normalized via normalizeDns).
 * expiresTime is rendered defensively — its unit is not guaranteed across
 * platforms, so ambiguous values show "—" instead of a false "已过期".
 */

type Tab = "dynamic" | "local";

export function DnsPage() {
  const { client, connectionId } = useSurgeClientState();
  const surgeClient = useSurgeClient();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [domain, setDomain] = useState("");
  const [tab, setTab] = useState<Tab>("dynamic");

  const dnsQuery = useQuery<NormalizedDns>({
    queryKey: surgeKeys.dns(connectionId),
    queryFn: async () => normalizeDns(await surgeClient!.getDnsCache()),
    enabled: !!surgeClient,
    refetchInterval: 30_000,
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

  // PROJECT_SPEC §6.7 — DNS Test: POST /v1/test/dns_delay {domain}
  const dnsTest = useMutation({
    mutationFn: (d: string) => surgeClient!.testDnsDelay(d),
    onSuccess: () => toast.success("DNS 测试完成"),
    onError: () => toast.error("DNS 测试失败"),
  });

  const [search, setSearch] = useState("");

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

  if (!client) return <NoClientNotice page="DNS" />;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold text-text-primary">DNS</h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            动态缓存 {(dnsQuery.data?.dnsCache ?? []).length} · 本地记录 {(dnsQuery.data?.local ?? []).length}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: surgeKeys.dns(connectionId) })}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="h-3.5 w-3.5" />
            清除 DNS
          </Button>
        </div>
      </header>

      {/* T10: desktop = list (flexible) + test (fixed 300–340px); <1360px stacks. */}
      <div className="grid items-start gap-4 min-[1360px]:grid-cols-[minmax(0,1fr)_minmax(300px,340px)]">
        <Card className="min-w-0">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex rounded-sm border border-border bg-surface p-0.5">
                {([
                  { value: "dynamic", label: `动态缓存 ${dnsQuery.data?.dnsCache.length ?? 0}` },
                  { value: "local", label: `本地记录 ${dnsQuery.data?.local.length ?? 0}` },
                ] as { value: Tab; label: string }[]).map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTab(t.value)}
                    className={cn(
                      "rounded-xs px-3 py-1.5 text-xs font-medium transition-colors duration-hover",
                      tab === t.value ? "bg-accent/12 text-accent" : "text-text-secondary hover:text-text-primary",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="relative w-56">
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
                        {filteredCache.map((entry, i) => (
                          <DynamicRow key={`${entry.domain}-${i}`} entry={entry} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="space-y-2 md:hidden">
                    {filteredCache.map((entry, i) => (
                      <div key={`${entry.domain}-${i}`} className="rounded-sm border border-border bg-elevated/50 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text-primary">{entry.domain}</span>
                          <Badge variant="muted">{formatExpiry(entry.expiresTime)}</Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] text-text-tertiary">
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
                    {filteredLocal.map((entry, i) => (
                      <LocalRow key={`${entry.domain}-${i}`} entry={entry} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
          <p className="px-5 pb-4 pt-1 text-[11px] leading-relaxed text-text-tertiary">
            列含义：服务器 = DNS 解析来源（如 203.0.113.53）· 路径 = 解析链路 · 查询 = 单次解析耗时 · TTL = 缓存剩余时间。
          </p>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>DNS 测试</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-text-tertiary">
              对指定域名发起 DNS 解析延迟测试（POST /v1/test/dns_delay）。结果中数值小于 1 的按秒换算为毫秒显示。
            </p>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <Input
                className="pl-9"
                placeholder="example.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && domain.trim() && !dnsTest.isPending) {
                    dnsTest.mutate(domain.trim());
                  }
                }}
              />
            </div>
            <Button
              className="w-full"
              onClick={() => dnsTest.mutate(domain.trim())}
              disabled={!domain.trim() || dnsTest.isPending}
            >
              {dnsTest.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              测试延迟
            </Button>
            {dnsTest.data !== undefined && (
              <div className="rounded-sm border border-border bg-surface/60 p-3">
                <p className="mb-1 text-xs font-medium text-text-tertiary">结果</p>
                <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-text-primary">
                  {formatDnsResult(dnsTest.data)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>清除 DNS 缓存？</DialogTitle>
            <DialogDescription>
              这将清除设备上的所有 DNS 缓存条目，此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              取消
            </Button>
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

function DynamicRow({ entry }: { entry: DnsCacheEntry }) {
  return (
    <tr className="border-b border-border/50">
      <td className="px-3 py-2.5 text-[13px] text-text-primary">{entry.domain}</td>
      <td className="px-3 py-2.5">
        <div className="space-y-0.5">
          {(entry.data ?? []).map((ip, i) => (
            <span key={i} className="block font-mono text-xs text-text-secondary">{ip}</span>
          ))}
          {(entry.data ?? []).length === 0 && <span className="font-mono text-xs text-text-tertiary">—</span>}
        </div>
      </td>
      <td className="px-3 py-2.5 font-mono text-xs text-text-tertiary">{entry.server ?? "—"}</td>
      <td className="px-3 py-2.5 font-mono text-xs text-text-tertiary">{entry.path ?? "—"}</td>
      <td className="px-3 py-2.5 font-mono text-xs text-text-tertiary">
        {entry.timeCost === undefined ? "—" : `${entry.timeCost}ms`}
      </td>
      <td className="px-3 py-2.5">
        <Badge variant="muted">{formatExpiry(entry.expiresTime)}</Badge>
      </td>
    </tr>
  );
}

function LocalRow({ entry }: { entry: DnsLocalEntry }) {
  return (
    <tr className="border-b border-border/50">
      <td className="px-3 py-2.5 text-[13px] text-text-primary">{entry.domain ?? "—"}</td>
      <td className="px-3 py-2.5 font-mono text-xs text-text-secondary">{entry.data ?? "—"}</td>
      <td className="px-3 py-2.5 text-xs text-text-secondary">{entry.source ?? "—"}</td>
      <td className="px-3 py-2.5 font-mono text-xs text-text-tertiary">{entry.server ?? "—"}</td>
      <td className="px-3 py-2.5 text-xs text-text-tertiary">{entry.comment ?? "—"}</td>
    </tr>
  );
}

/**
 * expiresTime semantics are NOT guaranteed across platforms (epoch seconds /
 * milliseconds / TTL seconds). Until verified against the real device, render
 * "—" for anything ambiguous instead of falsely claiming "已过期" (§23).
 */
function formatExpiry(ts: number | undefined): string {
  if (ts === undefined || !Number.isFinite(ts)) return "—";
  const diff = ts - Date.now();
  if (diff <= 0) return "已过期";
  return Math.max(1, Math.round(diff / 1000)) + "s";
}

/**
 * 把 DNS 延迟探测结果渲染为可读文本（v0.3.0 解释化）。
 *
 * Surge 各平台返回的单位不一致：部分直接给毫秒，部分给秒（如 0.02324），
 * 甚至以字符串返回。规则：数值 < 1 视为秒，换算为毫秒显示；带单位字符串
 * （如 "23ms"）原样保留；无法解析的值返回 null 让调用方展示原文。
 */
function formatDnsResult(data: unknown): string {
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["latency", "delay"]) {
      const ms = latencyToMsText(obj[key]);
      if (ms !== null) return ms;
    }
    if (typeof obj.result === "string") {
      return latencyToMsText(obj.result) ?? obj.result;
    }
  }
  if (typeof data === "string") {
    return latencyToMsText(data) ?? data;
  }
  return JSON.stringify(data, null, 2);
}

function latencyToMsText(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1 ? `${Math.round(value * 1000)}ms` : `${Math.round(value)}ms`;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    const numeric = Number.parseFloat(trimmed);
    if (Number.isFinite(numeric)) {
      return numeric < 1 ? `${Math.round(numeric * 1000)}ms` : `${Math.round(numeric)}ms`;
    }
  }
  return null;
}