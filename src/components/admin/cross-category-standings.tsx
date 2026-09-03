"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { computeCrossCategoryQualification } from "@/app/admin/tournaments/group-actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";

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
 * then total badminton points scored as the tie-break. Standings
 * themselves are read-only (computed fresh server-side by
 * cross_category_standings) — "Qualify top 2" is the one write action
 * here, mirroring GroupsManager's own qualify button
 * (0011_cross_category_qualification.sql), and best-effort auto-creates
 * the next (FINAL-stage) match between the top 2 — see the doc comment on
 * computeCrossCategoryQualification for exactly when that does or doesn't
 * happen.
 */
export function CrossCategoryStandings({
  stageId,
  stageName,
  tournamentId,
  rows,
  qualifiedGroupIds,
}: {
  stageId: string;
  stageName: string;
  tournamentId: string;
  rows: Row[];
  qualifiedGroupIds: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  if (rows.length === 0) return null;

  const qualified = new Set(qualifiedGroupIds);

  function handleQualify() {
    setError(false);
    startTransition(async () => {
      const res = await computeCrossCategoryQualification(stageId, tournamentId);
      if (res.status === "error") setError(true);
      else router.refresh();
    });
  }

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
                    {qualified.has(row.source_group_id) && <Badge tone="success">Qualified</Badge>}
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
        <Button
          size="sm"
          variant="secondary"
          disabled={isPending}
          onClick={handleQualify}
          className="mt-2"
        >
          {qualified.size > 0 ? "Recompute qualification" : "Qualify top 2"}
        </Button>
        {error && (
          <div className="mt-2">
            <ErrorState message="Something went wrong computing qualification. Try again." />
          </div>
        )}
      </div>
    </Card>
  );
}
