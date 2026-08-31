import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AddPlayerDialog } from "@/components/admin/add-player-dialog";
import { Card } from "@/components/ui/card";
import { CategoryBadge, PlayerStatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";

type Filter = "all" | "new" | "returning";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

/**
 * §22-24 — player management as an operational view: a dense table on
 * desktop, cards on mobile, category/status shown as badges rather than
 * plain columns of text.
 */
export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const { q = "", filter: rawFilter = "all" } = await searchParams;
  const filter: Filter = rawFilter === "new" || rawFilter === "returning" ? rawFilter : "all";

  const supabase = await createClient();
  let query = supabase.from("player_directory").select("*").order("name");

  if (q.trim()) {
    const term = q.trim();
    query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%`);
  }
  if (filter !== "all") {
    query = query.eq("is_returning", filter === "returning");
  }

  const { data: players, error } = await query;

  const totalQuery = await supabase.from("player_directory").select("is_returning");
  const total = totalQuery.data?.length ?? 0;
  const returning = totalQuery.data?.filter((p) => p.is_returning).length ?? 0;
  const newCount = total - returning;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Players</h1>
          <div className="mt-2 flex gap-6 text-sm text-neutral-500">
            <span>
              <span className="font-medium text-neutral-900">{total}</span> total
            </span>
            <span>
              <span className="font-medium text-neutral-900">{newCount}</span> new
            </span>
            <span>
              <span className="font-medium text-neutral-900">{returning}</span> returning
            </span>
          </div>
        </div>
        <AddPlayerDialog />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <form className="min-w-[240px] flex-1">
          <input type="hidden" name="filter" value={filter} />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search by name or email…"
            className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </form>
        <div className="flex gap-1 rounded-lg border border-surface-border p-1">
          {(["all", "new", "returning"] as const).map((f) => (
            <Link
              key={f}
              href={`/admin/players?filter=${f}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`rounded-md px-3 py-1.5 text-sm capitalize ${
                filter === f ? "bg-brand-600 text-white" : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {f}
            </Link>
          ))}
        </div>
      </div>

      {error && (
        <div className="mt-6">
          <ErrorState message="We couldn't load players right now." reassurance="Try refreshing the page." />
        </div>
      )}

      {!error && (players?.length ?? 0) === 0 && (
        <div className="mt-6">
          <EmptyState
            title="No players found"
            description={
              q.trim()
                ? `No player matches "${q}". Try a different search.`
                : "Add players to start building your tournament."
            }
            action={!q.trim() ? <AddPlayerDialog /> : undefined}
          />
        </div>
      )}

      {!error && (players?.length ?? 0) > 0 && (
        <>
          {/* Desktop: dense table */}
          <div className="mt-6 hidden overflow-x-auto rounded-xl border border-surface-border md:block">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-neutral-50 text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Player</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Tournaments</th>
                  <th className="px-4 py-3 font-medium">Matches</th>
                  <th className="px-4 py-3 font-medium">Wins</th>
                  <th className="px-4 py-3 font-medium">Win %</th>
                  <th className="px-4 py-3 font-medium">Rating</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Last Played</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {players?.map((p) => (
                  <tr key={p.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/players/${p.id}`}
                        className="font-medium text-brand-700 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-700"
                      >
                        {p.name}
                      </Link>
                      <div>
                        <PlayerStatusBadge status={p.is_returning ? "RETURNING" : "NEW"} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-neutral-500">{p.email}</td>
                    <td className="px-4 py-3">{p.tournaments_played}</td>
                    <td className="px-4 py-3">{p.matches_played}</td>
                    <td className="px-4 py-3">{p.matches_won}</td>
                    <td className="px-4 py-3">{p.win_pct != null ? `${p.win_pct}%` : "—"}</td>
                    <td className="px-4 py-3 font-score text-base">{p.current_rating ?? "—"}</td>
                    <td className="px-4 py-3">
                      {p.current_category ? <CategoryBadge category={p.current_category} /> : "—"}
                    </td>
                    <td className="px-4 py-3 text-neutral-500">{formatDate(p.last_played)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="mt-6 space-y-3 md:hidden">
            {players?.map((p) => (
              <Card key={p.id} padding="md">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/admin/players/${p.id}`}>
                    <p className="font-medium text-brand-700 underline decoration-brand-200 underline-offset-2">
                      {p.name}
                    </p>
                    <p className="text-xs text-neutral-500">{p.email}</p>
                  </Link>
                  <div className="text-right">
                    <p className="font-score text-xl text-neutral-900">{p.current_rating ?? "—"}</p>
                    {p.current_category && <CategoryBadge category={p.current_category} />}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-neutral-500">
                  <PlayerStatusBadge status={p.is_returning ? "RETURNING" : "NEW"} />
                  <span>
                    {p.matches_won}/{p.matches_played} wins ·{" "}
                    {p.win_pct != null ? `${p.win_pct}%` : "—"}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
