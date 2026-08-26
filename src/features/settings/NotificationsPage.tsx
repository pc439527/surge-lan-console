import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, History, KeyRound, Loader2, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Switch } from "@/components/ui/Switch";
import { CoreApiError, coreApi, type NotificationChannel, type NotificationRule } from "@/lib/core-api";

const CHANNELS_KEY = ["core", "notifications", "channels"] as const;
const RULES_KEY = ["core", "notifications", "rules"] as const;
const HISTORY_KEY = ["core", "notifications", "history"] as const;
const HISTORY_PREVIEW_LIMIT = 20;

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const channels = useQuery({ queryKey: CHANNELS_KEY, queryFn: coreApi.listNotificationChannels });
  const rules = useQuery({ queryKey: RULES_KEY, queryFn: () => coreApi.listNotificationRules() });
  const history = useQuery({ queryKey: HISTORY_KEY, queryFn: () => coreApi.listNotificationHistory(HISTORY_PREVIEW_LIMIT), refetchInterval: 15_000 });
  const [name, setName] = useState("Bark");
  const [endpoint, setEndpoint] = useState("");

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: CHANNELS_KEY }), queryClient.invalidateQueries({ queryKey: RULES_KEY }), queryClient.invalidateQueries({ queryKey: HISTORY_KEY }),
    ]);
  };
  const createChannel = useMutation({
    mutationFn: () => coreApi.createNotificationChannel({ name, endpoint }),
    onSuccess: async () => { setEndpoint(""); toast.success("Bark 渠道已保存到加密 Vault"); await refresh(); },
    onError: (error) => toast.error(error instanceof CoreApiError ? error.message : "保存 Bark 渠道失败"),
  });

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader eyebrow="Notifications" title="通知中心" description="统一事件 → 规则 → Bark Provider；支持去重、Cooldown、Quiet Hours 与恢复通知。" />
      <Card><CardHeader><CardTitle>添加 Bark</CardTitle><p className="text-xs text-text-tertiary">填写个人 Bark Token 地址，例如 https://api.day.app/DEVICE_KEY。地址只加密保存在 Core Vault。</p></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)_auto]"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="渠道名称" /><Input type="password" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="Bark Token URL" autoComplete="off" /><Button disabled={createChannel.isPending || !endpoint.trim()} onClick={() => createChannel.mutate()}>{createChannel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}添加</Button></div></CardContent></Card>

      <div className="grid items-start gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card><CardHeader><CardTitle>通知渠道</CardTitle></CardHeader><CardContent className="space-y-3">
            {channels.isLoading ? <p className="text-sm text-text-secondary">加载中…</p> : channels.data?.length ? channels.data.map((channel) => <ChannelCard key={channel.id} channel={channel} onChanged={refresh} />) : <p className="py-5 text-center text-sm text-text-secondary">尚未配置 Bark 渠道。</p>}
          </CardContent></Card>
          <Card><CardHeader><CardTitle>行为说明</CardTitle></CardHeader><CardContent className="space-y-2 text-xs leading-5 text-text-tertiary"><p>同一 Fingerprint 在 Cooldown 内不会重复刷屏。</p><p>Recovery 只有对应异常曾处于 Active 状态时才会发送。</p><p>Quiet Hours 内事件写入历史但不推送。</p></CardContent></Card>
        </div>

        <div className="space-y-5">
          <Card><CardHeader><CardTitle>事件规则</CardTitle><p className="text-xs text-text-tertiary">每个 Bark 渠道独立控制事件、冷却时间和静默时段。规则区固定高度滚动，避免设置页被规则数量无限拉长。</p></CardHeader><CardContent className="max-h-[680px] space-y-2 overflow-y-auto pr-1">
            {rules.isLoading ? <p className="text-sm text-text-secondary">加载中…</p> : rules.data?.map((rule) => <RuleRow key={rule.id} rule={rule} channelName={channels.data?.find((c) => c.id === rule.channelId)?.name ?? "Bark"} onChanged={refresh} />)}
          </CardContent></Card>
          <Card><CardHeader><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><History className="h-4 w-4 text-text-secondary" /><CardTitle>最近通知</CardTitle></div><span className="text-xs text-text-tertiary">最近 {HISTORY_PREVIEW_LIMIT} 条</span></div></CardHeader><CardContent className="max-h-[520px] divide-y divide-border/50 overflow-y-auto pr-1">
            {history.data?.length ? history.data.map((item) => <div key={item.id} className="flex gap-3 py-3 first:pt-0 last:pb-0"><span className="mt-1"><StatusBadge status={item.status} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-medium text-text-primary">{item.title}</p><span className="font-mono text-[11px] text-text-tertiary">{item.eventType}</span></div><p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">{item.body}</p><p className="mt-1 text-[11px] text-text-tertiary">{new Date(item.createdAt).toLocaleString()}{item.errorMessage ? ` · ${item.errorMessage}` : ""}</p></div></div>) : <p className="py-5 text-center text-sm text-text-secondary">暂无通知历史。</p>}
          </CardContent></Card>
        </div>
      </div>
    </div>
  );
}

