import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, Loader2, TerminalSquare } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/Drawer";
import { useSurgeClient, useSurgeClientState } from "@/app/surge-client-context";
import { ENDPOINTS } from "@/api/endpoints";
import { NoClientNotice } from "@/features/shared/NoClientNotice";

export function ScriptsPage() {
  const { client } = useSurgeClientState();
  const surgeClient = useSurgeClient();
  const [viewing, setViewing] = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState<string | null>(null);

  const scriptsQuery = useQuery({
    queryKey: [ENDPOINTS.scripting],
    queryFn: () => surgeClient!.getScriptList(),
    enabled: !!surgeClient,
  });

  const runCron = useMutation({
    mutationFn: (name: string) => surgeClient!.runCronScript(name),
    onSuccess: () => toast.success("Cron 脚本已执行"),
    onError: () => toast.error("Cron 执行失败"),
  });

  if (!client) return <NoClientNotice page="Scripts" />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[26px] font-semibold text-text-primary">Scripts</h1>
        <p className="mt-0.5 text-sm text-text-secondary">
          HTTP 请求/响应、规则、DNS、事件、cron 与通用脚本
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>全部脚本</CardTitle>
        </CardHeader>
        <CardContent>
          {scriptsQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left text-xs font-medium text-text-tertiary">名称</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-text-tertiary">类型</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-text-tertiary">路径</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-text-tertiary">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {scriptsQuery.data?.map((script) => (
                    <tr key={`${script.name}-${script.type}`} className="border-b border-border/50">
                      <td className="px-3 py-2.5 text-[13px] font-medium text-text-primary">{script.name}</td>
                      <td className="px-3 py-2.5">
                        <Badge variant="muted" className="font-mono text-[11px]">{script.type}</Badge>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-text-secondary">{script.path ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1">
                          {script.type === "cron" ? (
                            <Button size="sm" variant="ghost" onClick={() => runCron.mutate(script.name)} disabled={runCron.isPending}>
                              {runCron.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TerminalSquare className="h-3.5 w-3.5" />}
                              运行
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => setEvaluating(script.name)}>
                              <TerminalSquare className="h-3.5 w-3.5" />
                              评估
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setViewing(script.name)}>
                            <Eye className="h-3.5 w-3.5" />
                            查看
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {scriptsQuery.data?.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-10 text-center text-sm text-text-tertiary">
                        没有找到脚本。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Drawer open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DrawerContent side="right">
          <DrawerHeader>
            <DrawerTitle>{viewing}</DrawerTitle>
            <DrawerDescription>脚本详情 — 在线编辑将在后续版本提供</DrawerDescription>
          </DrawerHeader>
          <DrawerBody>
            <div className="space-y-3 text-sm text-text-secondary">
              <p>当前版本不支持在线编辑脚本。</p>
              <p>请在设备上的 Surge 应用中修改脚本源码。</p>
            </div>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      <Drawer open={evaluating !== null} onOpenChange={(open) => !open && setEvaluating(null)}>
        <DrawerContent side="right">
          <DrawerHeader>
            <DrawerTitle>评估 {evaluating}</DrawerTitle>
            <DrawerDescription>模拟环境执行（开发中）</DrawerDescription>
          </DrawerHeader>
          <DrawerBody>
            <p className="text-sm text-text-secondary">
              脚本评估需要脚本内容，将在后续版本提供在线编辑后支持。
            </p>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
