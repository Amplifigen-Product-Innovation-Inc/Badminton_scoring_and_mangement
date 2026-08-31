import { cn } from "@/lib/utils/cn";

export type ProgressStepStatus = "done" | "live" | "upcoming";

export function TournamentProgress({
  steps,
}: {
  steps: { label: string; status: ProgressStepStatus }[];
}) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Tournament progress">
      {steps.map((step, i) => (
        <li key={step.label} className="flex items-center gap-1.5">
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
              step.status === "done" && "bg-success-50 text-success-700",
              step.status === "live" && "bg-brand-50 text-brand-700",
              step.status === "upcoming" && "bg-neutral-100 text-neutral-400"
            )}
          >
            <span aria-hidden>
              {step.status === "done" ? "✓" : step.status === "live" ? "●" : "○"}
            </span>
            {step.label}
            {step.status === "live" && <span className="sr-only">(in progress)</span>}
          </span>
          {i < steps.length - 1 && <span className="h-px w-4 bg-neutral-200" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}
