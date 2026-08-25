import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { cn } from "@/lib/cn";
import { MobileBottomNav } from "./MobileBottomNav";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

const WIDE_PATHS = ["/", "/configuration", "/node-quality"];

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const { pathname } = useLocation();
  const wide = WIDE_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  return (
    <div className="app-shell min-h-screen">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />

      <div className={cn("transition-[padding] duration-page ease-apple", collapsed ? "lg:pl-[72px]" : "lg:pl-[236px]")}>
        <TopBar />
        <main
          className={cn(
            "mx-auto w-full min-w-0 max-w-full px-4 py-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-5 sm:py-5 lg:px-[clamp(24px,2.2vw,40px)] lg:py-7 lg:pb-8",
            wide ? "max-w-[1920px]" : "max-w-[1760px]",
          )}
        >
          <Outlet />
        </main>
      </div>

      <MobileBottomNav />
    </div>
  );
}
