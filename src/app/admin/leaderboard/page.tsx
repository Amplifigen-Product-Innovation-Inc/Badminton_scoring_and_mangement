import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { CategoryBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";

type SortKey = "rating" | "points";

const CONFIDENCE_LABEL: Record<string, string> = {
  PROVISIONAL: "Provisional",
  EMERGING: "Emerging",
  ESTABLISHED: "Established",
};

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

/**
 * §26/§46 — the global leaderboard: every player, ranked either by current
 * rating or by career tournament points, foundation for the eventual
 * player-facing "where do I stand" view.
 */
export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort: rawSort = "rating" } = await searchParams;
  const sort: SortKey = rawSort === "points" ? "points" : "rating";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (profile?.role !== "ADMIN") redirect("/scorer");

  const { data: rows, error } = await supabase.rpc("player_leaderboard");

  const sorted = [...(rows ?? [])].sort((a, b) =>
    sort === "points"
      ? b.career_tournament_points - a.career_tournament_points
      : b.current_rating - a.current_rating
  );

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-neutral-900">Leaderboard</h1>
      <p className="mt-1 text-sm text-neutral-500">Every player, ranked across all tournaments.</p>

      <div className="mt-6 flex gap-1 rounded-lg border border-surface-border p-1 w-fit">
        {(
          [
            ["rating", "By rating"],
            ["points", "By career points"],
          ] as const
        ).map(([key, label]) => (
          <Link
            key={key}
            href={`/admin/leaderboard?sort=${key}`}
            className={`rounded-md px-3 py-1.5 text-sm ${
              sort === key ? "bg-brand-600 text-white" : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {error && (
        <div className="mt-6">
          <ErrorState message="We couldn't load the leaderboard right now." reassurance="Try refreshing the page." />
        </div>
      )}

      {!error && sorted.length === 0 && (
        <div className="mt-6">
          <EmptyState
            title="No players yet"
            description="The leaderboard fills in once players have rated matches behind them."
          />
        </div>
      )}

      {!error && sorted.length > 0 && (
        <Card className="mt-6" padding="none">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-neutral-50 text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Rank</th>
                  <th className="px-4 py-3 font-medium">Player</th>
                  <th className="px-4 py-3 font-medium">Rating</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Career points</th>
                  <th className="px-4 py-3 font-medium">Tournaments</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {sorted.map((p, i) => {
                  const rank = i + 1;
                  return (
                    <tr key={p.player_id} className="hover:bg-neutral-50">
                      <td className="px-4 py-3 text-neutral-500">
                        <span className="inline-flex items-center gap-1">
                          {MEDAL[rank] && <span aria-hidden>{MEDAL[rank]}</span>}
                          {rank}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/players/${p.player_id}`}
                          className="font-medium text-brand-700 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-700"
                        >
                          {p.name}
                        </Link>
                        {p.confidence && (
                          <p className="text-xs text-neutral-400">
                            {CONFIDENCE_LABEL[p.confidence] ?? p.confidence}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 font-score text-base">{p.current_rating}</td>
                      <td className="px-4 py-3">
                        {p.category ? <CategoryBadge category={p.category} /> : "—"}
                      </td>
                      <td className="px-4 py-3 font-medium text-neutral-900">
                        {p.career_tournament_points}
                      </td>
                      <td className="px-4 py-3 text-neutral-500">{p.tournaments_played}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </main>
  );
}
