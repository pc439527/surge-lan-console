import { NavLink } from "react-router-dom";
import { PanelLeft, PanelLeftClose } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { useConnectionStore } from "@/stores/connection-store";
import { NAV_SECTIONS } from "./nav";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const connections = useConnectionStore((s) => s.connections);
  const activeId = useConnectionStore((s) => s.activeConnectionId);
  const active = connections.find((c) => c.id === activeId) ?? null;

  return (
    <aside
      className={cn(
        "glass fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border/40 transition-[width] duration-page ease-apple lg:flex",
        collapsed ? "w-[72px]" : "w-[236px]",
      )}
    >
      {/* Logo */}
      <div className={cn("flex h-14 items-center gap-2.5 border-b border-border/40 px-4", collapsed && "justify-center px-0")}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-accent text-sm font-bold text-white">
          S
        </div>
        {!collapsed && (
          <span className="truncate text-sm font-semibold text-text-primary">Surge LAN Console</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mb-5">
            {!collapsed && (
              <p className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                {section.title}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={item.label}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-sm px-2.5 py-2 text-[13px] font-medium outline-none transition-colors duration-hover ease-apple focus-visible:ring-2 focus-visible:ring-accent/50",
                      collapsed && "justify-center px-0",
                      isActive
                        ? "bg-accent/12 text-accent"
                        : "text-text-secondary hover:bg-surface hover:text-text-primary",
                    )
                  }
                >
                  <item.icon className="h-[18px] w-[18px] shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Current connection */}
      <div className="border-t border-border/40 p-3">
        {active ? (
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left outline-none transition-colors duration-hover hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/50",
              collapsed && "justify-center px-0",
            )}
            onClick={onToggle}
            title={active.name}
          >
            <span className="h-2 w-2 shrink-0 rounded-pill bg-success" />
            {!collapsed && (
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium text-text-primary">{active.name}</span>
                <span className="block truncate text-[11px] text-text-tertiary">
                  {active.host}:{active.port}
                </span>
              </span>
            )}
          </button>
        ) : (
          !collapsed && (
            <p className="px-2.5 text-[11px] text-text-tertiary">未连接</p>
          )
        )}
        {!collapsed && (
          <Button variant="ghost" size="sm" className="mt-1 w-full justify-start gap-2 text-text-secondary" onClick={onToggle}>
            <PanelLeftClose className="h-4 w-4" />
            收起
          </Button>
        )}
      </div>
      {collapsed && (
        <button
          type="button"
          aria-label="展开侧边栏"
          onClick={onToggle}
          className="absolute -right-3 top-1/2 z-10 flex h-6 w-6 items-center justify-center rounded-pill glass text-text-secondary hover:text-text-primary"
        >
          <PanelLeft className="h-3.5 w-3.5" />
        </button>
      )}
    </aside>
  );
}