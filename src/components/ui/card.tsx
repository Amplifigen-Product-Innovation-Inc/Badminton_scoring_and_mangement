import { cn } from "@/lib/utils/cn";

export function Card({
  children,
  className,
  padding = "md",
}: {
  children: React.ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg" | "none";
}) {
  const paddingClass =
    padding === "none" ? "" : padding === "sm" ? "p-3" : padding === "lg" ? "p-6" : "p-4";
  return (
    <div
      className={cn(
        "rounded-xl border border-surface-border bg-surface shadow-sm",
        paddingClass,
        className
      )}
    >
      {children}
    </div>
  );
}
