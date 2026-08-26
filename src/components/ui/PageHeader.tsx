import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
}

/**
 * Shared page heading for management views.
 * Keeps title scale, spacing and action alignment consistent across the console.
 */
export function PageHeader({ title, description, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-xs font-medium text-text-tertiary">{eyebrow}</p>
        )}
        <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-text-primary">
          {title}
        </h1>
        {description && (
          <div className="mt-1 max-w-3xl text-sm leading-5 text-text-secondary">{description}</div>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
