import { NavLink } from "react-router-dom";
import { PanelLeft, PanelLeftClose } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { useConnectionStore } from "@/stores/connection-store";
import { compactBuildLabel } from "@/lib/version";
import { isFeatureUnsupported } from "@/api/capability";
import { useCapabilitiesQuery } from "@/features/shared/capability";
import { NAV_SECTIONS } from "./nav";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const connections = useConnectionStore((s) => s.connections);
  const activeId = useConnectionStore((s) => s.activeConnectionId);
  const active = connections.find((c) => c.id === activeId) ?? null;
  const { data: capability } = useCapabilitiesQuery();

  return (
    <aside
      className={cn(
        "glass sidebar-glass fixed inset-y-0 left-0 z-40 hidden flex-col border-y-0 border-l-0 border-r border-border/50 transition-[width] duration-page ease-apple lg:flex",
        collapsed ? "w-[72px]" : "w-[236px]",
      )}
    >
      <div className={cn("flex h-16 items-center gap-2.5 border-b border-border/40 px-4", collapsed && "justify-center px-0")}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-accent text-sm font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.28),0_5px_14px_rgba(10,132,255,.22)]">
          S
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <span className="block truncate text-sm font-semibold tracking-[-0.01em] text-text-primary">Surge LAN Console</span>
            <span className="block truncate text-[11px] text-text-tertiary">Local Network Console</span>
          </div>
        )}
      </div>

      <nav className="scrollbar-none flex-1 overflow-y-auto px-3 py-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mb-5">
            {!collapsed && (
              <p className="mb-1.5 px-2 text-xs font-medium tracking-wide text-text-tertiary">
                {section.title}
              </p>
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                const unsupported = item.feature ? isFeatureUnsupported(capability, item.feature) : false;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    title={unsupported ? item.label + "（当前平台不可用）" : item.label}
                    className={({ isActive }) =>
                      cn(
                        "touch-target relative flex items-center gap-3 rounded-[11px] px-2.5 py-2 text-[13px] font-medium outline-none transition-all duration-hover ease-apple focus-visible:ring-2 focus-visible:ring-accent/50",
                        collapsed && "justify-center px-0",
                        unsupported && "opacity-55",
                        isActive
                          ? "sidebar-nav-active text-accent"
                          : "text-text-secondary hover:bg-surface/70 hover:text-text-primary",
                      )
                    }
                  >
                    <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {unsupported &&
                      (collapsed ? (
                        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-pill bg-warning" />
                      ) : (
                        <span className="ml-auto shrink-0 rounded-pill border border-border bg-surface px-1.5 py-0.5 text-[11px] leading-none text-text-tertiary">
                          不可用
                        </span>
                      ))}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 pt-0">
        {active ? (
          <button
            type="button"
            className={cn(
              "touch-target flex w-full items-center gap-2.5 rounded-[14px] border border-border/60 bg-surface/65 px-3 py-2.5 text-left outline-none transition-all duration-hover hover:bg-surface-primary/80 focus-visible:ring-2 focus-visible:ring-accent/50",
              collapsed && "justify-center px-0",
            )}
            onClick={onToggle}
            title={active.name}
          >
            <span className="h-2 w-2 shrink-0 rounded-pill bg-success shadow-[0_0_0_3px_color-mix(in_srgb,var(--success)_14%,transparent)]" />
            {!collapsed && (
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-text-primary">{active.name}</span>
                <span className="block truncate font-mono text-[11px] text-text-tertiary">
                  {active.host}:{active.port}
                </span>
              </span>
            )}
          </button>
        ) : (
          !collapsed && (
            <div className="rounded-[14px] border border-border/60 bg-surface/55 px-3 py-3">
              <p className="text-xs text-text-tertiary">未连接</p>
            </div>
          )
        )}
        {!collapsed && (
          <div className="mt-2 px-2.5">
            <p className="truncate font-mono text-[11px] text-text-tertiary">{compactBuildLabel()}</p>
          </div>
        )}
        {!collapsed && (
          <Button variant="ghost" size="sm" className="mt-1 w-full justify-start gap-2 text-text-secondary" onClick={onToggle}>
            <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
            收起
          </Button>
        )}
      </div>
      {collapsed && (
        <button
          type="button"
          aria-label="展开侧边栏"
          onClick={onToggle}
          className="touch-target glass absolute -right-4 top-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-pill text-text-secondary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <PanelLeft className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </aside>
  );
}
