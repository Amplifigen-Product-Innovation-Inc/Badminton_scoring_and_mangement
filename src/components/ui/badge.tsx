import { cn } from "@/lib/utils/cn";

type Tone = "neutral" | "success" | "warning" | "error" | "brand";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-neutral-100 text-neutral-700",
  success: "bg-success-50 text-success-700",
  warning: "bg-warning-50 text-warning-700",
  error: "bg-error-50 text-error-700",
  brand: "bg-brand-50 text-brand-700",
};

/** Generic status pill. Always render text, never rely on color alone (§42). */
export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        TONE_CLASSES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** "● LIVE" indicator — the dot pulses, the word LIVE is the actual signal. */
export function LiveBadge({ label = "LIVE", className }: { label?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-live-500/10 px-2.5 py-1 text-xs font-bold tracking-wide text-live-600",
        className
      )}
    >
      <span className="h-1.5 w-1.5 animate-live-pulse rounded-full bg-live-500" aria-hidden />
      {label}
    </span>
  );
}

const CATEGORY_STYLES: Record<string, { fg: string; bg: string }> = {
  BEGINNER: { fg: "text-[var(--color-cat-beginner)]", bg: "bg-[var(--color-cat-beginner-bg)]" },
  INTERMEDIATE: {
    fg: "text-[var(--color-cat-intermediate)]",
    bg: "bg-[var(--color-cat-intermediate-bg)]",
  },
  ADVANCED: { fg: "text-[var(--color-cat-advanced)]", bg: "bg-[var(--color-cat-advanced-bg)]" },
  OPEN: { fg: "text-[var(--color-cat-open)]", bg: "bg-[var(--color-cat-open-bg)]" },
};

/** Category badge — color is decoration; the label text is the identifier. */
export function CategoryBadge({ category, className }: { category: string; className?: string }) {
  const style = CATEGORY_STYLES[category.toUpperCase()] ?? CATEGORY_STYLES.OPEN;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
        style.bg,
        style.fg,
        className
      )}
    >
      {category.toLowerCase()}
    </span>
  );
}

/** NEW / RETURNING player status — deliberately quiet per §23. */
export function PlayerStatusBadge({ status }: { status: "NEW" | "RETURNING" }) {
  return (
    <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
      {status === "NEW" ? "New" : "Returning"}
    </span>
  );
}
