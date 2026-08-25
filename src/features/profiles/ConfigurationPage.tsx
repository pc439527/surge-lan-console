import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import CodeMirror from "@uiw/react-codemirror";
import { StreamLanguage } from "@codemirror/language";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorStateView } from "@/components/data-state";
import { useSurgeClient, useSurgeClientState } from "@/app/surge-client-context";
import { surgeKeys } from "@/lib/surge-keys";
import { SurgeClient } from "@/api/surge-client";
import type { ProfileInfo } from "@/api/types";
import { surgeDarkTheme, surgeLightTheme } from "@/lib/codemirror-theme";
import { useResolvedTheme } from "@/lib/theme";
import { NoClientNotice } from "@/features/shared/NoClientNotice";

export function ConfigurationPage() {
  const { client, connectionId } = useSurgeClientState();
  const surgeClient = useSurgeClient();
  const queryClient = useQueryClient();

  const profileQuery = useQuery<ProfileInfo | string>({
    queryKey: surgeKeys.profile(connectionId),
    queryFn: () => surgeClient!.getCurrentProfile(false),
    enabled: !!surgeClient,
    staleTime: Infinity,
  });

  const resolvedTheme = useResolvedTheme();

  const reload = useMutation({
    mutationFn: () => surgeClient!.reloadProfile(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: surgeKeys.profile(connectionId) });
      toast.success("配置文件已重新加载");
    },
    onError: () => toast.error("重新加载配置失败"),
  });

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
          <Button variant="secondary" size="sm" onClick={() => reload.mutate()} disabled={reload.isPending}>
            {reload.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            重新加载
          </Button>
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
    </div>
  );
}
