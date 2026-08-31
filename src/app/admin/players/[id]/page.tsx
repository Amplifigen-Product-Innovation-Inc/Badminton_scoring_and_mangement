import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { KPI } from "@/components/ui/kpi";
import { CategoryBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { RatingHistoryChart } from "@/components/admin/rating-history-chart";

const CONFIDENCE_LABEL: Record<string, string> = {
  PROVISIONAL: "Provisional",
  EMERGING: "Emerging",
  ESTABLISHED: "Established",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

/**
 * §24 — a player detail screen even though full player accounts don't
 * exist yet. This is the foundation the future player profile builds on:
 * the same rating/history/tournament data, just admin-viewed for now.
 */
export default async function PlayerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: player } = await supabase
    .from("player_directory")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!player) notFound();

  const { data: statsRows } = await supabase
    .from("tournament_player_stats")
    .select(
      "matches_played, matches_won, tournament_points, tournament_rating, tournaments(id, name, date, status)"
    )
    .eq("player_id", id);

  const recentTournaments = (statsRows ?? [])
    .filter((r) => r.tournaments)
    .map((r) => ({
      id: r.tournaments!.id,
      name: r.tournaments!.name,
      date: r.tournaments!.date,
      status: r.tournaments!.status,
      matchesPlayed: r.matches_played,
      matchesWon: r.matches_won,
      points: r.tournament_points,
      rating: r.tournament_rating,
    }))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  const { data: historyRows } = await supabase
    .from("player_rating_history")
    .select("created_at, new_rating")
    .eq("player_id", id)
    .order("created_at");

  const ratingPoints = (historyRows ?? []).map((r) => ({
    date: r.created_at,
    rating: r.new_rating,
  }));

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/admin/players" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Players
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">{player.name}</h1>
          <p className="mt-1 text-sm text-neutral-500">{player.email}</p>
        </div>
        <div className="text-right">
          <p className="font-score text-4xl text-neutral-900">{player.current_rating ?? "—"}</p>
          <div className="mt-1 flex items-center justify-end gap-2">
            {player.current_category && <CategoryBadge category={player.current_category} />}
            {player.rating_confidence && (
              <span className="text-xs text-neutral-400">
                {CONFIDENCE_LABEL[player.rating_confidence] ?? player.rating_confidence}
              </span>
            )}
          </div>
        </div>
      </div>

      {ratingPoints.length >= 2 && (
        <Card className="mt-6" padding="md">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Rating history
          </p>
          <div className="mt-2">
            <RatingHistoryChart points={ratingPoints} />
          </div>
        </Card>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KPI label="Matches" value={player.matches_played ?? 0} />
        <KPI label="Wins" value={player.matches_won ?? 0} />
        <KPI
          label="Win rate"
          value={player.win_pct != null ? `${player.win_pct}%` : "—"}
          tone="brand"
        />
        <KPI label="Tournaments" value={player.tournaments_played ?? 0} />
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">Recent tournaments</h2>
        {recentTournaments.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="No tournaments yet"
              description="This player hasn't been part of a tournament yet."
            />
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {recentTournaments.map((t) => (
              <Link key={t.id} href={`/admin/tournaments/${t.id}`}>
                <Card padding="md" className="hover:border-brand-200">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-neutral-900">{t.name}</p>
                      <p className="text-xs text-neutral-500">{formatDate(t.date)}</p>
                    </div>
                    <div className="text-right text-sm text-neutral-600">
                      <p>
                        {t.matchesWon}/{t.matchesPlayed} wins · {t.points} pts
                      </p>
                      {t.rating != null && (
                        <p className="text-xs text-neutral-400">Tournament rating {t.rating}</p>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
