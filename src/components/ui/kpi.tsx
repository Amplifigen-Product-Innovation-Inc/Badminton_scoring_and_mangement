import { cn } from "@/lib/utils/cn";

export function KPI({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "neutral" | "brand" | "warning";
}) {
  const valueTone =
    tone === "brand" ? "text-brand-700" : tone === "warning" ? "text-warning-700" : "text-neutral-900";
  return (
    <div className="rounded-xl border border-surface-border bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={cn("font-score mt-1 text-3xl", valueTone)}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-neutral-400">{hint}</p>}
    </div>
  );
}
