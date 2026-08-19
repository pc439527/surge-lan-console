import { NavLink } from "react-router-dom";
import { cn } from "@/lib/cn";
import { MOBILE_NAV } from "./nav";

export function MobileBottomNav() {
  return (
    <nav
      aria-label="Mobile navigation"
      className="glass fixed inset-x-0 bottom-0 z-40 flex h-14 items-stretch justify-around border-t border-border/40 lg:hidden"
    >
      {MOBILE_NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          className={({ isActive }) =>
            cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium outline-none transition-colors duration-hover focus-visible:bg-surface",
              isActive ? "text-accent" : "text-text-tertiary hover:text-text-secondary",
            )
          }
        >
          <item.icon className="h-5 w-5" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
