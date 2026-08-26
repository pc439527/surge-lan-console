import { NavLink } from "react-router-dom";
import { cn } from "@/lib/cn";
import { MOBILE_NAV } from "./nav";

export function MobileBottomNav() {
  return (
    <nav
      aria-label="移动端导航"
      data-testid="mobile-bottom-nav"
      className="glass fixed inset-x-0 bottom-0 z-40 flex min-h-14 items-stretch justify-around border-t border-border/60 lg:hidden"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        background: "color-mix(in srgb, var(--background) 92%, transparent)",
        boxShadow: "0 -8px 24px rgba(0, 0, 0, 0.08)",
      }}
    >
      {MOBILE_NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          className={({ isActive }) =>
            cn(
              "touch-target flex flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 text-xs font-medium outline-none transition-colors duration-hover focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50",
              isActive ? "text-accent" : "text-text-tertiary hover:text-text-secondary",
            )
          }
        >
          <item.icon className="h-5 w-5" aria-hidden="true" />
          <span className="max-w-full truncate">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}