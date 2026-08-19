import { AppearanceSwitcher } from "@/components/ui/AppearanceSwitcher";
import { ConnectionSwitcher } from "./ConnectionSwitcher";

export function TopBar() {
  return (
    <header className="glass sticky top-0 z-30 flex h-14 items-center justify-end gap-3 border-b border-border/40 px-4 md:px-6">
      <div className="flex items-center gap-3">
        <ConnectionSwitcher />
        <div className="hidden md:block">
          <AppearanceSwitcher />
        </div>
      </div>
    </header>
  );
}
