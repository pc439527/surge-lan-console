import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { cn } from "@/lib/cn";
import { MobileBottomNav } from "./MobileBottomNav";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

const DATA_DENSE_PATHS = ["/", "/configuration", "/requests", "/traffic", "/dns", "/rules", "/events"];
const MEDIUM_PATHS = ["/policies", "/node-quality"];
const COMPACT_PREFIXES = ["/fleet", "/health"];

function pathMatches(pathname: string, paths: string[]) {
  return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const { pathname } = useLocation();
  const compact = pathMatches(pathname, COMPACT_PREFIXES) || pathname === "/connections" || pathname === "/settings";

  const widthClass = pathMatches(pathname, DATA_DENSE_PATHS)
    ? "max-w-[1920px]"
    : pathMatches(pathname, MEDIUM_PATHS)
      ? "max-w-[1600px]"
      : compact
        ? "max-w-[1440px]"
        : "max-w-[1760px]";

  return (
    <div className="app-shell min-h-screen">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />

      <div className={cn("transition-[padding] duration-page ease-apple", collapsed ? "lg:pl-[72px]" : "lg:pl-[236px]")}>
        <TopBar />
        <main
          className={cn(
            "mx-auto w-full min-w-0 max-w-full px-4 py-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-5 sm:py-5 lg:px-[clamp(24px,2.2vw,40px)] lg:py-7 lg:pb-8",
            widthClass,
          )}
        >
          <Outlet />
        </main>
      </div>

      <MobileBottomNav />
    </div>
  );
}
