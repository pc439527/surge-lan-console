import type { ReactNode } from "react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Stethoscope } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { AppearanceSwitcher } from "@/components/ui/AppearanceSwitcher";
import { useSurgeClient, useSurgeClientState } from "@/app/surge-client-context";
import { surgeKeys } from "@/lib/surge-keys";
import type { FeatureState } from "@/api/types";
import { usePreferencesStore } from "@/stores/preferences-store";
import { BUILD_INFO, formatBuildTime } from "@/lib/version";

export function SettingsPage() {
  const demoMode = usePreferencesStore((s) => s.demoMode);
  const { connectionId, connection, client } = useSurgeClientState();
  const setDemoMode = usePreferencesStore((s) => s.setDemoMode);
  const surgeClient = useSurgeClient();
  const queryClient = useQueryClient();
  const connectionName = connection ? `${connection.name} · ${connection.host}:${connection.port}` : "无活动连接";

  const featuresQuery = useQuery({
    queryKey: surgeKeys.features(connectionId),
    queryFn: () => surgeClient!.getFeatures(),
    enabled: !!surgeClient,
    refetchInterval: 10_000,
  });

  const setFeature = useMutation({
    mutationFn: ({ feature, enabled }: { feature: keyof FeatureState; enabled: boolean }) =>
      surgeClient!.setFeature(feature, enabled),
    onSuccess: (_d, { feature, enabled }) => {
      queryClient.setQueryData(surgeKeys.features(connectionId), (prev: Record<string, boolean> | undefined) => ({
        ...prev,
        [feature]: enabled,
      }));
      toast.success(`已${enabled ? "启用" : "停用"} ${feature}`);
    },
    onError: () => toast.error("更新功能失败"),
  });

  const features = featuresQuery.data;
  const featureList: { key: keyof FeatureState; label: string; description: string }[] = [
    { key: "mitm", label: "MitM", description: "HTTPS 解密与证书相关能力" },
    { key: "rewrite", label: "Rewrite", description: "URL 重写与 Header 修改规则" },
    { key: "scripting", label: "Scripting", description: "Surge 脚本运行能力" },
    { key: "capture", label: "Capture", description: "请求与网络捕获功能" },
  ];

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="设置"
        description="外观、连接诊断、演示数据与 Surge 功能。"
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>外观与体验</CardTitle>
              <p className="text-xs text-text-tertiary">控制控制台外观与本地演示行为。</p>
            </CardHeader>
            <CardContent className="divide-y divide-border/50 pt-1">
              <SettingRow title="主题" description="跟随系统或固定使用 Light / Dark。">
                <AppearanceSwitcher />
              </SettingRow>
              <SettingRow title="演示模式" description="无需设备即可体验模拟 Surge 数据；真实连接优先。">
                <Switch checked={demoMode} onCheckedChange={setDemoMode} aria-label="演示模式" />
              </SettingRow>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Surge 功能</CardTitle>
              <p className="text-xs text-text-tertiary">直接控制当前连接实例暴露的功能开关。</p>
            </CardHeader>
            <CardContent className="pt-1">
              {!client ? (
                <p className="py-5 text-sm text-text-secondary">连接 Surge 实例以控制功能。</p>
              ) : featuresQuery.isLoading ? (
                <div className="space-y-2 py-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {featureList.map(({ key, label, description }) => (
                    <SettingRow key={key} title={label} description={description}>
                      <div className="flex items-center gap-3">
                        {features?.[key] && <Badge variant="info">开</Badge>}
                        <Switch
                          checked={Boolean(features?.[key])}
                          onCheckedChange={(enabled) => setFeature.mutate({ feature: key, enabled })}
                          aria-label={`Toggle ${label}`}
                        />
                      </div>
                    </SettingRow>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-20">
          <Card>
            <CardHeader>
              <CardTitle>当前连接</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-[14px] bg-surface-tertiary/65 p-4">
                <div className="flex items-center gap-2">
                  <span className={connection ? "h-2 w-2 rounded-pill bg-success" : "h-2 w-2 rounded-pill bg-text-tertiary"} />
                  <p className="text-sm font-semibold text-text-primary">{connection?.name ?? "未连接"}</p>
                </div>
                <p className="mt-1.5 break-all font-mono text-xs text-text-secondary">{connectionName}</p>
              </div>
              <Button variant="secondary" size="sm" className="w-full justify-center" asChild>
                <Link to="/settings/diagnostics">
                  <Stethoscope className="h-4 w-4" />
                  打开 API Diagnostics
                </Link>
              </Button>
              <p className="text-xs leading-5 text-text-tertiary">
                探测 Surge 端点的 HTTP 状态、延迟与解析结果，用于区分空数据、平台不支持与解析失败。
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>关于</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              <BuildInfoRow label="Version" value={`v${BUILD_INFO.version}`} mono />
              <BuildInfoRow label="Git Commit" value={BUILD_INFO.commit} mono />
              {BUILD_INFO.branch && BUILD_INFO.branch !== "unknown" && (
                <BuildInfoRow label="Branch" value={BUILD_INFO.branch} mono />
              )}
              <BuildInfoRow label="Build" value={formatBuildTime(BUILD_INFO.buildTime)} />
              <BuildInfoRow label="Environment" value={BUILD_INFO.environment} />
              <div className="border-t border-border/55 pt-3 text-xs leading-5 text-text-tertiary">
                参考 Apple HIG 2026 / iOS 27 / macOS 27 设计语言 · Surge HTTP API 客户端
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function SettingRow({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[64px] items-center justify-between gap-5 py-3.5 first:pt-2 last:pb-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-primary">{title}</p>
        {description && <p className="mt-0.5 max-w-2xl text-xs leading-5 text-text-tertiary">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function BuildInfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="shrink-0 text-[13px] text-text-secondary">{label}</span>
      <span className={`min-w-0 truncate text-right text-[13px] text-text-primary ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
    </div>
  );
}
