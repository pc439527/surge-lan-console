import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { cn } from "@/lib/cn";
import { MobileBottomNav } from "./MobileBottomNav";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

function pageKey(pathname: string) {
  if (pathname === "/") return "dashboard";
  return pathname.split("/").filter(Boolean)[0] ?? "dashboard";
}

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const { pathname } = useLocation();

  return (
    <div className="app-shell min-h-screen">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((current) => !current)} />

      <div className={cn("transition-[padding] duration-page ease-apple", collapsed ? "lg:pl-[72px]" : "lg:pl-[236px]")}>
        <TopBar />
        <main
          data-page={pageKey(pathname)}
          className="page-container mx-auto w-full min-w-0 max-w-[1600px] px-4 py-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-5 sm:py-5 lg:px-[clamp(24px,2.2vw,40px)] lg:py-7 lg:pb-8"
        >
          <Outlet />
        </main>
      </div>

      <MobileBottomNav />
    </div>
  );
}
