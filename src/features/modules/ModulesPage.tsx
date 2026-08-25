import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { MetricStrip } from "@/components/ui/MetricStrip";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { useSurgeClient, useSurgeClientState } from "@/app/surge-client-context";
import { surgeKeys } from "@/lib/surge-keys";
import { DataEmpty, ErrorStateView } from "@/components/data-state";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { NoClientNotice } from "@/features/shared/NoClientNotice";
import { CapabilityNotice } from "@/features/shared/CapabilityNotice";
import { useCapabilityFeature } from "@/features/shared/capability";

export function ModulesPage() {
  const { client, connectionId } = useSurgeClientState();
  const surgeClient = useSurgeClient();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [pendingToggle, setPendingToggle] = useState<{ name: string; enabled: boolean } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useKeyboardShortcuts({ "/": () => searchRef.current?.focus() });

  const capModules = useCapabilityFeature("modules");
  const capUnsupported = capModules === "unsupported";

  const modulesQuery = useQuery({
    queryKey: surgeKeys.modules(connectionId),
    queryFn: () => surgeClient!.getModuleList(),
    enabled: !!surgeClient && !capUnsupported,
  });

  const toggle = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      surgeClient!.updateModule(name, enabled),
    onSuccess: (_d, { name, enabled }) => {
      queryClient.setQueryData(
        surgeKeys.modules(connectionId),
        (prev: { name: string; enabled: boolean }[] | undefined) =>
          prev?.map((m) => (m.name === name ? { ...m, enabled } : m)) ?? prev,
      );
      toast.success(`${name} 已${enabled ? "启用" : "停用"}`);
      setPendingToggle(null);
    },
    onError: () => {
      toast.error("更新模块失败");
      setPendingToggle(null);
    },
  });

  if (!client) return <NoClientNotice page="模块" />;

  const modules = modulesQuery.data ?? [];
  const query = search.trim().toLowerCase();
  const filtered = modules.filter((module) => module.name.toLowerCase().includes(query));
  const enabledCount = modules.filter((module) => module.enabled).length;
  const disabledCount = modules.length - enabledCount;

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow="Surge"
        title="模块"
        description="查看当前实例的已安装模块，并控制模块启用状态。"
      />

      {capUnsupported ? (
        <CapabilityNotice feature="modules" api="/v1/modules" />
      ) : (
        <>
          <MetricStrip
            items={[
              { label: "模块总数", value: modules.length, detail: "当前实例", tone: "accent" },
              { label: "已启用", value: enabledCount, detail: "正在生效", tone: enabledCount > 0 ? "success" : "muted" },
              { label: "已停用", value: disabledCount, detail: "当前关闭", tone: disabledCount > 0 ? "warning" : "muted" },
              { label: "当前匹配", value: filtered.length, detail: search ? `搜索：${search}` : "全部模块", tone: "muted" },
            ]}
          />

          <Card>
            <CardHeader className="flex-row items-end justify-between gap-4">
              <div>
                <CardTitle>模块列表</CardTitle>
                <p className="mt-1 text-xs text-text-tertiary">切换状态前会要求确认，避免误停用正在使用的模块。</p>
              </div>
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                <Input
                  ref={searchRef}
                  className="pl-9"
                  placeholder="搜索模块…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-2 pt-1">
              {modulesQuery.isLoading ? (
                <div className="space-y-2 p-3">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              ) : modulesQuery.isError ? (
                <ErrorStateView error={modulesQuery.error} api="/v1/modules" compact onRetry={() => modulesQuery.refetch()} />
              ) : filtered.length === 0 ? (
                <DataEmpty
                  title={search ? "没有匹配的模块" : "没有发现已安装模块"}
                  description={
                    search
                      ? "调整搜索词后重试。"
                      : "当前 Surge 实例没有返回模块数据。如果期望有模块，请检查平台能力与 API Diagnostics。"
                  }
                  compact
                />
              ) : (
                <div className="divide-y divide-border/50">
                  {filtered.map((module) => (
                    <div
                      key={module.name}
                      className="flex min-h-[58px] items-center justify-between gap-4 rounded-[12px] px-3 py-3 transition-colors duration-hover hover:bg-elevated/45"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={module.enabled ? "h-2.5 w-2.5 shrink-0 rounded-pill bg-success" : "h-2.5 w-2.5 shrink-0 rounded-pill bg-text-tertiary/50"} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-text-primary">{module.name}</p>
                          <div className="mt-1">
                            <Badge variant={module.enabled ? "success" : "muted"}>{module.enabled ? "已启用" : "已停用"}</Badge>
                          </div>
                        </div>
                      </div>
                      <Switch
                        checked={module.enabled}
                        onCheckedChange={(enabled) => setPendingToggle({ name: module.name, enabled })}
                        aria-label={`切换 ${module.name}`}
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={pendingToggle !== null} onOpenChange={(open) => !open && setPendingToggle(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingToggle?.enabled ? "启用" : "停用"} {pendingToggle?.name}？
            </DialogTitle>
            <DialogDescription>
              {pendingToggle?.enabled ? "这将启用该模块并立即影响当前 Surge 实例。" : "这将停用该模块并立即影响当前 Surge 实例。"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingToggle(null)}>取消</Button>
            <Button
              variant={pendingToggle?.enabled ? "default" : "destructive"}
              onClick={() => pendingToggle && toggle.mutate(pendingToggle)}
              disabled={toggle.isPending}
            >
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
