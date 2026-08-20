import { useState } from "react";
import { Plus, Settings2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/Dialog";
import { cn } from "@/lib/cn";
import { useConnectionStore } from "@/stores/connection-store";

/** Phase 03 UI — full CRUD lands in Phase 05. */
export function ConnectionSwitcher() {
  const [open, setOpen] = useState(false);
  const connections = useConnectionStore((s) => s.connections);
  const activeId = useConnectionStore((s) => s.activeConnectionId);
  const setActive = useConnectionStore((s) => s.setActiveConnection);
  const active = connections.find((c) => c.id === activeId) ?? null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" className="max-w-[220px]">
          <span className={cn("h-2 w-2 shrink-0 rounded-pill", active ? "bg-success" : "bg-text-tertiary/50")} />
          <span className="truncate">{active ? active.name : "无连接"}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>连接</DialogTitle>
          <DialogDescription>切换 Surge 实例</DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          {connections.length === 0 && (
            <p className="py-4 text-center text-sm text-text-secondary">暂无连接</p>
          )}
          {connections.map((conn) => (
            <button
              key={conn.id}
              type="button"
              onClick={() => { setActive(conn.id); setOpen(false); }}
              className={cn(
                "flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-left outline-none transition-colors duration-hover focus-visible:ring-2 focus-visible:ring-accent/50",
                conn.id === activeId ? "bg-accent/12" : "hover:bg-surface",
              )}
            >
              <span className={cn("h-2 w-2 shrink-0 rounded-pill", conn.id === activeId ? "bg-success" : "bg-text-tertiary/50")} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-text-primary">{conn.name}</span>
                <span className="block truncate text-xs text-text-tertiary">
                  {conn.host}:{conn.port}
                </span>
              </span>
            </button>
          ))}
        </div>

        <DialogFooter className="justify-between">
          <Link to="/connections" className="flex items-center gap-1.5 text-sm text-accent hover:underline">
            <Settings2 className="h-4 w-4" />
            管理
          </Link>
          <Button size="sm" asChild>
            <Link to="/connections">
              <Plus className="h-4 w-4" />
              添加连接
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}