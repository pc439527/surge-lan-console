import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { coreApi, type UpdateCheck } from "@/lib/core-api";
import { BUILD_INFO } from "@/lib/version";

const CURRENT_BUILD = {
  version: BUILD_INFO.version,
  commit: BUILD_INFO.commit,
  branch: BUILD_INFO.branch,
};
const QUERY_KEY = ["core", "update-check", CURRENT_BUILD.version, CURRENT_BUILD.commit, CURRENT_BUILD.branch] as const;

export function UpdateCheckCard() {
  const queryClient = useQueryClient();
  const update = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => coreApi.checkForUpdates(CURRENT_BUILD),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const refresh = useMutation({
    mutationFn: () => coreApi.checkForUpdates(CURRENT_BUILD, true),
    onSuccess: (result) => queryClient.setQueryData(QUERY_KEY, result),
  });

  const result = refresh.data ?? update.data;
  const pending = update.isLoading || refresh.isPending;
  const failed = update.isError || refresh.isError;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Console 更新</CardTitle>
          <p className="mt-1 text-xs leading-5 text-text-tertiary">由 Core 服务端检查；私有仓库 Token 不进入浏览器或 SQLite。</p>
        </div>
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => refresh.mutate()}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          检查更新
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {result ? <UpdateResult result={result} /> : failed ? (
          <div className="rounded-[12px] border border-danger/20 bg-danger/[0.04] px-3 py-2.5">
            <Badge variant="danger">检查失败</Badge>
            <p className="mt-2 text-xs leading-5 text-text-tertiary">无法连接 Core Update Check，请稍后重试。</p>
          </div>
        ) : (
          <p className="py-2 text-sm text-text-secondary">正在读取更新状态…</p>
        )}
      </CardContent>
    </Card>
  );
}

function UpdateResult({ result }: { result: UpdateCheck }) {
  const meta = statusMeta(result.status);
  const latestVersion = result.latest?.version ? `v${result.latest.version}` : null;
  const latestCommit = result.latest?.commit ? shortCommit(result.latest.commit) : null;
  return (
    <>
      <div className="rounded-[12px] border border-border/55 bg-surface-tertiary/35 px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant={meta.variant}>{meta.label}</Badge>
          <span className="text-[10px] text-text-tertiary">{sourceLabel(result.source)}</span>
        </div>
        <p className="mt-2 text-xs leading-5 text-text-secondary">{result.message}</p>
      </div>

      {result.latest && (
        <div className="space-y-1.5 text-xs">
          <InfoRow label="Latest" value={[latestVersion, latestCommit].filter(Boolean).join(" · ") || "—"} mono />
          <InfoRow label="Branch" value={result.latest.branch || "—"} mono />
          {result.latest.publishedAt && <InfoRow label="Remote time" value={formatTime(result.latest.publishedAt)} />}
        </div>
      )}

      {result.checkedAt && <p className="text-[10px] text-text-tertiary">最后检查：{formatTime(result.checkedAt)}</p>}

      {result.status === "update-available" && result.latest?.url && (
        <Button size="sm" variant="secondary" className="w-full" asChild>
          <a href={result.latest.url} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />查看远端版本
          </a>
        </Button>
      )}

      {result.status === "unconfigured" && (
        <p className="text-[10px] leading-4 text-text-tertiary">
          可配置 SLC_UPDATE_GITHUB_REPO + SLC_UPDATE_GITHUB_TOKEN，或 SLC_UPDATE_MANIFEST_URL；环境变量不会写入数据库。
        </p>
      )}
    </>
  );
}

function statusMeta(status: UpdateCheck["status"]): { label: string; variant: "success" | "warning" | "muted" | "info" | "danger" } {
  if (status === "current") return { label: "已是最新", variant: "success" };
  if (status === "update-available") return { label: "有可用更新", variant: "warning" };
  if (status === "unconfigured") return { label: "更新源未配置", variant: "muted" };
  if (status === "unknown") return { label: "无法比较", variant: "info" };
  return { label: "检查失败", variant: "danger" };
}

function sourceLabel(source: UpdateCheck["source"]): string {
  if (source === "github") return "GitHub";
  if (source === "manifest") return "Manifest";
  return "未配置";
}

function shortCommit(value: string): string {
  return value.length > 10 ? value.slice(0, 10) : value;
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-text-tertiary">{label}</span>
      <span className={`min-w-0 truncate text-right text-text-primary ${mono ? "font-mono text-[11px]" : ""}`}>{value}</span>
    </div>
  );
}
