import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, Loader2, TerminalSquare } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/Drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { useSurgeClient, useSurgeClientState } from "@/app/surge-client-context";
import { surgeKeys } from "@/lib/surge-keys";
import { SurgeClient } from "@/api/surge-client";
import { parseScriptsFromProfile } from "@/lib/profile-scripts";
import { DataEmpty, ErrorStateView } from "@/components/data-state";
import { NoClientNotice } from "@/features/shared/NoClientNotice";
import { CapabilityNotice } from "@/features/shared/CapabilityNotice";
import { useCapabilityFeature } from "@/features/shared/capability";

/** Unified script row — API data or the Configuration [Script] fallback (T11). */
interface DisplayScript {
  name: string;
  type: string;
  path?: string;
  source: "api" | "profile";
}

/** Mock environments accepted by POST /v1/scripting/evaluate. */
const MOCK_TYPES = [
  { value: "cron", label: "cron" },
  { value: "http-request", label: "http-request" },
  { value: "http-response", label: "http-response" },
  { value: "rule", label: "rule" },
  { value: "dns", label: "dns" },
  { value: "event", label: "event" },
  { value: "generic", label: "generic" },
];

export function ScriptsPage() {
  const { client, connectionId } = useSurgeClientState();
  const surgeClient = useSurgeClient();
  const [viewing, setViewing] = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState<string | null>(null);
  const [scriptText, setScriptText] = useState("");
  const [mockType, setMockType] = useState("cron");

  // v0.3.0：能力探测确认平台不支持 Scripting API 时直接给出解释。
  const capScripts = useCapabilityFeature("scripts");
  const capUnsupported = capScripts === "unsupported";

  const scriptsQuery = useQuery({
    queryKey: surgeKeys.scripts(connectionId),
    queryFn: () => surgeClient!.getScriptList(),
    enabled: !!surgeClient,
  });

  // T11 fallback: API 返回 [] 并不等于「没有脚本」 — 配置文件的 [Script] 段
  // 可能是真实的脚本来源（API 无脚本 ≠ 配置无脚本）。
  const apiEmpty =
    !scriptsQuery.isLoading && !scriptsQuery.isError && (scriptsQuery.data?.length ?? 0) === 0;
  const needsProfileFallback = scriptsQuery.isError || apiEmpty;
  const profileScriptsQuery = useQuery({
    queryKey: surgeKeys.profile(connectionId),
    queryFn: async () => {
      const profile = await surgeClient!.getCurrentProfile(false);
      return parseScriptsFromProfile(SurgeClient.profileText(profile));
    },
    enabled: !!surgeClient && needsProfileFallback,
    staleTime: 60_000,
  });

  const displayScripts = useMemo<DisplayScript[]>(() => {
    const api = (scriptsQuery.data ?? []).map<DisplayScript>((s) => ({
      name: s.name,
      type: s.type,
      path: s.path,
      source: "api",
    }));
    if (api.length > 0) return api;
    return (profileScriptsQuery.data ?? []).map<DisplayScript>((s) => ({
      name: s.name,
      type: s.type,
      path: s.path,
      source: "profile",
    }));
  }, [scriptsQuery.data, profileScriptsQuery.data]);

  const runCron = useMutation({
    mutationFn: (name: string) => surgeClient!.runCronScript(name),
    onSuccess: () => toast.success("Cron 脚本已执行"),
    onError: () => toast.error("Cron 执行失败"),
  });

  // PROJECT_SPEC §6.9 — Evaluate runs the snippet in a sandboxed mock env.
  const evaluate = useMutation({
    mutationFn: () => surgeClient!.evaluateScript(scriptText, mockType, 5),
    onSuccess: () => toast.success("评估完成"),
    onError: () => toast.error("脚本评估失败"),
  });

  const openEvaluate = (name: string) => {
    setEvaluating(name);
    setScriptText("");
    setMockType("cron");
  };

  if (!client) return <NoClientNotice page="Scripts" />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[26px] font-semibold text-text-primary">Scripts</h1>
        <p className="mt-0.5 text-sm text-text-secondary">
          HTTP 请求/响应、规则、DNS、事件、cron 与通用脚本
        </p>
      </header>

      {capUnsupported && scriptsQuery.isError && <CapabilityNotice feature="scripts" api="/v1/scripting" />}
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
          ) : needsProfileFallback && profileScriptsQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <p className="pt-1 text-center text-xs text-text-tertiary">API 无脚本 — 正在从配置文件 [Script] 段查找…</p>
            </div>
          ) : needsProfileFallback && profileScriptsQuery.isError ? (
            <ErrorStateView error={profileScriptsQuery.error} api="/v1/profiles/current" compact onRetry={() => profileScriptsQuery.refetch()} />
          ) : displayScripts.length === 0 ? (
            <DataEmpty
              title="没有发现脚本"
              description="API 与配置文件的 [Script] 段均未发现脚本 — 当前配置可能确实没有启用任何脚本。"
              compact
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left text-xs font-medium text-text-tertiary">名称</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-text-tertiary">类型</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-text-tertiary">路径</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-text-tertiary">来源</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-text-tertiary">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {displayScripts.map((script) => (
                    <tr key={script.name + "-" + script.type + "-" + script.source} className="border-b border-border/50">
                      <td className="px-3 py-2.5 text-[13px] font-medium text-text-primary">{script.name}</td>
                      <td className="px-3 py-2.5">
                        <Badge variant="muted" className="font-mono text-[11px]">{script.type}</Badge>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-text-secondary">{script.path ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        <Badge variant={script.source === "api" ? "info" : "muted"} className="font-mono text-[10px]">
                          {script.source === "api" ? "API" : "Profile"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1">
                          {script.type === "cron" ? (
                            <Button size="sm" variant="ghost" onClick={() => runCron.mutate(script.name)} disabled={runCron.isPending}>
                              {runCron.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TerminalSquare className="h-3.5 w-3.5" />}
                              运行
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => openEvaluate(script.name)}>
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
              <p>请在设备上的 Surge 应用中修改脚本源码，或使用「评估」在模拟环境中运行代码片段。</p>
            </div>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      <Dialog open={evaluating !== null} onOpenChange={(open) => !open && setEvaluating(null)}>
        <DialogContent className="w-[min(92vw,560px)]">
          <DialogHeader>
            <DialogTitle>评估{evaluating ? " " + evaluating : ""}</DialogTitle>
            <DialogDescription>
              在沙箱模拟环境中执行脚本片段（POST /v1/scripting/evaluate）。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
              placeholder={"粘贴要评估的脚本源码…\n\n示例：\n$httpClient.get(\"http://www.gstatic.com/generate_204\", function(error, response) {\n  console.log(response.status)\n  $done()\n})"}
              className="h-40 font-mono text-xs"
            />
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-xs text-text-secondary">模拟环境</span>
              <Select value={mockType} onValueChange={setMockType}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="cron" />
                </SelectTrigger>
                <SelectContent>
                  {MOCK_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {evaluate.data !== undefined && (
              <div className="rounded-sm border border-border bg-surface/60 p-3">
                <p className="mb-1 text-xs font-medium text-text-tertiary">输出</p>
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-text-primary">
                  {formatEvalResult(evaluate.data)}
                </pre>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEvaluating(null)}>
              关闭
            </Button>
            <Button onClick={() => evaluate.mutate()} disabled={!scriptText.trim() || evaluate.isPending}>
              {evaluate.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              运行评估
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Render evaluate output defensively — response shapes vary by mock type. */
function formatEvalResult(data: unknown): string {
  if (typeof data === "string") return data;
  return JSON.stringify(data, null, 2);
}