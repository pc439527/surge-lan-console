import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import CodeMirror from "@uiw/react-codemirror";
import { StreamLanguage } from "@codemirror/language";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { toast } from "sonner";
import { GitCompare, History, Loader2, RefreshCw, Save } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { DataEmpty, ErrorStateView } from "@/components/data-state";
import { useSurgeClient, useSurgeClientState } from "@/app/surge-client-context";
import { surgeKeys } from "@/lib/surge-keys";
import { SurgeClient } from "@/api/surge-client";
import type { ProfileInfo } from "@/api/types";
import { surgeDarkTheme, surgeLightTheme } from "@/lib/codemirror-theme";
import { useResolvedTheme } from "@/lib/theme";
import { NoClientNotice } from "@/features/shared/NoClientNotice";
import { CoreApiError, coreApi, type ProfileSnapshot } from "@/lib/core-api";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";

function historyKey(connectionId: string | null) {
  return ["core", "profile-history", connectionId] as const;
}

export function ConfigurationPage() {
  const { client, connectionId } = useSurgeClientState();
  const surgeClient = useSurgeClient();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const profileQuery = useQuery<ProfileInfo | string>({
    queryKey: surgeKeys.profile(connectionId),
    queryFn: () => surgeClient!.getCurrentProfile(false),
    enabled: !!surgeClient,
    staleTime: Infinity,
  });

  const historyQuery = useQuery({
    queryKey: historyKey(connectionId),
    queryFn: () => coreApi.listProfileSnapshots(connectionId!, 100),
    enabled: Boolean(connectionId),
    staleTime: 30_000,
  });

  const resolvedTheme = useResolvedTheme();

  const capture = useMutation({
    mutationFn: () => coreApi.captureProfileSnapshot(connectionId!),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: historyKey(connectionId) });
      toast.success(result.created ? "已创建配置快照" : "配置未变化，已复用现有快照");
    },
    onError: (error) => toast.error(error instanceof CoreApiError ? error.message : "创建配置快照失败"),
  });

  const reload = useMutation({
    mutationFn: async () => {
      await surgeClient!.reloadProfile();
      try {
        const snapshot = await coreApi.captureProfileSnapshot(connectionId!);
        return { snapshot, snapshotError: false };
      } catch {
        return { snapshot: null, snapshotError: true };
      }
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: surgeKeys.profile(connectionId) }),
        queryClient.invalidateQueries({ queryKey: historyKey(connectionId) }),
      ]);
      toast.success("配置文件已重新加载");
      if (result.snapshotError) toast.warning("重新加载成功，但配置历史快照创建失败");
    },
    onError: () => toast.error("重新加载配置失败"),
  });

  const selectedSnapshots = useMemo(() => {
    const snapshots = historyQuery.data ?? [];
    return selectedIds
      .map((id) => snapshots.find((item) => item.id === id))
      .filter((item): item is ProfileSnapshot => Boolean(item))
      .sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());
  }, [historyQuery.data, selectedIds]);

  const diff = useMutation({
    mutationFn: async () => {
      if (selectedSnapshots.length !== 2) throw new Error("请选择两个版本");
      return coreApi.diffProfileSnapshots(connectionId!, selectedSnapshots[0].id, selectedSnapshots[1].id);
    },
    onError: (error) => toast.error(error instanceof CoreApiError ? error.message : "配置版本比较失败"),
  });

  const toggleSnapshot = (id: string) => {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 2) return [current[1], id];
      return [...current, id];
    });
    diff.reset();
  };

  if (!client) return <NoClientNotice page="配置" />;

  const profileText = profileQuery.data ? SurgeClient.profileText(profileQuery.data) : "";
  const profileName =
    typeof profileQuery.data === "object" && profileQuery.data
      ? profileQuery.data.name
      : "Profile.conf";

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow="Surge"
        title="配置"
        description={
          profileQuery.isLoading
            ? "正在读取当前配置文件…"
            : profileQuery.isError
              ? "当前配置读取失败，请查看下方错误信息。"
              : `${profileName} · 只读查看 · 敏感字段已隐藏`
        }
        actions={(
          <>
            <Button variant="secondary" size="sm" onClick={() => capture.mutate()} disabled={capture.isPending || !connectionId}>
              {capture.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              创建快照
            </Button>
            <Button variant="secondary" size="sm" onClick={() => reload.mutate()} disabled={reload.isPending}>
              {reload.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              重新加载
            </Button>
          </>
        )}
      />

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between gap-4 border-b border-border/55 pb-4">
          <div className="min-w-0">
            <CardTitle className="truncate">{profileQuery.isLoading ? "当前配置" : profileName}</CardTitle>
            <p className="mt-1 text-xs text-text-tertiary">来源：/v1/profiles/current · sensitive=0</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="muted">只读</Badge>
            {profileQuery.isSuccess ? (
              <Badge variant="success">敏感字段已隐藏</Badge>
            ) : profileQuery.isError ? (
              <Badge variant="danger">读取失败</Badge>
            ) : (
              <Badge variant="muted">读取中</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {profileQuery.isLoading ? (
            <div className="p-5"><Skeleton className="h-[520px] w-full" /></div>
          ) : profileQuery.isError ? (
            <ErrorStateView
              error={profileQuery.error}
              api="/v1/profiles/current"
              onRetry={() => profileQuery.refetch()}
            />
          ) : (
            <CodeMirror
              value={profileText}
              extensions={[StreamLanguage.define(properties)]}
              height="clamp(500px, calc(100vh - 220px), 820px)"
              readOnly
              theme={resolvedTheme === "dark" ? surgeDarkTheme : surgeLightTheme}
              basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true }}
              style={{
                fontSize: 12,
                fontFamily: "SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                color: "var(--text-primary)",
                backgroundColor: "transparent",
              }}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2"><History className="h-4 w-4 text-text-secondary" /><CardTitle>配置历史</CardTitle></div>
            <p className="mt-1 text-xs text-text-tertiary">只保存 sensitive=0 的脱敏配置；SHA-256 相同的内容不会重复写入 SQLite。后台默认每 6 小时检查一次。</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="muted">{historyQuery.data?.length ?? 0} 个版本</Badge>
            <Button size="sm" variant="secondary" disabled={selectedSnapshots.length !== 2 || diff.isPending} onClick={() => diff.mutate()}>
              {diff.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitCompare className="h-3.5 w-3.5" />}
              比较选中版本
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {historyQuery.isLoading ? (
            <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
          ) : historyQuery.isError ? (
            <ErrorStateView error={historyQuery.error} api="/api/profile-history" compact onRetry={() => historyQuery.refetch()} />
          ) : (historyQuery.data?.length ?? 0) === 0 ? (
            <DataEmpty title="尚无配置历史" description="点击“创建快照”，或等待后台配置快照任务首次执行。" compact />
          ) : (
            <div className="divide-y divide-border/50">
              {(historyQuery.data ?? []).map((snapshot) => {
                const selected = selectedIds.includes(snapshot.id);
                return (
                  <button
                    key={snapshot.id}
                    type="button"
                    onClick={() => toggleSnapshot(snapshot.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[12px] px-2.5 py-3 text-left transition-colors hover:bg-elevated/45",
                      selected && "bg-accent/8 ring-1 ring-inset ring-accent/25",
                    )}
                  >
                    <span className={cn("h-4 w-4 shrink-0 rounded-[5px] border", selected ? "border-accent bg-accent" : "border-border bg-surface")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-text-primary">{snapshot.profileName}</span>
                        <SourceBadge source={snapshot.source} />
                      </span>
                      <span className="mt-1 block font-mono text-[10px] text-text-tertiary">SHA-256 {snapshot.sha256.slice(0, 16)}…</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-xs text-text-secondary">{new Date(snapshot.capturedAt).toLocaleString()}</span>
                      <span className="mt-1 block text-[10px] text-text-tertiary">{formatBytes(snapshot.sizeBytes)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {diff.data && (
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2"><GitCompare className="h-4 w-4 text-text-secondary" /><CardTitle>版本差异</CardTitle></div>
              <p className="mt-1 text-xs text-text-tertiary">
                {new Date(diff.data.from.capturedAt).toLocaleString()} → {new Date(diff.data.to.capturedAt).toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="danger">-{diff.data.removedLines}</Badge>
              <Badge variant="success">+{diff.data.addedLines}</Badge>
              {diff.data.truncated && <Badge variant="warning">内容已截断</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            {!diff.data.changed ? (
              <DataEmpty title="两个版本内容一致" description="SHA 或捕获来源可能不同，但脱敏配置文本没有差异。" compact />
            ) : (
              <div className="space-y-4">
                {diff.data.chunks.map((chunk, index) => (
                  <div key={`${chunk.oldStartLine}-${chunk.newStartLine}-${index}`} className="grid gap-3 lg:grid-cols-2">
                    <DiffBlock title={`旧版本 · 第 ${chunk.oldStartLine} 行起`} marker="-" lines={chunk.removed} tone="removed" />
                    <DiffBlock title={`新版本 · 第 ${chunk.newStartLine} 行起`} marker="+" lines={chunk.added} tone="added" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SourceBadge({ source }: { source: ProfileSnapshot["source"] }) {
  if (source === "scheduled") return <Badge variant="muted">定时</Badge>;
  if (source === "reload") return <Badge variant="info">重载</Badge>;
  return <Badge variant="default">手动</Badge>;
}

function DiffBlock({ title, marker, lines, tone }: { title: string; marker: string; lines: string[]; tone: "removed" | "added" }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-[14px] border border-border/60">
      <div className="border-b border-border/60 bg-surface-tertiary/45 px-3 py-2 text-xs font-medium text-text-secondary">{title}</div>
      <pre className={cn("max-h-[420px] overflow-auto whitespace-pre-wrap break-all p-3 font-mono text-[11px] leading-5", tone === "removed" ? "text-danger" : "text-success")}>
        {lines.length > 0 ? lines.map((line) => `${marker} ${line}`).join("\n") : `${marker} （无内容）`}
      </pre>
    </div>
  );
}
