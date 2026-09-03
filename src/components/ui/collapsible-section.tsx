/**
 * Native <details>/<summary> disclosure — no client JS needed, works in a
 * server component. Used two ways on the tournament detail page: as the
 * single outer "Tournament Setup" wrapper around every setup section, and
 * again around each individual section inside it, so both a whole-page
 * collapse and a per-section collapse are available at once. `defaultOpen`
 * drives each instance's initial state independently (e.g. the outer one
 * open only while a tournament has little progress; each inner one open
 * only while ITS OWN section isn't done yet, per the existing setup-steps
 * status already computed on the page).
 */
export function CollapsibleSection({
  title,
  status,
  defaultOpen,
  children,
}: {
  title: string;
  status?: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="rounded-xl border border-surface-border bg-surface">
      <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-semibold text-neutral-900">
        <span>{title}</span>
        {status && <span className="text-xs font-normal text-neutral-400">{status}</span>}
      </summary>
      <div className="space-y-4 border-t border-surface-border p-4">{children}</div>
    </details>
  );
}
