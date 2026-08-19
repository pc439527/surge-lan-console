import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          "h-9 w-full rounded-sm border border-border bg-surface px-3 text-sm text-text-primary",
          "placeholder:text-text-tertiary",
          "outline-none transition-all duration-button ease-apple",
          "focus:border-accent/60 focus:ring-2 focus:ring-accent/30",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
