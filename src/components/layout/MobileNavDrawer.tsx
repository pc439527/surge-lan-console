import { NavLink } from "react-router-dom";
import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/Drawer";
import { cn } from "@/lib/cn";
import { NAV_SECTIONS } from "./nav";

/**
 * Mobile / iPad-Portrait navigation (OPTIMIZATION_PLAN §50): instead of a
 * permanent left sidebar, a ☰ button opens the full nav in a drawer. The
 * bottom tab bar stays for the 5 most-used routes; the drawer covers the rest.
 */
export function MobileNavDrawer() {
  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="ghost" size="sm" className="px-2 text-text-secondary" aria-label="打开导航">
          <PanelLeft className="h-5 w-5" />
        </Button>
      </DrawerTrigger>
      <DrawerContent side="left" className="w-[min(85vw,300px)] rounded-r-xl">
        <DrawerHeader>
          <DrawerTitle>Surge LAN Console</DrawerTitle>
        </DrawerHeader>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="mb-5">
              <p className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                {section.title}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-sm px-2.5 py-2 text-[13px] font-medium transition-colors duration-hover",
                        isActive
                          ? "bg-accent/12 text-accent"
                          : "text-text-secondary hover:bg-surface hover:text-text-primary",
                      )
                    }
                  >
                    <item.icon className="h-[18px] w-[18px] shrink-0" />
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </DrawerContent>
    </Drawer>
  );
}