import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, Loader2, Search, TerminalSquare } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { MetricStrip } from "@/components/ui/MetricStrip";
import { PageHeader } from "@/components/ui/PageHeader";
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

interface DisplayScript {
  name: string;
  type: string;
  path?: string;
  source: "api" | "profile";
}

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
  const [viewing, setViewing] = useState<DisplayScript | null>(null);
  const [evaluating, setEvaluating] = useState<string | null>(null);
  const [scriptText, setScriptText] = useState("");
  const [mockType, setMockType] = useState("cron");
  const [search, setSearch] = useState("");

  const capScripts = useCapabilityFeature("scripts");
  const capUnsupported = capScripts === "unsupported";

  const scriptsQuery = useQuery({
    queryKey: surgeKeys.scripts(connectionId),
    queryFn: () => surgeClient!.getScriptList(),
    enabled: !!surgeClient,
  });

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
    const api = (scriptsQuery.data ?? []).map<DisplayScript>((script) => ({
      name: script.name,
      type: script.type,
      path: script.path,
      source: "api",
    }));
    if (api.length > 0) return api;
    return (profileScriptsQuery.data ?? []).map<DisplayScript>((script) => ({
      name: script.name,
      type: script.type,
      path: script.path,
      source: "profile",
    }));
  }, [scriptsQuery.data, profileScriptsQuery.data]);

  const filteredScripts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return displayScripts;
    return displayScripts.filter((script) =>
      [script.name, script.type, script.path ?? "", script.source]
        .some((value) => value.toLowerCase().includes(query)),
    );
  }, [displayScripts, search]);

  const runCron = useMutation({
    mutationFn: (name: string) => surgeClient!.runCronScript(name),
    onSuccess: () => toast.success("Cron 脚本已执行"),
    onError: () => toast.error("Cron 执行失败"),
  });

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

  if (!client) return <NoClientNotice page="脚本" />;

  const cronCount = displayScripts.filter((script) => script.type === "cron").length;
  const apiCount = displayScripts.filter((script) => script.source === "api").length;
  const profileCount = displayScripts.length - apiCount;
  const resolvingFallback = needsProfileFallback && profileScriptsQuery.isLoading;

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow="Surge"
        title="脚本"
        description="查看 HTTP、规则、DNS、事件、cron 与通用脚本；支持 Cron 运行与沙箱评估。"
      />

      {capUnsupported && scriptsQuery.isError && (
        <CapabilityNotice feature="scripts" api="/v1/scripting" />
      )}

      {!scriptsQuery.isLoading && !resolvingFallback && (
        <MetricStrip
          items={[
            { label: "脚本总数", value: displayScripts.length, detail: "当前配置", tone: "accent" },
            { label: "Cron", value: cronCount, detail: "可直接运行", tone: cronCount > 0 ? "success" : "muted" },
            { label: "API 来源", value: apiCount, detail: capUnsupported ? "平台接口不可用" : "实时接口", tone: apiCount > 0 ? "success" : "muted" },
            { label: "配置来源", value: profileCount, detail: "[Script] 回退", tone: profileCount > 0 ? "warning" : "muted" },
          ]}
        />
      )}

      <Card>
        <CardHeader className="flex-row items-end justify-between gap-4">
          <div>
            <CardTitle>脚本列表</CardTitle>
            <p className="mt-1 text-xs text-text-tertiary">
              API 无数据时会自动读取当前配置文件的 [Script] 段，避免把“接口无结果”误判成“没有脚本”。
            </p>
          </div>
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <Input className="pl-9" placeholder="搜索脚本…" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          {scriptsQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : resolvingFallback ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <p className="pt-1 text-center text-xs text-text-tertiary">API 无脚本 — 正在从配置文件 [Script] 段查找…</p>
            </div>
          ) : needsProfileFallback && profileScriptsQuery.isError ? (
            <ErrorStateView error={profileScriptsQuery.error} api="/v1/profiles/current" compact onRetry={() => profileScriptsQuery.refetch()} />
          ) : displayScripts.length === 0 ? (
            <DataEmpty
              title="没有发现脚本"
              description="API 与配置文件的 [Script] 段均未发现脚本，当前配置可能确实没有启用脚本。"
              compact
            />
          ) : filteredScripts.length === 0 ? (
            <DataEmpty title="没有匹配的脚本" description="调整搜索词后重试。" compact />
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
                  {filteredScripts.map((script) => (
                    <tr
                      key={`${script.name}-${script.type}-${script.source}`}
                      className="border-b border-border/50 transition-colors duration-hover hover:bg-elevated/45"
                    >
                      <td className="px-3 py-2.5 text-[13px] font-medium text-text-primary">{script.name}</td>
                      <td className="px-3 py-2.5">
                        <Badge variant="muted" className="font-mono text-[11px]">{script.type}</Badge>
                      </td>
                      <td className="max-w-[420px] px-3 py-2.5 font-mono text-xs text-text-secondary">
                        <span className="block truncate">{script.path ?? "—"}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant={script.source === "api" ? "info" : "muted"}>
                          {script.source === "api" ? "API" : "配置"}
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
                          <Button size="sm" variant="ghost" onClick={() => setViewing(script)}>
                            <Eye className="h-3.5 w-3.5" />
                            详情
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
        <DrawerContent side="right" className="w-[min(100vw,520px)]">
          <DrawerHeader>
            <DrawerTitle>{viewing?.name ?? "脚本详情"}</DrawerTitle>
            <DrawerDescription>脚本元数据与当前控制台可执行操作</DrawerDescription>
          </DrawerHeader>
          <DrawerBody>
            {viewing && (
              <div className="space-y-5">
                <div className="rounded-[16px] border border-border bg-surface-tertiary/45 p-4">
                  <InfoRow label="类型" value={viewing.type} mono />
                  <InfoRow label="来源" value={viewing.source === "api" ? "Scripting API" : "配置文件 [Script]"} />
                  <InfoRow label="路径" value={viewing.path ?? "—"} mono />
                </div>
                <div className="space-y-2 border-t border-border/60 pt-4">
                  <p className="text-sm font-medium text-text-primary">可用操作</p>
                  <p className="text-[13px] leading-5 text-text-secondary">
                    当前控制台保持只读展示，不在线修改脚本源码。Cron 脚本可以直接运行；其他脚本可通过“评估”在模拟环境中执行代码片段。
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {viewing.type === "cron" ? (
                      <Button size="sm" onClick={() => runCron.mutate(viewing.name)} disabled={runCron.isPending}>
                        <TerminalSquare className="h-3.5 w-3.5" />
                        运行 Cron
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => openEvaluate(viewing.name)}>
                        <TerminalSquare className="h-3.5 w-3.5" />
                        打开评估
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      <Dialog open={evaluating !== null} onOpenChange={(open) => !open && setEvaluating(null)}>
        <DialogContent className="w-[min(92vw,560px)]">
          <DialogHeader>
            <DialogTitle>评估{evaluating ? ` ${evaluating}` : ""}</DialogTitle>
            <DialogDescription>
              在沙箱模拟环境中执行脚本片段（POST /v1/scripting/evaluate）。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={scriptText}
              onChange={(event) => setScriptText(event.target.value)}
              placeholder={"粘贴要评估的脚本源码…\n\n示例：\n$httpClient.get(\"http://www.gstatic.com/generate_204\", function(error, response) {\n  console.log(response.status)\n  $done()\n})"}
              className="h-40 font-mono text-xs"
            />
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-xs text-text-secondary">模拟环境</span>
              <Select value={mockType} onValueChange={setMockType}>
                <SelectTrigger className="w-44"><SelectValue placeholder="cron" /></SelectTrigger>
                <SelectContent>
                  {MOCK_TYPES.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {evaluate.data !== undefined && (
              <div className="rounded-[14px] border border-border bg-surface-tertiary/45 p-3">
                <p className="mb-1 text-xs font-medium text-text-tertiary">输出</p>
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-text-primary">
                  {formatEvalResult(evaluate.data)}
                </pre>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEvaluating(null)}>关闭</Button>
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

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/45 py-2.5 first:pt-0 last:border-b-0 last:pb-0">
      <span className="shrink-0 text-[13px] text-text-secondary">{label}</span>
      <span className={`min-w-0 break-all text-right text-[13px] text-text-primary ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

function formatEvalResult(data: unknown): string {
  if (typeof data === "string") return data;
  return JSON.stringify(data, null, 2);
}
