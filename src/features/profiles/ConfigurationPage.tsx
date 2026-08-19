import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import CodeMirror from "@uiw/react-codemirror";
import { StreamLanguage } from "@codemirror/language";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useSurgeClient, useSurgeClientState } from "@/app/surge-client-context";
import { ENDPOINTS } from "@/api/endpoints";
import { SurgeClient } from "@/api/surge-client";
import type { ProfileInfo } from "@/api/types";
import { NoClientNotice } from "@/features/shared/NoClientNotice";

export function ConfigurationPage() {
  const { client } = useSurgeClientState();
  const surgeClient = useSurgeClient();
  const queryClient = useQueryClient();

  // sensitive=0 masks passwords (PROJECT_SPEC §28)
  const profileQuery = useQuery<ProfileInfo | string>({
    queryKey: [ENDPOINTS.profilesCurrent],
    queryFn: () => surgeClient!.getCurrentProfile(false),
    enabled: !!surgeClient,
    staleTime: Infinity,
  });

  const reload = useMutation({
    mutationFn: () => surgeClient!.reloadProfile(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ENDPOINTS.profilesCurrent] });
      toast.success("配置文件已重新加载");
    },
    onError: () => toast.error("重新加载配置失败"),
  });

  if (!client) return <NoClientNotice page="Configuration" />;

  const profileText = profileQuery.data ? SurgeClient.profileText(profileQuery.data) : "";
  const profileName =
    typeof profileQuery.data === "object" && profileQuery.data
      ? profileQuery.data.name
      : "Profile.conf";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold text-text-primary">Configuration</h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            {profileName} · 敏感字段已隐藏
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => reload.mutate()} disabled={reload.isPending}>
          {reload.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          重新加载
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{profileName}</CardTitle>
        </CardHeader>
        <CardContent>
          {profileQuery.isLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            <CodeMirror
              value={profileText}
              extensions={[StreamLanguage.define(properties)]}
              height="480px"
              readOnly
              theme="none"
              basicSetup={{ lineNumbers: true, foldGutter: false }}
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