function ChannelCard({ channel, onChanged }: { channel: NotificationChannel; onChanged: () => Promise<void> }) {
  const [replacement, setReplacement] = useState("");
  const mutation = useMutation({
    mutationFn: (input: { enabled?: boolean; endpoint?: string }) => coreApi.updateNotificationChannel(channel.id, { name: channel.name, ...input }),
    onSuccess: async () => { setReplacement(""); await onChanged(); },
    onError: (error) => toast.error(error instanceof CoreApiError ? error.message : "更新渠道失败"),
  });
  const test = useMutation({ mutationFn: () => coreApi.testNotificationChannel(channel.id), onSuccess: async () => { toast.success("Bark 测试通知已发送"); await onChanged(); }, onError: (error) => toast.error(error instanceof CoreApiError ? error.message : "Bark 测试失败") });
  const remove = useMutation({ mutationFn: () => coreApi.deleteNotificationChannel(channel.id), onSuccess: async () => { toast.success("通知渠道已删除"); await onChanged(); } });
  return <div className="rounded-[14px] border border-border/60 bg-surface-tertiary/30 p-3.5"><div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><Bell className="h-4 w-4 text-accent" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-text-primary">{channel.name}</p><p className="text-[11px] text-text-tertiary">{channel.configured ? "Token 已加密" : "未配置 Token"}</p></div></div><Switch checked={channel.enabled} onCheckedChange={(enabled) => mutation.mutate({ enabled })} /></div><div className="mt-3 flex gap-2"><Input type="password" value={replacement} onChange={(e) => setReplacement(e.target.value)} placeholder="替换 Token URL（可选）" autoComplete="off" /><Button size="sm" variant="secondary" disabled={!replacement.trim() || mutation.isPending} onClick={() => mutation.mutate({ endpoint: replacement })}><KeyRound className="h-3.5 w-3.5" />更新</Button></div><div className="mt-2 flex gap-2"><Button size="sm" variant="ghost" disabled={test.isPending} onClick={() => test.mutate()}>{test.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}测试</Button><Button size="sm" variant="ghost" className="text-danger hover:text-danger" disabled={remove.isPending} onClick={() => remove.mutate()}><Trash2 className="h-3.5 w-3.5" />删除</Button></div></div>;
}

function RuleRow({ rule, channelName, onChanged }: { rule: NotificationRule; channelName: string; onChanged: () => Promise<void> }) {
  const [cooldown, setCooldown] = useState(String(rule.cooldownSeconds));
  const [quietStart, setQuietStart] = useState(rule.quietStart ?? "");
  const [quietEnd, setQuietEnd] = useState(rule.quietEnd ?? "");
  const [timeZone, setTimeZone] = useState(rule.timeZone);
  const mutation = useMutation({ mutationFn: (input: Parameters<typeof coreApi.updateNotificationRule>[1]) => coreApi.updateNotificationRule(rule.id, input), onSuccess: onChanged, onError: (error) => toast.error(error instanceof CoreApiError ? error.message : "更新规则失败") });
  return <div className="rounded-[12px] border border-border/50 px-3 py-3"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate font-mono text-xs font-semibold text-text-primary">{rule.eventType}</p><p className="text-[11px] text-text-tertiary">{channelName}</p></div><Switch checked={rule.enabled} onCheckedChange={(enabled) => mutation.mutate({ enabled })} /></div><div className="mt-3 grid gap-2 sm:grid-cols-[120px_110px_110px_minmax(130px,1fr)_auto]"><Input type="number" min={0} max={86400} value={cooldown} onChange={(e) => setCooldown(e.target.value)} aria-label="Cooldown 秒" /><Input type="time" value={quietStart} onChange={(e) => setQuietStart(e.target.value)} aria-label="Quiet start" /><Input type="time" value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)} aria-label="Quiet end" /><Input value={timeZone} onChange={(e) => setTimeZone(e.target.value)} placeholder="Asia/Shanghai" aria-label="Time zone" /><Button size="sm" variant="secondary" disabled={mutation.isPending} onClick={() => mutation.mutate({ cooldownSeconds: Number(cooldown) || 0, quietStart: quietStart || null, quietEnd: quietEnd || null, timeZone })}><Check className="h-3.5 w-3.5" />保存</Button></div><p className="mt-1.5 text-[11px] text-text-tertiary">Cooldown 秒 · Quiet Start · Quiet End · IANA Time Zone</p></div>;
}

function StatusBadge({ status }: { status: "sent" | "error" | "suppressed" }) {
  if (status === "sent") return <Badge variant="success">已发送</Badge>;
  if (status === "error") return <Badge variant="danger">失败</Badge>;
  return <Badge variant="muted">已抑制</Badge>;
}
