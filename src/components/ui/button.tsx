import { forwardRef } from "react";
import { cn } from "@/lib/utils/cn";

type Variant = "primary" | "secondary" | "destructive" | "ghost" | "success";
type Size = "sm" | "md" | "lg" | "xl";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 disabled:bg-neutral-300",
  secondary:
    "bg-surface text-neutral-900 border border-surface-border hover:bg-neutral-100 disabled:text-neutral-400",
  destructive: "bg-error-500 text-white hover:bg-error-700 disabled:bg-neutral-300",
  ghost: "bg-transparent text-neutral-600 hover:bg-neutral-100 disabled:text-neutral-300",
  success: "bg-success-500 text-white hover:bg-success-700 disabled:bg-neutral-300",
};

// Every size stays >= 44px tall (--touch-target, §42) — this is a scoring
// app used one-handed while standing (§10-11), not a desktop form.
const SIZE_CLASSES: Record<Size, string> = {
  sm: "h-11 px-3 text-sm rounded-md",
  md: "h-11 px-4 text-base rounded-lg",
  lg: "h-14 px-5 text-lg font-semibold rounded-xl",
  xl: "h-20 px-6 text-xl font-semibold rounded-2xl",
};

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
>(function Button({ className, variant = "primary", size = "md", ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
      {...props}
    />
  );
});
