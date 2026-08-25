import { useState } from "react";
import { toast } from "sonner";
import { Check, ChevronRight, KeyRound, Loader2, Pencil, Plus, Server, Trash2, Wifi } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricStrip } from "@/components/ui/MetricStrip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { buildClientFor, useConnectionStore, type ConnectionProtocol, type SurgeConnection } from "@/stores/connection-store";
import { cn } from "@/lib/cn";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { CoreApiError } from "@/lib/core-api";

interface FormState {
  name: string;
  protocol: ConnectionProtocol;
  host: string;
  port: string;
  apiKey: string;
  platform: string;
}

const EMPTY_FORM: FormState = { name: "", protocol: "http", host: "", port: "6171", apiKey: "", platform: "auto" };

export function ConnectionsPage() {
  const connections = useConnectionStore((s) => s.connections);
  const activeId = useConnectionStore((s) => s.activeConnectionId);
  const addConnection = useConnectionStore((s) => s.addConnection);
  const updateConnection = useConnectionStore((s) => s.updateConnection);
  const removeConnection = useConnectionStore((s) => s.removeConnection);
  const setActive = useConnectionStore((s) => s.setActiveConnection);
  const [editing, setEditing] = useState<SurgeConnection | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = connections.find((c) => c.id === selectedId) ?? connections.find((c) => c.id === activeId) ?? connections[0] ?? null;
  const vaultCount = connections.filter((c) => c.hasApiKey).length;

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setFormOpen(true); };
  const openEdit = (conn: SurgeConnection) => {
    setEditing(conn);
    setForm({ name: conn.name, protocol: conn.protocol, host: conn.host, port: String(conn.port), apiKey: "", platform: conn.platform ?? "auto" });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.host.trim()) { toast.error("连接名称和主机地址不能为空"); return; }
    if (!editing && !form.apiKey.trim()) { toast.error("新连接需要填写 Surge API Key"); return; }
    setBusy(true);
    try {
      const data = {
        name: form.name.trim(), protocol: form.protocol, host: form.host.trim(), port: Number(form.port) || 6171,
        platform: (form.platform === "auto" ? undefined : form.platform) as SurgeConnection["platform"],
        ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
      };
      if (editing) {
        await updateConnection(editing.id, data);
        setSelectedId(editing.id);
        toast.success("连接已更新；API Key 由 Core Vault 管理");
      } else {
        const id = await addConnection(data);
        setActive(id);
        setSelectedId(id);
        toast.success("连接已保存到 SQLite");
      }
      setFormOpen(false);
    } catch (error) {
      toast.error(error instanceof CoreApiError ? error.message : "保存连接失败");
    } finally { setBusy(false); }
  };

  const handleTest = async (conn: SurgeConnection) => {
    const target = buildClientFor(conn)?.client;
    if (!target) { toast.error("该连接尚未配置 API Key"); return; }
    setTestingId(conn.id);
    try {
      const result = await target.testConnection();
      if (result.reachable && result.authenticated) {
        toast.success(`Surge 可达 · ${result.latencyMs ?? "?"}ms`);
        setActive(conn.id); setSelectedId(conn.id);
      } else if (result.reachable) toast.error(`Surge 可达，但 API Key 未通过认证 · ${result.latencyMs ?? "?"}ms`);
      else toast.error(result.error?.message ?? "无法连接 Surge");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "测试失败");
    } finally { setTestingId(null); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setBusy(true);
    try {
      await removeConnection(deleteId);
      if (selectedId === deleteId) setSelectedId(null);
      setDeleteId(null);
      toast.success("连接及其 Vault 密钥已删除");
    } catch (error) {
      toast.error(error instanceof CoreApiError ? error.message : "删除失败");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader title="连接" description="Surge 连接保存在 Core SQLite；API Key 仅以加密密文存入 Vault。" actions={<Button onClick={openCreate}><Plus className="h-4 w-4" />添加连接</Button>} />
      <MetricStrip items={[
        { label: "已保存", value: connections.length, detail: "SQLite 连接", tone: "accent" },
        { label: "当前连接", value: connections.find((c) => c.id === activeId)?.name ?? "—", detail: activeId ? "活动实例" : "尚未选择", tone: activeId ? "success" : "muted" },
        { label: "Core Proxy", value: connections.length, detail: "统一安全转发", tone: connections.length ? "success" : "muted" },
        { label: "Vault 密钥", value: vaultCount, detail: "AES-256-GCM", tone: vaultCount ? "success" : "muted" },
      ]} />

      {connections.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-14 text-center"><Wifi className="h-8 w-8 text-text-tertiary" /><div><p className="text-sm font-medium text-text-primary">暂无连接</p><p className="mt-1 text-sm text-text-secondary">添加 Surge 实例后，Core 会负责安全代理和凭据注入。</p></div><Button onClick={openCreate}><Plus className="h-4 w-4" />添加连接</Button></CardContent></Card>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="min-w-0 overflow-hidden"><CardHeader className="pb-2"><div className="flex items-center justify-between gap-3"><CardTitle>设备</CardTitle><span className="text-xs text-text-tertiary">{connections.length} 个 Core 连接</span></div></CardHeader><CardContent className="p-2 pt-1"><div className="divide-y divide-border/50">
            {connections.map((conn) => {
              const isActive = conn.id === activeId; const isSelected = selected?.id === conn.id;
              return <button key={conn.id} type="button" onClick={() => setSelectedId(conn.id)} className={cn("group flex w-full items-center gap-3 rounded-[14px] px-3 py-3.5 text-left outline-none transition-colors duration-hover focus-visible:ring-2 focus-visible:ring-accent/50", isSelected ? "bg-accent/8" : "hover:bg-elevated/55")}>
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-pill", isActive ? "bg-success" : conn.hasApiKey ? "bg-text-tertiary/55" : "bg-warning")} />
                <span className="min-w-0 flex-1"><span className="flex min-w-0 items-center gap-2"><span className="truncate text-sm font-semibold text-text-primary">{conn.name}</span>{isActive && <Badge variant="success">当前</Badge>}<Badge variant="info">Core</Badge></span><span className="mt-1 block truncate font-mono text-xs text-text-tertiary">{conn.protocol}://{conn.host}:{conn.port}</span></span>
                {!conn.hasApiKey && <Badge variant="warning">缺少密钥</Badge>}<ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5" />
              </button>;
            })}
          </div></CardContent></Card>

          {selected && <Card className="lg:sticky lg:top-24"><CardHeader className="pb-2"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><CardTitle className="truncate text-[17px]">{selected.name}</CardTitle><p className="mt-1 truncate font-mono text-xs text-text-tertiary">{selected.protocol}://{selected.host}:{selected.port}</p></div>{selected.id === activeId ? <Badge variant="success">当前设备</Badge> : <Badge variant="muted">已保存</Badge>}</div></CardHeader><CardContent className="space-y-4">
            <div className="divide-y divide-border/50"><InfoRow label="API 密钥" value={selected.hasApiKey ? "Vault 已加密" : "未配置"} tone={selected.hasApiKey ? "success" : "warning"} /><InfoRow label="访问方式" value="Core 安全代理" /><InfoRow label="平台" value={selected.platform ? platformBadgeLabel(selected.platform) : "自动检测"} /><InfoRow label="协议" value={selected.protocol.toUpperCase()} mono /></div>
            <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4"><Button size="sm" variant="secondary" disabled={testingId === selected.id} onClick={() => void handleTest(selected)}>{testingId === selected.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}{testingId === selected.id ? "测试中…" : "测试连接"}</Button>{selected.id !== activeId && <Button size="sm" onClick={() => setActive(selected.id)}>设为当前</Button>}<Button size="sm" variant="ghost" onClick={() => openEdit(selected)}><Pencil className="h-3.5 w-3.5" />编辑</Button><Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => setDeleteId(selected.id)}><Trash2 className="h-3.5 w-3.5" />删除</Button></div>
          </CardContent></Card>}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}><DialogContent><DialogHeader><DialogTitle>{editing ? "编辑连接" : "添加连接"}</DialogTitle><DialogDescription>{editing ? "API Key 留空会保留 Vault 中的现有密钥；填写新值才会替换。" : "API Key 提交后立即由 Core 加密；浏览器不会持久化保存。"}</DialogDescription></DialogHeader>
        <div className="space-y-4"><div className="space-y-1.5"><label className="text-xs font-medium text-text-secondary">连接名称</label><Input placeholder="Apple TV" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><label className="text-xs font-medium text-text-secondary">协议</label><div className="flex rounded-sm border border-border bg-surface p-0.5">{(["http", "https"] as const).map((protocol) => <button key={protocol} type="button" onClick={() => setForm({ ...form, protocol })} className={cn("flex-1 rounded-xs py-1.5 text-xs font-medium uppercase transition-colors", form.protocol === protocol ? "bg-accent/12 text-accent" : "text-text-secondary")}>{protocol}</button>)}</div></div><div className="space-y-1.5"><label className="text-xs font-medium text-text-secondary">端口</label><Input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} /></div></div>
          <div className="space-y-1.5"><label className="text-xs font-medium text-text-secondary">主机地址</label><Input placeholder="192.168.x.x" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} /><p className="text-xs text-text-tertiary">Core 只允许连接解析到局域网/链路本地/Tailscale 地址的已登记目标。</p></div>
          <div className="space-y-1.5"><label className="text-xs font-medium text-text-secondary">平台</label><Select value={form.platform} onValueChange={(value) => setForm({ ...form, platform: value })}><SelectTrigger className="w-full"><SelectValue placeholder="自动检测" /></SelectTrigger><SelectContent><SelectItem value="auto">自动检测</SelectItem><SelectItem value="ios">Surge iOS</SelectItem><SelectItem value="tvos">Apple TV / tvOS</SelectItem><SelectItem value="macos">Surge macOS</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5"><label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary"><KeyRound className="h-3.5 w-3.5" />API 密钥</label><Input type="password" placeholder={editing ? "留空以保留现有密钥" : "Surge HTTP API Key"} value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} autoComplete="off" /></div>
          <div className="flex gap-2 rounded-sm border border-border/60 bg-surface-tertiary/45 px-3 py-2.5 text-xs leading-5 text-text-tertiary"><Server className="mt-0.5 h-4 w-4 shrink-0" /><span>浏览器仅保存当前连接 ID。连接元数据写入 SQLite；真实 X-Key 由 Core 解密后在服务端请求时注入。</span></div>
        </div><DialogFooter><Button variant="ghost" onClick={() => setFormOpen(false)}>取消</Button><Button disabled={busy} onClick={() => void handleSave()}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{editing ? "保存" : "添加"}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}><DialogContent><DialogHeader><DialogTitle>删除连接？</DialogTitle><DialogDescription>这将同时删除 SQLite 连接记录和 Vault 中的加密 API Key。</DialogDescription></DialogHeader><DialogFooter><Button variant="ghost" onClick={() => setDeleteId(null)}>取消</Button><Button variant="destructive" disabled={busy} onClick={() => void handleDelete()}>删除</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function InfoRow({ label, value, tone, mono }: { label: string; value: string; tone?: "success" | "warning"; mono?: boolean }) {
  return <div className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0"><span className="text-[13px] text-text-secondary">{label}</span><span className={cn("min-w-0 truncate text-right text-[13px] text-text-primary", mono && "font-mono text-xs", tone === "success" && "text-success", tone === "warning" && "text-warning")}>{value}</span></div>;
}

function platformBadgeLabel(platform: NonNullable<SurgeConnection["platform"]>): string {
  if (platform === "ios") return "iOS";
  if (platform === "tvos") return "Apple TV / tvOS";
  return "macOS";
}
