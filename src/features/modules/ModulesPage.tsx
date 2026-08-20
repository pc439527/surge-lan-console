import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
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

  // V1.2: "/" focuses the search box.
  useKeyboardShortcuts({ "/": () => searchRef.current?.focus() });

  // v0.3.0：能力探测确认平台不支持 Modules API 时，直接给出解释而非报错。
  const capModules = useCapabilityFeature("modules");
  const capUnsupported = capModules === "unsupported";

  const modulesQuery = useQuery({
    queryKey: surgeKeys.modules(connectionId),
    queryFn: () => surgeClient!.getModuleList(),
    enabled: !!surgeClient,
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

  if (!client) return <NoClientNotice page="Modules" />;

  const filtered = modulesQuery.data?.filter((m) =>
    m.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[26px] font-semibold text-text-primary">Modules</h1>
        <p className="mt-0.5 text-sm text-text-secondary">已安装与可用模块</p>
      </header>

      {capUnsupported && <CapabilityNotice feature="modules" api="/v1/modules" />}
      {!capUnsupported && <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <Input ref={searchRef} className="pl-9" placeholder="搜索模块..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>}

      {!capUnsupported && <Card>
        <CardContent className="p-2">
          {modulesQuery.isLoading ? (
            <div className="space-y-2 p-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : modulesQuery.isError ? (
            <ErrorStateView error={modulesQuery.error} api="/v1/modules" compact onRetry={() => modulesQuery.refetch()} />
          ) : filtered?.length === 0 ? (
            <DataEmpty
              title="没有发现已安装模块"
              description="当前 Surge 实例没有返回模块数据。如果期望有模块，请检查 API 是否被平台支持。"
              compact
            />
          ) : (
            <div className="divide-y divide-border/50">
              {filtered?.map((mod) => (
                <div key={mod.name} className="flex items-center justify-between gap-4 px-3 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">{mod.name}</p>
                  </div>
                  <Switch
                    checked={mod.enabled}
                    onCheckedChange={(enabled) => setPendingToggle({ name: mod.name, enabled })}
                    aria-label={`切换 ${mod.name}`}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>}

      <Dialog open={pendingToggle !== null} onOpenChange={(open) => !open && setPendingToggle(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingToggle?.enabled ? "启用" : "停用"} {pendingToggle?.name}？
            </DialogTitle>
            <DialogDescription>
              {pendingToggle?.enabled
                ? "这将启用该模块。"
                : "这将停用该模块。"}
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