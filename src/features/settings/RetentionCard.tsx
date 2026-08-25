import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { CoreApiError, coreApi, type RetentionSettings } from "@/lib/core-api";

const RETENTION_KEY = ["core", "settings", "retention"] as const;

interface FieldMeta {
  key: keyof RetentionSettings;
  label: string;
  description: string;
  min: number;
  max: number;
}

const FIELDS: FieldMeta[] = [
  { key: "metricsRawDays", label: "Metrics 原始样本", description: "高频 /v1/traffic 原始 JSON；长期趋势由 rollup 保存。", min: 1, max: 7 },
  { key: "policyTrafficDays", label: "Policy Traffic Counter", description: "策略累计 counter，用于重建策略历史流量差值。", min: 7, max: 90 },
  { key: "healthRawDays", label: "健康 / 事件 / Runtime", description: "DNS、节点质量、事件与运行时原始诊断样本。", min: 2, max: 30 },
  { key: "trafficFiveMinuteDays", label: "Traffic 5 分钟 Rollup", description: "近期详细历史流量趋势。", min: 7, max: 90 },
  { key: "trafficHourlyDays", label: "Traffic 1 小时 Rollup", description: "长期历史流量趋势。", min: 30, max: 730 },
  { key: "jobRunsDays", label: "Job Runs", description: "Scheduler 执行历史。", min: 7, max: 180 },
  { key: "notificationHistoryDays", label: "通知与事件状态", description: "Bark 历史，以及 warning/error 去重状态。", min: 30, max: 365 },
];

export function RetentionCard() {
  const settings = useQuery({ queryKey: RETENTION_KEY, queryFn: coreApi.getRetentionSettings, staleTime: 60_000 });
  const [draft, setDraft] = useState<RetentionSettings | null>(null);

  useEffect(() => {
    if (settings.data) setDraft(settings.data);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: (value: RetentionSettings) => coreApi.updateRetentionSettings(value),
    onSuccess: (result) => {
      setDraft(result);
      toast.success("数据保留策略已保存，并已按新周期执行清理");
      void settings.refetch();
    },
    onError: (error) => toast.error(error instanceof CoreApiError ? error.message : "保存数据保留策略失败"),
  });

  const reset = useMutation({
    mutationFn: coreApi.resetRetentionSettings,
    onSuccess: (result) => {
      setDraft(result);
      toast.success("已恢复默认数据保留策略，并执行清理");
      void settings.refetch();
    },
    onError: (error) => toast.error(error instanceof CoreApiError ? error.message : "恢复默认保留策略失败"),
  });

  const change = (key: keyof RetentionSettings, value: string) => {
    if (!draft) return;
    setDraft({ ...draft, [key]: Number(value) });
  };

  const valid = draft !== null && FIELDS.every((field) => {
    const value = draft[field.key];
    return Number.isInteger(value) && value >= field.min && value <= field.max;
  });

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>数据保留策略</CardTitle>
          <p className="mt-1 text-xs leading-5 text-text-tertiary">保留周期写入 SQLite app_meta；所有字段都有安全上下限。</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          disabled={reset.isPending || save.isPending || settings.isLoading}
          onClick={() => {
            if (window.confirm("恢复默认保留周期？缩短后的周期会立即清理超期历史数据，已删除的数据无法自动恢复。")) reset.mutate();
          }}
        >
          {reset.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          恢复默认
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {settings.isLoading || !draft ? (
          <p className="py-4 text-sm text-text-secondary">加载保留策略…</p>
        ) : settings.isError ? (
          <div className="rounded-[12px] border border-danger/20 bg-danger/[0.035] px-3 py-3 text-xs text-danger">
            无法读取保留策略。
            <Button className="ml-2" size="sm" variant="ghost" onClick={() => void settings.refetch()}>重试</Button>
          </div>
        ) : (
          <>
            <div className="space-y-2.5">
              {FIELDS.map((field) => (
                <label key={field.key} className="grid grid-cols-[minmax(0,1fr)_86px] items-center gap-3 rounded-[12px] border border-border/45 bg-surface-tertiary/25 px-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-text-primary">{field.label}</span>
                    <span className="mt-0.5 block text-[10px] leading-4 text-text-tertiary">{field.description}</span>
                    <span className="mt-0.5 block font-mono text-[9px] text-text-tertiary">{field.min}–{field.max} 天</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      min={field.min}
                      max={field.max}
                      value={draft[field.key]}
                      onChange={(event) => change(field.key, event.target.value)}
                      aria-label={`${field.label}保留天数`}
                    />
                    <span className="text-[10px] text-text-tertiary">天</span>
                  </span>
                </label>
              ))}
            </div>
            <Button
              className="w-full"
              variant="secondary"
              disabled={!valid || save.isPending || reset.isPending}
              onClick={() => {
                if (!draft || !valid) return;
                if (window.confirm("保存新的保留周期？若任一周期缩短，超期数据会立即删除且不可自动恢复。建议重要变更前先创建 SQLite 备份。")) save.mutate(draft);
              }}
            >
              {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              保存并立即应用
            </Button>
            <p className="rounded-[10px] bg-warning/[0.045] px-2.5 py-2 text-[10px] leading-4 text-text-tertiary">
              缩短周期会立即清理超期记录；拉长周期只影响未来保留，已经清理的数据不会重新出现。重要调整前可先使用上方 SQLite Backup 创建恢复点。
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
