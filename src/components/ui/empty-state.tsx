import type { ReactNode } from "react";

/**
 * §32 — every empty state answers: what happened, why is it empty, what do
 * I do next. Never render a bare "No data".
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-surface-border px-6 py-12 text-center">
      {icon && <div className="mb-3 text-neutral-300">{icon}</div>}
      <p className="text-base font-semibold text-neutral-900">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-neutral-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
