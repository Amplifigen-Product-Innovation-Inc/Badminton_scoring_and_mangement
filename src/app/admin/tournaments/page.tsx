import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CreateTournamentDialog } from "@/components/admin/create-tournament-dialog";
import { Badge, LiveBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

function StatusBadge({ status }: { status: string }) {
  if (status === "IN_PROGRESS") return <LiveBadge label="IN PROGRESS" />;
  const tone = status === "CANCELLED" ? "error" : status === "OPEN" ? "brand" : "neutral";
  return <Badge tone={tone}>{status.charAt(0) + status.slice(1).toLowerCase()}</Badge>;
}

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

      {error && (
        <div className="mt-6">
          <ErrorState message="We couldn't load tournaments right now." reassurance="Try refreshing the page." />
        </div>
      )}

      {!error && (tournaments?.length ?? 0) === 0 && (
        <div className="mt-6">
          <EmptyState
            title="No tournaments yet"
            description="Create your first tournament to start adding players, groups, and matches."
            action={<CreateTournamentDialog />}
          />
        </div>
      )}

      {!error && (tournaments?.length ?? 0) > 0 && (
        <div className="mt-6 overflow-x-auto rounded-xl border border-surface-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-neutral-50 text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Format</th>
                <th className="px-4 py-3 font-medium">Courts</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Leaderboard</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {tournaments?.map((t) => (
                <tr key={t.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    <Link
                      href={`/admin/tournaments/${t.id}`}
                      className="text-brand-700 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-700"
                    >
                      {t.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-neutral-500">{formatDate(t.date)}</td>
                  <td className="px-4 py-3 text-neutral-500">{t.location ?? "—"}</td>
                  <td className="px-4 py-3 text-neutral-500">{t.format ?? "—"}</td>
                  <td className="px-4 py-3 text-neutral-500">{t.num_courts ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/tournaments/${t.id}#leaderboard`}
                      className="text-brand-700 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-700"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
