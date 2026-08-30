import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CreateTournamentDialog } from "@/components/admin/create-tournament-dialog";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-neutral-100 text-neutral-600",
  OPEN: "bg-blue-50 text-blue-700",
  IN_PROGRESS: "bg-emerald-50 text-emerald-700",
  COMPLETED: "bg-neutral-100 text-neutral-500",
  CANCELLED: "bg-red-50 text-red-700",
};

/** §10 Tournament list + create. Edit/cancel happen on the detail page. */
export default async function TournamentsPage() {
  const supabase = await createClient();
  const { data: tournaments, error } = await supabase
    .from("tournaments")
    .select("id, name, date, location, format, num_courts, status")
    .order("date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Tournaments</h1>
          <p className="mt-2 text-sm text-neutral-500">
            <span className="font-medium text-neutral-900">{tournaments?.length ?? 0}</span>{" "}
            total
          </p>
        </div>
        <CreateTournamentDialog />
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-neutral-200">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 font-medium">Format</th>
              <th className="px-4 py-3 font-medium">Courts</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {error && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-red-600">
                  {error.message}
                </td>
              </tr>
            )}
            {!error && (tournaments?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">
                  No tournaments yet.
                </td>
              </tr>
            )}
            {tournaments?.map((t) => (
              <tr key={t.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3 font-medium text-neutral-900">
                  <Link href={`/admin/tournaments/${t.id}`} className="hover:underline">
                    {t.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-neutral-500">{formatDate(t.date)}</td>
                <td className="px-4 py-3 text-neutral-500">{t.location ?? "—"}</td>
                <td className="px-4 py-3 text-neutral-500">{t.format ?? "—"}</td>
                <td className="px-4 py-3 text-neutral-500">{t.num_courts ?? "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      STATUS_STYLES[t.status] ?? "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {t.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
