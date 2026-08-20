import { Badge } from "@/components/ui/Badge";
import { AppearanceSwitcher } from "@/components/ui/AppearanceSwitcher";
import { usePreferencesStore } from "@/stores/preferences-store";
import { ConnectionSwitcher } from "./ConnectionSwitcher";
import { MobileNavDrawer } from "./MobileNavDrawer";

export function TopBar() {
  const demoMode = usePreferencesStore((s) => s.demoMode);

  return (
    <header className="glass sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border/40 px-3 md:px-6">
      <div className="flex items-center gap-2">
        <div className="lg:hidden">
          <MobileNavDrawer />
        </div>
        <span className="text-sm font-semibold text-text-primary lg:hidden">Surge LAN Console</span>
        {demoMode && (
          <Badge variant="warning" className="ml-1">DEMO</Badge>
        )}
      </div>
      <div className="flex items-center gap-3">
        <ConnectionSwitcher />
        <div className="hidden md:block">
          <AppearanceSwitcher />
        </div>
      </div>
    </header>
  );
}