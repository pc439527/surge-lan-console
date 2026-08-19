import { useState } from "react";
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
import { ENDPOINTS } from "@/api/endpoints";
import { NoClientNotice } from "@/features/shared/NoClientNotice";

export function ModulesPage() {
  const { client } = useSurgeClientState();
  const surgeClient = useSurgeClient();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [pendingToggle, setPendingToggle] = useState<{ name: string; enabled: boolean } | null>(null);

  const modulesQuery = useQuery({
    queryKey: [ENDPOINTS.modules],
    queryFn: () => surgeClient!.getModuleList(),
    enabled: !!surgeClient,
  });

  const toggle = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      surgeClient!.updateModule(name, enabled),
    onSuccess: (_d, { name, enabled }) => {
      queryClient.setQueryData(
        [ENDPOINTS.modules],
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

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <Input className="pl-9" placeholder="搜索模块..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-2">
          {modulesQuery.isLoading ? (
            <div className="space-y-2 p-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
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
              {filtered?.length === 0 && (
                <p className="px-3 py-10 text-center text-sm text-text-tertiary">没有匹配的模块。</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={pendingToggle !== null} onOpenChange={(open) => !open && setPendingToggle(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingToggle?.enabled ? "启用" : "停用"} {pendingToggle?.name}？
            </DialogTitle>
            <DialogDescription>
              {pendingToggle?.enabled
                ? "这将安装并激活该模块。"
                : "这将卸载并停用该模块。"}
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
