import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock3, Loader2, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Switch } from "@/components/ui/Switch";
import { CoreApiError, coreApi, type ScheduledJob } from "@/lib/core-api";
import { useConnectionStore } from "@/stores/connection-store";

const JOBS_KEY = ["core", "automation", "jobs"] as const;
const RUNS_KEY = ["core", "automation", "runs"] as const;

export function AutomationPage() {
  const queryClient = useQueryClient();
  const connections = useConnectionStore((s) => s.connections);
  const jobs = useQuery({ queryKey: JOBS_KEY, queryFn: coreApi.listJobs, refetchInterval: 15_000 });
  const runs = useQuery({ queryKey: RUNS_KEY, queryFn: () => coreApi.listJobRuns(80), refetchInterval: 10_000 });
  const refresh = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: JOBS_KEY }), queryClient.invalidateQueries({ queryKey: RUNS_KEY })]); };

  return <div className="space-y-5 lg:space-y-6"><PageHeader eyebrow="Automation" title="后台任务" description="Scheduler 与 Collector 运行在 Local Core；关闭浏览器后仍持续执行。" actions={<Button variant="secondary" size="sm" onClick={() => void refresh()}><RefreshCw className="h-4 w-4" />刷新</Button>} />
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
      <Card><CardHeader><CardTitle>Scheduled Jobs</CardTitle><p className="text-xs text-text-tertiary">默认：Metrics 60s、Events 30s、DNS 10min、Node Quality 30min。Profile Reload 与 Daily Digest 默认关闭。</p></CardHeader><CardContent className="space-y-2">{jobs.isLoading ? <p className="py-5 text-sm text-text-secondary">加载任务…</p> : jobs.data?.length ? jobs.data.map((job) => <JobRow key={job.id} job={job} connectionName={job.connectionId ? connections.find((c) => c.id === job.connectionId)?.name ?? job.connectionId : "全局"} onChanged={refresh} />) : <p className="py-5 text-center text-sm text-text-secondary">暂无后台任务。</p>}</CardContent></Card>
      <aside className="space-y-5 xl:sticky xl:top-20"><Card><CardHeader><div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-text-secondary" /><CardTitle>最近运行</CardTitle></div></CardHeader><CardContent className="divide-y divide-border/50">{runs.data?.length ? runs.data.map((run) => <div key={run.id} className="py-2.5 first:pt-0 last:pb-0"><div className="flex items-center justify-between gap-2"><StatusBadge status={run.status} /><span className="font-mono text-[10px] text-text-tertiary">{run.durationMs}ms</span></div><p className="mt-1 truncate font-mono text-[10px] text-text-secondary">{run.jobId}</p><p className="mt-0.5 text-[10px] text-text-tertiary">{new Date(run.finishedAt).toLocaleString()}</p>{run.message && <p className="mt-1 line-clamp-2 text-[10px] text-danger">{run.message}</p>}</div>) : <p className="py-5 text-center text-sm text-text-secondary">暂无运行记录。</p>}</CardContent></Card><Card><CardHeader><CardTitle>锁定行为</CardTitle></CardHeader><CardContent className="text-xs leading-5 text-text-tertiary"><p>网页关闭：任务继续运行。</p><p>Session 超时：已解锁的 Core Runtime Lease 仍可继续自动任务。</p><p>“立即锁定”或 Core 重启：DEK 被清除，受保护任务暂停；下次输入数据密码后自动恢复。</p></CardContent></Card></aside>
    </div>
  </div>;
}

function JobRow({ job, connectionName, onChanged }: { job: ScheduledJob; connectionName: string; onChanged: () => Promise<void> }) {
  const [interval, setIntervalValue] = useState(String(job.intervalSeconds));
  const update = useMutation({ mutationFn: (input: { enabled?: boolean; intervalSeconds?: number }) => coreApi.updateJob(job.id, input), onSuccess: onChanged, onError: (error) => toast.error(error instanceof CoreApiError ? error.message : "更新任务失败") });
  const run = useMutation({ mutationFn: () => coreApi.runJob(job.id), onSuccess: async () => { toast.success(`${jobLabel(job.type)} 执行完成`); await onChanged(); }, onError: (error) => toast.error(error instanceof CoreApiError ? error.message : "任务执行失败") });
  return <div className="rounded-[14px] border border-border/55 bg-surface-tertiary/25 px-3.5 py-3"><div className="flex items-center justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-text-primary">{jobLabel(job.type)}</p><Badge variant="muted">{connectionName}</Badge></div><p className="mt-0.5 font-mono text-[10px] text-text-tertiary">next {new Date(job.nextRunAt).toLocaleString()}</p></div><Switch checked={job.enabled} onCheckedChange={(enabled) => update.mutate({ enabled })} /></div><div className="mt-3 flex flex-wrap items-center gap-2"><div className="flex items-center gap-2"><Input className="w-28" type="number" min={30} value={interval} onChange={(e) => setIntervalValue(e.target.value)} aria-label="间隔秒" /><span className="text-xs text-text-tertiary">秒</span><Button size="sm" variant="secondary" disabled={update.isPending} onClick={() => update.mutate({ intervalSeconds: Number(interval) })}><Check className="h-3.5 w-3.5" />保存频率</Button></div><Button size="sm" variant="ghost" disabled={run.isPending} onClick={() => run.mutate()}>{run.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}立即运行</Button></div></div>;
}

function jobLabel(type: string): string {
  const labels: Record<string, string> = { "device-heartbeat": "Device Heartbeat", metrics: "Metrics Collector", events: "Event Collector", "dns-health": "DNS Health Check", "node-health": "Node Quality Check", "profile-reload": "Profile Reload", "daily-digest": "Daily Digest" };
  return labels[type] ?? type;
}
function StatusBadge({ status }: { status: "success" | "error" | "skipped" }) {
  if (status === "success") return <Badge variant="success">成功</Badge>;
  if (status === "error") return <Badge variant="danger">失败</Badge>;
  return <Badge variant="muted">跳过</Badge>;
}
