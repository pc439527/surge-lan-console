import { type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-[color:var(--elevated)]/70",
        "dark:bg-[color:var(--elevated)]",
        className,
      )}
      {...props}
    />
  );
}
