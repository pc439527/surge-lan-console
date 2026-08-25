import { useLocation } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import { AppearanceSwitcher } from "@/components/ui/AppearanceSwitcher";
import { usePreferencesStore } from "@/stores/preferences-store";
import { ConnectionSwitcher } from "./ConnectionSwitcher";
import { MobileNavDrawer } from "./MobileNavDrawer";
import { NAV_SECTIONS } from "./nav";

function currentPageLabel(pathname: string): string {
  const items = NAV_SECTIONS.flatMap((section) => section.items);
  const exact = items.find((item) => item.to === pathname);
  if (exact) return exact.label;
  const nested = items
    .filter((item) => item.to !== "/" && pathname.startsWith(item.to + "/"))
    .sort((a, b) => b.to.length - a.to.length)[0];
  return nested?.label ?? "仪表盘";
}

export function TopBar() {
  const demoMode = usePreferencesStore((s) => s.demoMode);
  const { pathname } = useLocation();
  const pageLabel = currentPageLabel(pathname);

  return (
    <header className="glass topbar-glass sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-x-0 border-t-0 px-3 md:px-6 lg:px-7">
      <div className="flex min-w-0 items-center gap-3">
        <div className="lg:hidden">
          <MobileNavDrawer />
        </div>
        <div className="min-w-0">
          <span className="text-sm font-semibold text-text-primary lg:hidden">Surge LAN Console</span>
          <div className="hidden min-w-0 flex-col lg:flex">
            <span className="text-[11px] font-medium text-text-tertiary">Surge LAN Console</span>
            <span className="truncate text-sm font-semibold text-text-primary">{pageLabel}</span>
          </div>
        </div>
        {demoMode && (
          <Badge variant="warning" className="ml-1">DEMO</Badge>
        )}
      </div>
      <div className="flex items-center gap-2.5 md:gap-3">
        <ConnectionSwitcher />
        <div className="hidden md:block">
          <AppearanceSwitcher />
        </div>
      </div>
    </header>
  );
}
