import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
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
import { ENDPOINTS } from "@/api/endpoints";
import type { DnsCacheEntry } from "@/api/types";
import { NoClientNotice } from "@/features/shared/NoClientNotice";

export function DnsPage() {
  const { client } = useSurgeClientState();
  const surgeClient = useSurgeClient();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const cacheQuery = useQuery<DnsCacheEntry[]>({
    queryKey: [ENDPOINTS.dns],
    queryFn: () => surgeClient!.getDnsCacheEntries(),
    enabled: !!surgeClient,
    refetchInterval: 30_000,
  });

  const flush = useMutation({
    mutationFn: () => surgeClient!.flushDns(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ENDPOINTS.dns] });
      toast.success("DNS 缓存已清除");
      setConfirmOpen(false);
    },
    onError: () => toast.error("清除 DNS 缓存失败"),
  });

  if (!client) return <NoClientNotice page="DNS" />;

  const entries = cacheQuery.data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold text-text-primary">DNS</h1>
          <p className="mt-0.5 text-sm text-text-secondary">缓存条目与延迟测试</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: [ENDPOINTS.dns] })}
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

      <Card>
        <CardHeader>
          <CardTitle>缓存</CardTitle>
        </CardHeader>
        <CardContent>
          {cacheQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left text-xs font-medium text-text-tertiary">域名</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-text-tertiary">IP</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-text-tertiary">服务器</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-text-tertiary">过期</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry, i) => (
                    <tr key={`${entry.domain}-${i}`} className="border-b border-border/50">
                      <td className="px-3 py-2.5 text-[13px] text-text-primary">{entry.domain}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-text-secondary">
                        {entry.data?.join(", ") ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-text-tertiary">{entry.server ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        <Badge variant="muted">
                          {formatExpiry(entry.expiresTime)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {entries.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-10 text-center text-sm text-text-tertiary">
                        DNS 缓存为空。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

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

function formatExpiry(ts: number): string {
  if (!ts) return "—";
  const diff = ts - Date.now();
  if (diff <= 0) return "已过期";
  return `${Math.max(1, Math.round(diff / 1000))}s`;
}
