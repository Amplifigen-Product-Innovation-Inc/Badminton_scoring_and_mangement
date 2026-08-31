import { Card } from "@/components/ui/card";

type Row = {
  source_group_id: string;
  team_label: string;
  player_names: string;
  played: number;
  won: number;
  lost: number;
  points: number;
  total_score: number;
  rank: number;
};

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

/**
 * §30/§31 — the cross-category stage's own leaderboard: qualified teams
 * from different group categories, ranked by tournament points (2/win)
 * then total badminton points scored as the tie-break. Read-only — this
 * is display, computed fresh server-side by cross_category_standings.
 */
export function CrossCategoryStandings({ stageName, rows }: { stageName: string; rows: Row[] }) {
  if (rows.length === 0) return null;

  return (
    <Card padding="lg">
      <h2 className="text-sm font-semibold text-neutral-900">{stageName} standings</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-neutral-500">
            <tr>
              <th className="py-1 pr-2 font-medium">Rank</th>
              <th className="py-1 pr-2 font-medium">Team</th>
              <th className="py-1 pr-2 font-medium">Played</th>
              <th className="py-1 pr-2 font-medium">Won</th>
              <th className="py-1 pr-2 font-medium">Lost</th>
              <th className="py-1 pr-2 font-medium">Points</th>
              <th className="py-1 pr-2 font-medium">Points scored</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((row) => (
              <tr key={row.source_group_id}>
                <td className="py-1.5 pr-2 text-neutral-500">{row.rank}</td>
                <td className="py-1.5 pr-2 font-medium text-neutral-900">
                  <span className="inline-flex items-center gap-1.5">
                    {MEDAL[row.rank] && <span aria-hidden>{MEDAL[row.rank]}</span>}
                    {row.team_label}
                  </span>
                  <p className="text-xs font-normal text-neutral-500">{row.player_names}</p>
                </td>
                <td className="py-1.5 pr-2 text-neutral-600">{row.played}</td>
                <td className="py-1.5 pr-2 text-neutral-600">{row.won}</td>
                <td className="py-1.5 pr-2 text-neutral-600">{row.lost}</td>
                <td className="py-1.5 pr-2 font-medium text-neutral-900">{row.points}</td>
                <td className="py-1.5 pr-2 text-neutral-600">{row.total_score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
