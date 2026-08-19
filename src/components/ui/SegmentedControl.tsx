import { type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

export interface SegmentedControlProps<T extends string>
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  label?: string;
}

/** Liquid Glass segmented control — iOS 26 style. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "sm",
  label,
  className,
  ...props
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "glass inline-flex items-center gap-0.5 rounded-sm p-1",
        size === "sm" ? "h-8" : "h-9",
        className,
      )}
      {...props}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex h-full items-center justify-center gap-1.5 rounded-xs px-3 text-[13px] font-medium outline-none transition-all duration-button ease-apple focus-visible:ring-2 focus-visible:ring-accent/50",
              active
                ? "bg-white/70 text-text-primary shadow-sm dark:bg-white/15"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
