import { createClient } from "@/lib/supabase/server";
import { CreateCourtDialog } from "@/components/admin/create-court-dialog";
import { DeleteCourtButton } from "@/components/admin/delete-court-button";

/** §48 global court registry. Per-tournament assignment/status lives on
 * each tournament's detail page (3.5). */
export default async function CourtsPage() {
  const supabase = await createClient();
  const { data: courts, error } = await supabase
    .from("courts")
    .select("id, name")
    .order("name");

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Courts</h1>
          <p className="mt-2 text-sm text-neutral-500">
            <span className="font-medium text-neutral-900">{courts?.length ?? 0}</span> total
          </p>
        </div>
        <CreateCourtDialog />
      </div>

      <div className="mt-6 divide-y divide-neutral-100 rounded-xl border border-surface-border bg-surface">
        {error && <p className="px-4 py-6 text-center text-error-500">We couldn’t load courts right now.</p>}
        {!error && (courts?.length ?? 0) === 0 && (
          <p className="px-4 py-6 text-center text-neutral-400">No courts yet.</p>
        )}
        {courts?.map((c) => (
          <div key={c.id} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-medium text-neutral-900">{c.name}</span>
            <DeleteCourtButton id={c.id} name={c.name} />
          </div>
        ))}
      </div>
    </main>
  );
}
