import { Badge } from "@/components/ui/Badge";
import { AppearanceSwitcher } from "@/components/ui/AppearanceSwitcher";
import { usePreferencesStore } from "@/stores/preferences-store";
import { ConnectionSwitcher } from "./ConnectionSwitcher";
import { MobileNavDrawer } from "./MobileNavDrawer";

export function TopBar() {
  const demoMode = usePreferencesStore((s) => s.demoMode);

  return (
    <header className="glass topbar-glass sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-x-0 border-t-0 px-3 md:px-6 lg:px-7">
      <div className="flex min-w-0 items-center gap-3">
        <div className="lg:hidden">
          <MobileNavDrawer />
        </div>
        <span className="truncate text-sm font-semibold text-text-primary">Surge LAN Console</span>
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
