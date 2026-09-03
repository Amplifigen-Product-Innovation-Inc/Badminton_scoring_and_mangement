import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

type Row = {
  player_id: string;
  name: string;
  current_rating: number;
  matches_played: number;
  matches_won: number;
  matches_lost: number;
  winning_shots: number;
  drops: number;
  splits: number;
  tournament_points: number;
};

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

/**
 * The tournament-specific leaderboard — every player who has played at
 * least one match IN THIS tournament, ranked by tournament points (2/win,
 * same tournament_player_stats.tournament_points complete_match already
 * maintains — 0005_match_completion.sql). Distinct from the global
 * /admin/leaderboard (career-wide, across every tournament).
 *
 * Winning Shots / Dropped Shots / Split come straight from
 * tournament_player_stats.winning_shots/drops/splits, which complete_match
 * already accumulates per player per rally attribution — this is the first
 * UI surfacing them (previously only visible per-player on their own
 * profile page's tournament history, never side-by-side for a whole
 * tournament).
 *
 * Rating is the player's existing GLOBAL rating (player_ratings.rating),
 * shown here for context — not a separate per-tournament rating scale (the
 * app deliberately has only one rating system; see 0005_match_completion.sql's
 * documented assumption #3).
 *
 * The wrapping `id="leaderboard"` is a quick-access anchor: the tournaments
 * list (src/app/admin/tournaments/page.tsx) links straight to
 * `/admin/tournaments/[id]#leaderboard`.
 */
export function TournamentLeaderboard({
  targetScore,
  rows,
}: {
  targetScore: number;
  rows: Row[];
}) {
  const sorted = [...rows].sort((a, b) => {
    if (b.tournament_points !== a.tournament_points) return b.tournament_points - a.tournament_points;
    // Tie-break: net shot quality, same numerator complete_match uses for
    // individual performance (winners minus drops) — not itself a
    // tournament rule, just a sensible ordering for players tied on points.
    return b.winning_shots - b.drops - (a.winning_shots - a.drops);
  });

  return (
    <div id="leaderboard">
      <Card padding="lg">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-900">Tournament leaderboard</h2>
          <span className="text-xs text-neutral-400">Game points: {targetScore}</span>
        </div>

        {sorted.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No results yet"
              description="This fills in once a match in this tournament is completed."
            />
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-neutral-500">
                <tr>
                  <th className="py-1 pr-2 font-medium">Rank</th>
                  <th className="py-1 pr-2 font-medium">Player</th>
                  <th className="py-1 pr-2 font-medium">Rating</th>
                  <th className="py-1 pr-2 font-medium">Played</th>
                  <th className="py-1 pr-2 font-medium">Won</th>
                  <th className="py-1 pr-2 font-medium">Lost</th>
                  <th className="py-1 pr-2 font-medium">Winning shots</th>
                  <th className="py-1 pr-2 font-medium">Dropped shots</th>
                  <th className="py-1 pr-2 font-medium">Split</th>
                  <th className="py-1 pr-2 font-medium">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {sorted.map((row, i) => {
                  const rank = i + 1;
                  return (
                    <tr key={row.player_id}>
                      <td className="py-1.5 pr-2 text-neutral-500">
                        <span className="inline-flex items-center gap-1">
                          {MEDAL[rank] && <span aria-hidden>{MEDAL[rank]}</span>}
                          {rank}
                        </span>
                      </td>
                      <td className="py-1.5 pr-2 font-medium text-neutral-900">{row.name}</td>
                      <td className="py-1.5 pr-2 font-score text-neutral-600">{row.current_rating}</td>
                      <td className="py-1.5 pr-2 text-neutral-600">{row.matches_played}</td>
                      <td className="py-1.5 pr-2 text-neutral-600">{row.matches_won}</td>
                      <td className="py-1.5 pr-2 text-neutral-600">{row.matches_lost}</td>
                      <td className="py-1.5 pr-2 text-success-700">{row.winning_shots}</td>
                      <td className="py-1.5 pr-2 text-error-500">{row.drops}</td>
                      <td className="py-1.5 pr-2 text-neutral-500">{row.splits}</td>
                      <td className="py-1.5 pr-2 font-semibold text-neutral-900">
                        {row.tournament_points}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
