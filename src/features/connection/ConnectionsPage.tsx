import { useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Pencil, Plus, Trash2, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
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

interface FormState {
  name: string;
  protocol: ConnectionProtocol;
  host: string;
  port: string;
  apiKey: string;
  remember: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  protocol: "http",
  host: "",
  port: "6171",
  apiKey: "",
  remember: false,
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
    });
    setFormOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.host.trim()) {
      toast.error("Name and host are required");
      return;
    }
    const data = {
      name: form.name.trim(),
      protocol: form.protocol,
      host: form.host.trim(),
      port: Number(form.port) || 6171,
    };

    if (editing) {
      updateConnection(editing.id, data);
      if (form.apiKey) saveApiKey(editing.id, form.apiKey, form.remember);
      toast.success("连接已更新");
    } else {
      const id = addConnection(data);
      if (form.apiKey) saveApiKey(id, form.apiKey, form.remember);
      setActive(id);
      toast.success("连接已添加");
    }
    setFormOpen(false);
  };

  const handleTest = async (conn: SurgeConnection) => {
    setTestingId(conn.id);
    try {
      // Prefer the provider client (active connection / demo mode), fall back to a
      // freshly built one when testing a non-active connection.
      const target = providerClient ?? buildClientFor(conn)?.client ?? null;
      if (target) {
        const result = await target.testConnection();
        if (result.ok) {
          toast.success(`已连接 · ${result.latencyMs ?? "?"}ms`);
          setActive(conn.id);
        }
        return;
      }
      // No stored key — require it through the edit form
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
    toast.success("连接已删除");
    setDeleteId(null);
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold text-text-primary">Connections</h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            管理局域网内的 Surge 实例
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          添加连接
        </Button>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {connections.length === 0 && (
          <Card className="md:col-span-2 xl:col-span-3">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <Wifi className="h-8 w-8 text-text-tertiary" />
              <p className="text-sm text-text-secondary">
                暂无连接。添加你的第一个 Surge 实例以开始使用。
              </p>
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Add Connection
              </Button>
            </CardContent>
          </Card>
        )}

        {connections.map((conn) => {
          const isActive = conn.id === activeId;
          const hasKey = loadApiKey(conn.id) !== null;
          return (
            <Card key={conn.id} className={cn(isActive && "border-accent/50")}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-pill", isActive ? "bg-success" : "bg-text-tertiary/50")} />
                  <span className="truncate">{conn.name}</span>
                  {isActive && <Badge>当前</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  {hasKey ? (
                    <Wifi className="h-4 w-4 text-success" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-warning" />
                  )}
                  <span className="font-mono text-[13px]">
                    {conn.protocol}://{conn.host}:{conn.port}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={testingId === conn.id}
                    onClick={() => handleTest(conn)}
                  >
                    {testingId === conn.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Test
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(conn)}>
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger hover:text-danger"
                    onClick={() => setDeleteId(conn.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Create/Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "编辑连接" : "添加连接"}</DialogTitle>
            <DialogDescription>
              连接元数据保存在本地；除非你选择记住，否则 API 密钥仅保存在
              sessionStorage 中。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">连接名称</label>
              <Input
                placeholder="Apple TV"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary">Protocol</label>
                <div className="flex rounded-sm border border-border bg-surface p-0.5">
                  {(["http", "https"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setForm({ ...form, protocol: p })}
                      className={cn(
                        "flex-1 rounded-xs py-1.5 text-xs font-medium capitalize transition-colors duration-hover",
                        form.protocol === p
                          ? "bg-accent/12 text-accent"
                          : "text-text-secondary hover:text-text-primary",
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary">Port</label>
                <Input
                  type="number"
                  value={form.port}
                  onChange={(e) => setForm({ ...form, port: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">Host</label>
              <Input
                placeholder="192.168.x.x"
                value={form.host}
                onChange={(e) => setForm({ ...form, host: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">API Key</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                autoComplete="off"
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
              <Switch
                checked={form.remember}
                onCheckedChange={(v) => setForm({ ...form, remember: v })}
                aria-label="记住 API 密钥"
              />
              Remember API Key
            </label>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave}>{editing ? "保存" : "添加"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除连接？</DialogTitle>
            <DialogDescription>
              这将删除连接及其存储的 API 密钥，此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}