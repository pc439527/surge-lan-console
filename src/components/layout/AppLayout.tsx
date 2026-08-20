import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { cn } from "@/lib/cn";
import { MobileBottomNav } from "./MobileBottomNav";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

/**
 * Desktop content shell (v0.2.1, T13):
 *   - padding-inline: clamp(20px, 2vw, 36px)
 *   - Dashboard (/) and Configuration get the full 1920px budget
 *   - every other business page is capped at 1760px
 * Width is decided here once — pages never set their own container width.
 */
const WIDE_PATHS = ["/", "/configuration"];

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const { pathname } = useLocation();
  const wide = WIDE_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  return (
    <div className="min-h-screen">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />

      <div className={collapsed ? "lg:pl-[72px]" : "lg:pl-[236px]"}>
        <TopBar />
        <main
          className={cn(
            "mx-auto w-full px-[clamp(20px,2vw,36px)] py-6 pb-24 lg:pb-6",
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
