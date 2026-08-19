import { useState } from "react";
import { Outlet } from "react-router-dom";
import { MobileBottomNav } from "./MobileBottomNav";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />

      <div className={collapsed ? "lg:pl-[72px]" : "lg:pl-[236px]"}>
        <TopBar />
        <main className="mx-auto max-w-[1600px] px-4 py-6 pb-24 md:px-6 lg:pb-6">
          <Outlet />
        </main>
      </div>

      <MobileBottomNav />
    </div>
  );
}
