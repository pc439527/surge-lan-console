import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Stethoscope } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
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
  const { connectionId, connection } = useSurgeClientState();
  const connectionName = connection ? `${connection.name} · ${connection.host}:${connection.port}` : "无活动连接";
  const setDemoMode = usePreferencesStore((s) => s.setDemoMode);
  const { client } = useSurgeClientState();
  const surgeClient = useSurgeClient();
  const queryClient = useQueryClient();

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
  const featureList: { key: keyof FeatureState; label: string }[] = [
    { key: "mitm", label: "MitM" },
    { key: "rewrite", label: "Rewrite" },
    { key: "scripting", label: "Scripting" },
    { key: "capture", label: "Capture" },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[26px] font-semibold text-text-primary">Settings</h1>
        <p className="mt-0.5 text-sm text-text-secondary">外观、演示数据与 Surge 功能</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>外观</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <p className="text-sm text-text-secondary">主题</p>
          <AppearanceSwitcher />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>演示模式</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div>
            <p className="text-sm text-text-primary">使用模拟 Surge 数据</p>
            <p className="mt-0.5 text-xs text-text-tertiary">
              无需设备即可体验控制台。真实连接优先。
            </p>
          </div>
          <Switch checked={demoMode} onCheckedChange={setDemoMode} aria-label="演示模式" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>连接</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-text-secondary">
            {connectionName}
          </p>
          <Button variant="secondary" size="sm" asChild>
            <Link to="/settings/diagnostics">
              <Stethoscope className="h-4 w-4" />
              打开 API Diagnostics
            </Link>
          </Button>
          <p className="text-xs text-text-tertiary">
            探测每个 Surge 端点的 HTTP 状态、延迟与解析结果，用于区分「空数据」「平台不支持」与「解析失败」。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>功能</CardTitle>
        </CardHeader>
        <CardContent>
          {!client ? (
            <p className="text-sm text-text-secondary">连接 Surge 实例以控制功能。</p>
          ) : featuresQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {featureList.map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-text-primary">{label}</span>
                    {features?.[key] && <Badge>开</Badge>}
                  </div>
                  <Switch
                    checked={Boolean(features?.[key])}
                    onCheckedChange={(enabled) => setFeature.mutate({ feature: key, enabled })}
                    aria-label={`Toggle ${label}`}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>系统 · 关于</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <BuildInfoRow label="Version" value={`v${BUILD_INFO.version}`} mono />
          <BuildInfoRow label="Git Commit" value={BUILD_INFO.commit} mono />
          {BUILD_INFO.branch && BUILD_INFO.branch !== "unknown" && (
            <BuildInfoRow label="Branch" value={BUILD_INFO.branch} mono />
          )}
          <BuildInfoRow label="Build" value={formatBuildTime(BUILD_INFO.buildTime)} />
          <BuildInfoRow label="Environment" value={BUILD_INFO.environment} />
          <p className="pt-1 text-xs text-text-tertiary">
            受 Apple iOS 26 / Liquid Glass 启发 · Surge HTTP API 客户端
          </p>
        </CardContent>
      </Card>
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