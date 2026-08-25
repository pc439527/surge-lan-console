import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type MetricStripTone = "accent" | "success" | "warning" | "danger" | "muted";

export interface MetricStripItem {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: MetricStripTone;
}

const dotClass: Record<MetricStripTone, string> = {
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  muted: "bg-text-tertiary",
};

/**
 * Compact summary surface used instead of a row of equal-weight metric cards.
 * Two columns on mobile, four columns from md upward.
 */
export function MetricStrip({ items, className }: { items: MetricStripItem[]; className?: string }) {
  return (
    <div className={cn("content-panel overflow-hidden rounded-[16px]", className)}>
      <div className="grid grid-cols-2 md:grid-cols-4">
        {items.map((item, index) => {
          const tone = item.tone ?? "muted";
          return (
            <div
              key={item.label}
              className={cn(
                "min-w-0 px-4 py-4 sm:px-5",
                index % 2 === 1 && "border-l border-border/60",
                index >= 2 && "border-t border-border/60 md:border-t-0",
                index > 0 && "md:border-l md:border-border/60",
                index % 2 === 0 && index > 0 && "md:border-l",
              )}
            >
              <div className="flex items-center gap-2 text-xs text-text-secondary">
                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-pill", dotClass[tone])} />
                <span className="truncate">{item.label}</span>
              </div>
              <div className="mt-1.5 truncate text-[22px] font-semibold tracking-[-0.025em] tabular-nums text-text-primary sm:text-[24px]">
                {item.value}
              </div>
              {item.detail && (
                <div className="mt-1 truncate text-xs text-text-tertiary">{item.detail}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
