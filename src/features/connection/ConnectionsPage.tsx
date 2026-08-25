import { useState } from "react";
import { toast } from "sonner";
import { Check, ChevronRight, Loader2, Pencil, Plus, Trash2, Wifi } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricStrip } from "@/components/ui/MetricStrip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { Badge } from "@/components/ui/Badge";
import { useSurgeClientState } from "@/app/surge-client-context";
import { clearApiKey, isApiKeyRemembered, loadApiKey, saveApiKey } from "@/stores/api-key-storage";
import {
  buildClientFor,
  useConnectionStore,
  type ConnectionProtocol,
  type SurgeConnection,
} from "@/stores/connection-store";
import { SurgeError } from "@/api/errors";
import { cn } from "@/lib/cn";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";

interface FormState {
  name: string;
  protocol: ConnectionProtocol;
  host: string;
  port: string;
  apiKey: string;
  remember: boolean;
  useProxy: boolean;
  /** 平台手动指定（空 = 自动检测）。 */
  platform: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  protocol: "http",
  host: "",
  port: "6171",
  apiKey: "",
  remember: false,
  useProxy: false,
  platform: "auto",
};

export function ConnectionsPage() {
  const { client: providerClient } = useSurgeClientState();
  const connections = useConnectionStore((s) => s.connections);
  const activeId = useConnectionStore((s) => s.activeConnectionId);
  const addConnection = useConnectionStore((s) => s.addConnection);
  const updateConnection = useConnectionStore((s) => s.updateConnection);
  const removeConnection = useConnectionStore((s) => s.removeConnection);
  const setActive = useConnectionStore((s) => s.setActiveConnection);

  const [editing, setEditing] = useState<SurgeConnection | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected =
    connections.find((connection) => connection.id === selectedId) ??
    connections.find((connection) => connection.id === activeId) ??
    connections[0] ??
    null;
  const proxyCount = connections.filter((connection) => connection.useProxy).length;
  const rememberedKeyCount = connections.filter((connection) => isApiKeyRemembered(connection.id)).length;

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (conn: SurgeConnection) => {
    setEditing(conn);
    setForm({
      name: conn.name,
      protocol: conn.protocol,
      host: conn.host,
      port: String(conn.port),
      apiKey: loadApiKey(conn.id) ?? "",
      remember: isApiKeyRemembered(conn.id),
      useProxy: conn.useProxy ?? false,
      platform: conn.platform ?? "auto",
    });
    setFormOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.host.trim()) {
      toast.error("连接名称和主机地址不能为空");
      return;
    }
    const data = {
      name: form.name.trim(),
      protocol: form.protocol,
      host: form.host.trim(),
      port: Number(form.port) || 6171,
      useProxy: form.useProxy,
      platform: (form.platform === "auto" ? undefined : form.platform) as SurgeConnection["platform"],
    };

    if (editing) {
      updateConnection(editing.id, data);
      if (form.apiKey) saveApiKey(editing.id, form.apiKey, form.remember);
      setSelectedId(editing.id);
      toast.success("连接已更新");
    } else {
      const id = addConnection(data);
      if (form.apiKey) saveApiKey(id, form.apiKey, form.remember);
      setActive(id);
      setSelectedId(id);
      toast.success("连接已添加");
    }
    setFormOpen(false);
  };

  const handleTest = async (conn: SurgeConnection) => {
    setTestingId(conn.id);
    try {
      const target =
        conn.id === activeId
          ? (providerClient ?? buildClientFor(conn)?.client ?? null)
          : (buildClientFor(conn)?.client ?? null);
      if (target) {
        const result = await target.testConnection();
        if (result.reachable && result.authenticated) {
          toast.success(`✓ Surge 可达 · ${result.latencyMs ?? "?"}ms`);
          setActive(conn.id);
          setSelectedId(conn.id);
        } else if (result.reachable) {
          toast.error(`⚠ Surge 可达 · API Key 无效（${result.latencyMs ?? "?"}ms）`);
        } else {
          toast.error("✕ 无法连接 Surge — " + (result.error?.message ?? "请检查地址与网络"));
        }
        return;
      }
      toast.error("需要 API 密钥 — 请先编辑连接并填写密钥");
    } catch (error) {
      if (error instanceof SurgeError) {
        toast.error(error.message);
      } else {
        toast.error("测试失败");
      }
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = () => {
    if (!deleteId) return;
    clearApiKey(deleteId);
    removeConnection(deleteId);
    if (selectedId === deleteId) setSelectedId(null);
    toast.success("连接已删除");
    setDeleteId(null);
  };

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        title="连接"
        description="管理局域网内的 Surge 实例、访问方式与平台识别。"
        actions={(
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            添加连接
          </Button>
        )}
      />

      <MetricStrip
        items={[
          { label: "已保存", value: connections.length, detail: "Surge 设备", tone: "accent" },
          { label: "当前连接", value: connections.find((connection) => connection.id === activeId)?.name ?? "—", detail: activeId ? "活动实例" : "尚未选择", tone: activeId ? "success" : "muted" },
          { label: "反向代理", value: proxyCount, detail: "通过控制台转发", tone: proxyCount > 0 ? "warning" : "muted" },
          { label: "已保存密钥", value: rememberedKeyCount, detail: "持久化 API Key", tone: rememberedKeyCount > 0 ? "success" : "muted" },
        ]}
      />

      {connections.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <Wifi className="h-8 w-8 text-text-tertiary" />
            <div>
              <p className="text-sm font-medium text-text-primary">暂无连接</p>
              <p className="mt-1 text-sm text-text-secondary">添加第一个 Surge 实例后即可开始使用控制台。</p>
            </div>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              添加连接
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="min-w-0 overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-3">
                <CardTitle>设备</CardTitle>
                <span className="text-xs text-text-tertiary">{connections.length} 个已保存实例</span>
              </div>
            </CardHeader>
            <CardContent className="p-2 pt-1">
              <div className="divide-y divide-border/50">
                {connections.map((conn) => {
                  const isActive = conn.id === activeId;
                  const isSelected = selected?.id === conn.id;
                  const hasKey = loadApiKey(conn.id) !== null;
                  return (
                    <button
                      key={conn.id}
                      type="button"
                      onClick={() => setSelectedId(conn.id)}
                      className={cn(
                        "group flex w-full items-center gap-3 rounded-[14px] px-3 py-3.5 text-left outline-none transition-colors duration-hover focus-visible:ring-2 focus-visible:ring-accent/50",
                        isSelected ? "bg-accent/8" : "hover:bg-elevated/55",
                      )}
                    >
                      <span
                        className={cn(
                          "h-2.5 w-2.5 shrink-0 rounded-pill",
                          isActive ? "bg-success" : hasKey ? "bg-text-tertiary/55" : "bg-warning",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-semibold text-text-primary">{conn.name}</span>
                          {isActive && <Badge variant="success">当前</Badge>}
                          {conn.useProxy && <Badge variant="warning">反向代理</Badge>}
                        </span>
                        <span className="mt-1 block truncate font-mono text-xs text-text-tertiary">
                          {conn.protocol}://{conn.host}:{conn.port}
                        </span>
                      </span>
                      <span className="hidden items-center gap-2 sm:flex">
                        {conn.platform && <Badge variant="muted">{platformBadgeLabel(conn.platform)}</Badge>}
                        {!hasKey && <Badge variant="warning">缺少密钥</Badge>}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5" />
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {selected && (
            <Card className="lg:sticky lg:top-24">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-[17px]">{selected.name}</CardTitle>
                    <p className="mt-1 truncate font-mono text-xs text-text-tertiary">
                      {selected.protocol}://{selected.host}:{selected.port}
                    </p>
                  </div>
                  {selected.id === activeId ? <Badge variant="success">当前设备</Badge> : <Badge variant="muted">已保存</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="divide-y divide-border/50">
                  <InfoRow label="API 密钥" value={loadApiKey(selected.id) !== null ? "已配置" : "未配置"} tone={loadApiKey(selected.id) !== null ? "success" : "warning"} />
                  <InfoRow label="访问方式" value={selected.useProxy ? "控制台反向代理" : "浏览器直连"} />
                  <InfoRow label="平台" value={selected.platform ? platformBadgeLabel(selected.platform) : "自动检测"} />
                  <InfoRow label="协议" value={selected.protocol.toUpperCase()} mono />
                </div>

                <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={testingId === selected.id}
                    onClick={() => handleTest(selected)}
                  >
                    {testingId === selected.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    {testingId === selected.id ? "测试中…" : "测试连接"}
                  </Button>
                  {selected.id !== activeId && (
                    <Button size="sm" onClick={() => setActive(selected.id)}>
                      设为当前
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => openEdit(selected)}>
                    <Pencil className="h-3.5 w-3.5" />
                    编辑
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger hover:text-danger"
                    onClick={() => setDeleteId(selected.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    删除
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "编辑连接" : "添加连接"}</DialogTitle>
            <DialogDescription>
              连接元数据保存在本地；除非选择“记住 API 密钥”，否则密钥仅保存在 sessionStorage 中。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">连接名称</label>
              <Input placeholder="Apple TV" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary">协议</label>
                <div className="flex rounded-sm border border-border bg-surface p-0.5">
                  {(["http", "https"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setForm({ ...form, protocol: p })}
                      className={cn(
                        "flex-1 rounded-xs py-1.5 text-xs font-medium uppercase transition-colors duration-hover",
                        form.protocol === p ? "bg-accent/12 text-accent" : "text-text-secondary hover:text-text-primary",
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary">端口</label>
                <Input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">主机地址</label>
              <Input placeholder="192.168.x.x" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">平台</label>
              <Select value={form.platform} onValueChange={(v) => setForm({ ...form, platform: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="自动检测" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">自动检测</SelectItem>
                  <SelectItem value="ios">Surge iOS</SelectItem>
                  <SelectItem value="tvos">Apple TV / tvOS</SelectItem>
                  <SelectItem value="macos">Surge macOS</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs leading-relaxed text-text-tertiary">
                平台接口能力由 /v1 探测自动判定；若判定不准确，可在此手动指定。
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">API 密钥</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                autoComplete="off"
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
              <Switch checked={form.remember} onCheckedChange={(v) => setForm({ ...form, remember: v })} aria-label="记住 API 密钥" />
              记住 API 密钥
            </label>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
              <Switch checked={form.useProxy} onCheckedChange={(v) => setForm({ ...form, useProxy: v })} aria-label="通过控制台反向代理访问" />
              通过控制台反向代理访问
            </label>
            <p className="-mt-1 text-xs leading-relaxed text-text-tertiary">
              {form.useProxy
                ? "浏览器请求发往本控制台同源 /v1/，再由 nginx 转发到设备。控制台使用 HTTPS、Surge API 为 HTTP 时应启用此项。"
                : "浏览器直接访问设备 HTTP API。若当前控制台通过 HTTPS 打开，浏览器可能拦截混合内容。"}
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>取消</Button>
            <Button onClick={handleSave}>{editing ? "保存" : "添加"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除连接？</DialogTitle>
            <DialogDescription>这将删除连接及其存储的 API 密钥，此操作不可撤销。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteId(null)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoRow({ label, value, tone, mono }: { label: string; value: string; tone?: "success" | "warning"; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <span className="text-[13px] text-text-secondary">{label}</span>
      <span className={cn("min-w-0 truncate text-right text-[13px] text-text-primary", mono && "font-mono text-xs", tone === "success" && "text-success", tone === "warning" && "text-warning")}>{value}</span>
    </div>
  );
}

function platformBadgeLabel(platform: NonNullable<SurgeConnection["platform"]>): string {
  switch (platform) {
    case "ios":
      return "iOS";
    case "tvos":
      return "Apple TV / tvOS";
    case "macos":
      return "macOS";
  }
}
