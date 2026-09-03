"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addPlayerToGroup,
  computeGroupQualification,
  createGroup,
  deleteGroup,
  removePlayerFromGroup,
} from "@/app/admin/tournaments/group-actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, CategoryBadge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";

type GroupPlayer = { id: string; name: string };
type StandingRow = {
  player_id: string;
  player_name: string;
  played: number;
  won: number;
  lost: number;
  tournament_points: number;
  rank: number;
};
type Qualification = { playerId: string; rank: number };
type Group = {
  id: string;
  name: string;
  category: string | null;
  players: GroupPlayer[];
  standings: StandingRow[];
  qualifications: Qualification[];
};
type Stage = { id: string; name: string; stage_type: string; groups: Group[] };
type RosterPlayer = { id: string; name: string };

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈" };

/** §12/§26/§28/§48 — per-stage group CRUD, player assignment, standings
 * (§70 tie-break chain computed server-side), and top-2 qualification. */
export function GroupsManager({
  tournamentId,
  stages,
  roster,
}: {
  tournamentId: string;
  stages: Stage[];
  roster: RosterPlayer[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCreateGroup(stageId: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    const input = { name: formData.get("name"), category: formData.get("category") };

    startTransition(async () => {
      const res = await createGroup(stageId, tournamentId, input);
      if (res.status === "ok") {
        form.reset();
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  function handleDeleteGroup(group: Group) {
    if (!confirm(`Delete group "${group.name}"? This removes its player assignments too.`)) {
      return;
    }
    startTransition(async () => {
      const res = await deleteGroup(group.id, tournamentId);
      if (res.status === "error") setError(res.message);
      else router.refresh();
    });
  }

  function handleAddPlayer(groupId: string, playerId: string) {
    if (!playerId) return;
    startTransition(async () => {
      const res = await addPlayerToGroup(groupId, playerId, tournamentId);
      if (res.status === "error") setError(res.message);
      else router.refresh();
    });
  }

  function handleRemovePlayer(groupId: string, playerId: string) {
    startTransition(async () => {
      const res = await removePlayerFromGroup(groupId, playerId, tournamentId);
      if (res.status === "error") setError(res.message);
      else router.refresh();
    });
  }

  function handleComputeQualification(groupId: string) {
    startTransition(async () => {
      const res = await computeGroupQualification(groupId, tournamentId);
      if (res.status === "error") setError(res.message);
      else router.refresh();
    });
  }

  if (stages.length === 0) {
    return (
      <Card padding="lg">
        <h2 className="text-sm font-semibold text-neutral-900">Groups</h2>
        <p className="mt-2 text-sm text-neutral-400">
          Add a stage first (above) before creating groups within it.
        </p>
      </Card>
    );
  }

  return (
    <Card padding="lg">
      <h2 className="text-sm font-semibold text-neutral-900">Groups</h2>

      <div className="mt-4 space-y-6">
        {stages.map((stage) => {
          const availableForStage = (group: Group) => {
            const inGroup = new Set(group.players.map((p) => p.id));
            return roster.filter((p) => !inGroup.has(p.id));
          };

          return (
            <div key={stage.id} className="rounded-lg border border-surface-border p-4">
              <p className="text-sm font-medium text-neutral-900">
                {stage.name}{" "}
                <span className="font-normal text-neutral-400">({stage.stage_type})</span>
              </p>

              <div className="mt-3 space-y-4">
                {stage.groups.length === 0 && (
                  <EmptyState
                    title="No groups yet"
                    description="Add a group to start assigning players to this stage."
                  />
                )}
                {stage.groups.map((group) => {
                  // 0016 — the "Random" group under a CROSS_CATEGORY stage
                  // is auto-populated by computeGroupQualification, purely
                  // for display (who's qualified, pooled together across
                  // every original group) — it has no matches/standings of
                  // its own, so it's rendered read-only rather than as a
                  // normal editable group with its own qualify button.
                  if (stage.stage_type === "CROSS_CATEGORY" && group.name === "Random") {
                    return (
                      <div key={group.id} className="rounded-lg border border-surface-border p-3">
                        <p className="flex items-center gap-2 text-sm font-medium text-neutral-900">
                          {group.name}
                          <Badge tone="neutral">Auto-populated</Badge>
                        </p>
                        <p className="mt-1 text-xs text-neutral-400">
                          Every player who has qualified out of a group stage, pooled together —
                          this fills in automatically and isn&apos;t edited directly.
                        </p>
                        <div className="mt-3 space-y-1 border-t border-neutral-100 pt-3">
                          {group.players.length === 0 ? (
                            <p className="text-sm text-neutral-400">No one has qualified yet.</p>
                          ) : (
                            group.players.map((p) => (
                              <p key={p.id} className="text-sm text-neutral-800">
                                {p.name}
                              </p>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  }

                  const qualifiedIds = new Set(group.qualifications.map((q) => q.playerId));
                  const rankOf = new Map(group.qualifications.map((q) => [q.playerId, q.rank]));
                  const hasStandings = group.standings.length > 0;

                  return (
                    <div key={group.id} className="rounded-lg border border-surface-border p-3">
                      <div className="flex items-center justify-between">
                        <p className="flex items-center gap-2 text-sm font-medium text-neutral-900">
                          {group.name}
                          {group.category && <CategoryBadge category={group.category} />}
                        </p>
                        <button
                          onClick={() => handleDeleteGroup(group)}
                          className="text-sm text-error-500 hover:text-error-700"
                        >
                          Delete
                        </button>
                      </div>

                      {hasStandings ? (
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <thead className="text-xs text-neutral-500">
                              <tr>
                                <th className="py-1 pr-2 font-medium">Rank</th>
                                <th className="py-1 pr-2 font-medium">Player</th>
                                <th className="py-1 pr-2 font-medium">Played</th>
                                <th className="py-1 pr-2 font-medium">Won</th>
                                <th className="py-1 pr-2 font-medium">Lost</th>
                                <th className="py-1 pr-2 font-medium">Points</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                              {group.standings.map((row) => (
                                <tr key={row.player_id}>
                                  <td className="py-1.5 pr-2 text-neutral-500">{row.rank}</td>
                                  <td className="py-1.5 pr-2 font-medium text-neutral-900">
                                    <span className="inline-flex items-center gap-1.5">
                                      {MEDAL[row.rank] && <span aria-hidden>{MEDAL[row.rank]}</span>}
                                      {row.player_name}
                                      {qualifiedIds.has(row.player_id) && (
                                        <Badge tone="success">
                                          Qualified
                                          {rankOf.get(row.player_id) !== row.rank ? " (override)" : ""}
                                        </Badge>
                                      )}
                                    </span>
                                  </td>
                                  <td className="py-1.5 pr-2 text-neutral-600">{row.played}</td>
                                  <td className="py-1.5 pr-2 text-neutral-600">{row.won}</td>
                                  <td className="py-1.5 pr-2 text-neutral-600">{row.lost}</td>
                                  <td className="py-1.5 pr-2 font-medium text-neutral-900">
                                    {row.tournament_points}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={isPending}
                            onClick={() => handleComputeQualification(group.id)}
                            className="mt-2"
                          >
                            {qualifiedIds.size > 0 ? "Recompute qualification" : "Qualify top 2"}
                          </Button>
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-neutral-400">
                          Standings appear once this group has a completed match.
                        </p>
                      )}

                      <div className="mt-3 space-y-1 border-t border-neutral-100 pt-3">
                        {group.players.length === 0 && (
                          <p className="text-sm text-neutral-400">No players assigned yet.</p>
                        )}
                        {group.players.map((p) => (
                          <div key={p.id} className="flex items-center justify-between text-sm">
                            <span className="text-neutral-800">{p.name}</span>
                            <button
                              onClick={() => handleRemovePlayer(group.id, p.id)}
                              className="text-error-500 hover:text-error-700"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>

                      {availableForStage(group).length > 0 && (
                        <select
                          defaultValue=""
                          disabled={isPending}
                          onChange={(e) => {
                            handleAddPlayer(group.id, e.target.value);
                            e.target.value = "";
                          }}
                          className="mt-2 w-full rounded-lg border border-surface-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-brand-500"
                        >
                          <option value="" disabled>
                            + Assign a player…
                          </option>
                          {availableForStage(group).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>

              <form
                onSubmit={(e) => handleCreateGroup(stage.id, e)}
                className="mt-3 flex flex-wrap items-center gap-2"
              >
                <input
                  name="name"
                  required
                  placeholder="Group name (e.g. Group A)"
                  className="min-w-[140px] flex-1 rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
                />
                <input
                  name="category"
                  placeholder="Category (optional)"
                  className="min-w-[120px] rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
                />
                <Button type="submit" size="sm" disabled={isPending}>
                  + Add Group
                </Button>
              </form>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="mt-3">
          <ErrorState message="Something went wrong saving that change. Try again." />
        </div>
      )}
    </Card>
  );
}
