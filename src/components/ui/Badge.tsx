import { cva, type VariantProps } from "class-variance-authority";
import { type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-accent/12 text-accent",
        success: "bg-success/12 text-success",
        warning: "bg-warning/15 text-warning",
        danger: "bg-danger/12 text-danger",
        muted: "bg-surface text-text-tertiary border border-border",
        info: "bg-accent/10 text-accent border border-accent/20",
        purple: "bg-chart-download/10 text-chart-download border border-chart-download/20",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}