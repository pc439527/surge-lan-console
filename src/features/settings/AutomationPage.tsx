import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock3, Loader2, Play, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Switch } from "@/components/ui/Switch";
import {
  CoreApiError,
  coreApi,
  type BackupInfo,
  type BackupValidation,
  type ScheduledJob,
} from "@/lib/core-api";
import { useConnectionStore } from "@/stores/connection-store";
import { RetentionCard } from "./RetentionCard";

const JOBS_KEY = ["core", "automation", "jobs"] as const;
const RUNS_KEY = ["core", "automation", "runs"] as const;
const BACKUPS_KEY = ["core", "backups"] as const;
const RUNS_PREVIEW_LIMIT = 20;

export function AutomationPage() {
  const queryClient = useQueryClient();
  const connections = useConnectionStore((s) => s.connections);
  const jobs = useQuery({ queryKey: JOBS_KEY, queryFn: coreApi.listJobs, refetchInterval: 15_000 });
  const runs = useQuery({ queryKey: RUNS_KEY, queryFn: () => coreApi.listJobRuns(RUNS_PREVIEW_LIMIT), refetchInterval: 10_000 });
  const backups = useQuery({ queryKey: BACKUPS_KEY, queryFn: coreApi.listBackups, refetchInterval: 60_000 });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: JOBS_KEY }),
      queryClient.invalidateQueries({ queryKey: RUNS_KEY }),
      queryClient.invalidateQueries({ queryKey: BACKUPS_KEY }),
    ]);
  };

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow="Automation"
        title="后台任务"
        description="Scheduler、Collector 与 SQLite Backup 运行在 Local Core；关闭浏览器后仍持续执行。"
        actions={(
          <Button variant="secondary" size="sm" onClick={() => void refresh()}>
            <RefreshCw className="h-4 w-4" />刷新
          </Button>
        )}
      />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <Card>
          <CardHeader>
            <CardTitle>Scheduled Jobs</CardTitle>
            <p className="text-xs text-text-tertiary">
              默认：Metrics 60s、Events 30s、DNS 10min、Node Quality 30min、配置快照 6h、SQLite Backup 24h。Profile Reload 与 Daily Digest 默认关闭。
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {jobs.isLoading ? (
              <p className="py-5 text-sm text-text-secondary">加载任务…</p>
            ) : jobs.data?.length ? (
              jobs.data.map((job) => (
                <JobRow
                  key={job.id}
                  job={job}
                  connectionName={job.connectionId ? connections.find((c) => c.id === job.connectionId)?.name ?? job.connectionId : "全局"}
                  onChanged={refresh}
                />
              ))
            ) : (
              <p className="py-5 text-center text-sm text-text-secondary">暂无后台任务。</p>
            )}
          </CardContent>
        </Card>
        <aside className="space-y-5 xl:sticky xl:top-20">
          <BackupCard backups={backups.data ?? []} loading={backups.isLoading} onChanged={refresh} />
          <RetentionCard />
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-text-secondary" /><CardTitle>最近运行</CardTitle></div>
                <span className="text-xs text-text-tertiary">最近 {RUNS_PREVIEW_LIMIT} 条</span>
              </div>
            </CardHeader>
            <CardContent className="max-h-[520px] divide-y divide-border/50 overflow-y-auto pr-1">
              {runs.data?.length ? runs.data.map((run) => (
                <div key={run.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge status={run.status} />
                    <span className="font-mono text-[11px] text-text-tertiary">{run.durationMs}ms</span>
                  </div>
                  <p className="mt-1 truncate font-mono text-[11px] text-text-secondary">{run.jobId}</p>
                  <p className="mt-0.5 text-[11px] text-text-tertiary">{new Date(run.finishedAt).toLocaleString()}</p>
                  {run.message && <p className="mt-1 line-clamp-2 text-[11px] text-danger">{run.message}</p>}
                </div>
              )) : <p className="py-5 text-center text-sm text-text-secondary">暂无运行记录。</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>锁定行为</CardTitle></CardHeader>
            <CardContent className="text-xs leading-5 text-text-tertiary">
              <p>网页关闭：任务继续运行。</p>
              <p>Session 超时：已解锁的 Core Runtime Lease 仍可继续自动任务。</p>
              <p>“立即锁定”或 Core 重启：DEK 被清除，受保护任务暂停；下次输入数据 PIN 后自动恢复。</p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function BackupCard({ backups, loading, onChanged }: { backups: BackupInfo[]; loading: boolean; onChanged: () => Promise<void> }) {
  const [validations, setValidations] = useState<Record<string, BackupValidation>>({});
  const create = useMutation({
    mutationFn: coreApi.createBackup,
    onSuccess: async (result) => {
      setValidations((current) => ({ ...current, [result.id]: result }));
      toast.success("SQLite 备份已创建并通过完整性校验");
      await onChanged();
    },
    onError: (error) => toast.error(error instanceof CoreApiError ? error.message : "创建数据库备份失败"),
  });
  const validate = useMutation({
    mutationFn: (id: string) => coreApi.validateBackup(id),
    onSuccess: (result) => {
      setValidations((current) => ({ ...current, [result.id]: result }));
      if (result.valid) toast.success("备份完整性校验通过");
      else toast.error(`备份校验失败：${result.quickCheck}`);
    },
    onError: (error) => toast.error(error instanceof CoreApiError ? error.message : "备份校验失败"),
  });
  const restore = useMutation({
    mutationFn: ({ id, expectedSha256 }: { id: string; expectedSha256: string }) => coreApi.restoreBackup(id, expectedSha256),
    onSuccess: (result) => {
      setValidations((current) => ({
        ...current,
        [result.backup.id]: result.backup,
        [result.safetyBackup.id]: result.safetyBackup,
      }));
      toast.success("恢复已接受，Core 正在安全重启；重启后请重新输入 PIN。", { duration: 12_000 });
    },
    onError: (error) => toast.error(error instanceof CoreApiError ? error.message : "数据库恢复失败"),
  });

  const requestRestore = async (backup: BackupInfo) => {
    if (restore.isPending) return;
    let validation: BackupValidation;
    try {
      validation = await coreApi.validateBackup(backup.id);
      setValidations((current) => ({ ...current, [validation.id]: validation }));
    } catch (error) {
      toast.error(error instanceof CoreApiError ? error.message : "恢复前校验失败");
      return;
    }
    if (!validation.valid) {
      toast.error(`备份校验失败：${validation.quickCheck}`);
      return;
    }

    const confirmed = window.confirm(
      `确认恢复此 SQLite 备份？\n\n${backup.id}\n\n恢复前会自动创建当前数据库的安全恢复点；随后 Core 会停止并重启。恢复完成后，数据 PIN、连接与历史数据都以该备份中的状态为准。`,
    );
    if (!confirmed) return;
    restore.mutate({ id: backup.id, expectedSha256: validation.sha256 });
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>SQLite 备份</CardTitle>
          <p className="mt-1 text-xs leading-5 text-text-tertiary">Online Backup · 自动 quick_check · 最近保留 30 份</p>
        </div>
        <Button size="sm" variant="secondary" disabled={create.isPending || restore.isPending} onClick={() => create.mutate()}>
          {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          立即备份
        </Button>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border/50">
          {loading ? (
            <p className="py-4 text-sm text-text-secondary">加载备份…</p>
          ) : backups.length === 0 ? (
            <p className="py-4 text-center text-sm text-text-secondary">暂无数据库备份。</p>
          ) : backups.slice(0, 8).map((backup) => {
            const validation = validations[backup.id];
            const validating = validate.isPending && validate.variables === backup.id;
            const source = backupSourceMeta(backup.source);
            return (
              <div key={backup.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge variant={source.variant}>{source.label}</Badge>
                    <span className="truncate font-mono text-[11px] text-text-secondary">{backup.id}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button size="sm" variant="ghost" disabled={validating || restore.isPending} onClick={() => validate.mutate(backup.id)}>
                      {validating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      校验
                    </Button>
                    <Button size="sm" variant="destructive" disabled={restore.isPending || validating} onClick={() => void requestRestore(backup)}>
                      {restore.isPending && restore.variables?.id === backup.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                      恢复
                    </Button>
                  </div>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-text-tertiary">
                  <span>{new Date(backup.createdAt).toLocaleString()}</span>
                  <span>{formatBytes(backup.sizeBytes)}</span>
                </div>
                {validation && (
                  <div className="mt-2 rounded-[10px] border border-border/45 bg-surface-tertiary/30 px-2.5 py-2 text-[11px] text-text-tertiary">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant={validation.valid ? "success" : "danger"}>{validation.valid ? "完整" : "异常"}</Badge>
                      <span>schema v{validation.schemaVersion ?? "?"} · {validation.quickCheck}</span>
                    </div>
                    <p className="mt-1 truncate font-mono">SHA-256 {validation.sha256}</p>
                  </div>
                )}
              </div>
            );
          })}
          {backups.length > 8 && <p className="pt-3 text-center text-[11px] text-text-tertiary">仅显示最近 8 份，共 {backups.length} 份</p>}
        </div>
        <div className="mt-3 rounded-[12px] border border-warning/25 bg-warning/[0.045] px-3 py-2.5 text-[11px] leading-4 text-text-tertiary">
          恢复属于破坏性操作：Core 会重新校验 SHA-256 / quick_check / schema，自动创建“恢复点”，关闭 SQLite 后原子替换，并由容器自动重启。恢复后的数据密码与配置以备份内容为准。
        </div>
      </CardContent>
    </Card>
  );
}

function backupSourceMeta(source: BackupInfo["source"]): { label: string; variant: "muted" | "info" | "warning" } {
  if (source === "scheduled") return { label: "自动", variant: "muted" };
  if (source === "restore-point") return { label: "恢复点", variant: "warning" };
  return { label: "手动", variant: "info" };
}

function JobRow({ job, connectionName, onChanged }: { job: ScheduledJob; connectionName: string; onChanged: () => Promise<void> }) {
  const [interval, setIntervalValue] = useState(String(job.intervalSeconds));
  const update = useMutation({ mutationFn: (input: { enabled?: boolean; intervalSeconds?: number }) => coreApi.updateJob(job.id, input), onSuccess: onChanged, onError: (error) => toast.error(error instanceof CoreApiError ? error.message : "更新任务失败") });
  const run = useMutation({ mutationFn: () => coreApi.runJob(job.id), onSuccess: async () => { toast.success(`${jobLabel(job.type)} 执行完成`); await onChanged(); }, onError: (error) => toast.error(error instanceof CoreApiError ? error.message : "任务执行失败") });
  const minimum = jobMinInterval(job.type);
  return (
    <div className="rounded-[14px] border border-border/55 bg-surface-tertiary/25 px-3.5 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-text-primary">{jobLabel(job.type)}</p><Badge variant="muted">{connectionName}</Badge></div>
          <p className="mt-0.5 font-mono text-[11px] text-text-tertiary">next {new Date(job.nextRunAt).toLocaleString()}</p>
        </div>
        <Switch checked={job.enabled} onCheckedChange={(enabled) => update.mutate({ enabled })} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <Input className="w-28" type="number" min={minimum} value={interval} onChange={(e) => setIntervalValue(e.target.value)} aria-label="间隔秒" />
          <span className="text-xs text-text-tertiary">秒</span>
          <Button size="sm" variant="secondary" disabled={update.isPending} onClick={() => update.mutate({ intervalSeconds: Number(interval) })}><Check className="h-3.5 w-3.5" />保存频率</Button>
        </div>
        <Button size="sm" variant="ghost" disabled={run.isPending} onClick={() => run.mutate()}>{run.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}立即运行</Button>
      </div>
      <p className="mt-2 text-[11px] text-text-tertiary">最小间隔 {minimum} 秒</p>
    </div>
  );
}

function jobLabel(type: string): string {
  const labels: Record<string, string> = {
    "device-heartbeat": "Device Heartbeat",
    metrics: "Metrics Collector",
    events: "Event Collector",
    "dns-health": "DNS Health Check",
    "node-health": "Node Quality Check",
    "profile-snapshot": "配置快照",
    "profile-reload": "Profile Reload",
    "daily-digest": "Daily Digest",
    "database-backup": "SQLite Backup",
  };
  return labels[type] ?? type;
}

function jobMinInterval(type: string): number {
  const minimums: Record<string, number> = {
    "device-heartbeat": 30,
    metrics: 30,
    events: 30,
    "dns-health": 60,
    "node-health": 60,
    "profile-snapshot": 900,
    "profile-reload": 300,
    "daily-digest": 3600,
    "database-backup": 3600,
  };
  return minimums[type] ?? 30;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function StatusBadge({ status }: { status: "success" | "error" | "skipped" }) {
  if (status === "success") return <Badge variant="success">成功</Badge>;
  if (status === "error") return <Badge variant="danger">失败</Badge>;
  return <Badge variant="muted">跳过</Badge>;
}
