"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelMatch,
  createMatch,
  deleteMatch,
  reopenMatch,
} from "@/app/admin/tournaments/match-actions";
import { bestOfValues, matchTypeValues } from "@/lib/validation/match";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, CategoryBadge, LiveBadge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";

type RosterPlayer = { id: string; name: string };
type Group = { id: string; name: string; category?: string | null; players: RosterPlayer[] };
type Stage = { id: string; name: string; stage_type: string; groups: Group[] };
type Court = { id: string; name: string };
type Scorer = { id: string; label: string };
type MatchTeam = { teamNumber: number; players: RosterPlayer[] };
type Match = {
  id: string;
  matchNumber: number;
  matchType: string;
  bestOf: number;
  status: string;
  courtName: string | null;
  scorerLabel: string | null;
  teams: MatchTeam[];
};

/** §19/§20 match creation: pick a stage (+ optional group), format, court,
 * scorer, and both teams' players. */
export function MatchesManager({
  tournamentId,
  stages,
  roster,
  courts,
  scorers,
  matches,
}: {
  tournamentId: string;
  stages: Stage[];
  roster: RosterPlayer[];
  courts: Court[];
  scorers: Scorer[];
  matches: Match[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Raw user selection, not the value the form actually uses — see stageId
  // below. Storing the "effective" id directly as state would go stale the
  // moment `stages` changes (e.g. the first stage gets added after this
  // component has already mounted showing the "add a stage first"
  // placeholder), since a useState initializer only runs once.
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState("");
  const [matchType, setMatchType] = useState<(typeof matchTypeValues)[number]>("SINGLES");
  const [bestOf, setBestOf] = useState<(typeof bestOfValues)[number]>(3);
  const [courtId, setCourtId] = useState("");
  const [scorerId, setScorerId] = useState("");
  const [team1, setTeam1] = useState<Set<string>>(new Set());
  const [team2, setTeam2] = useState<Set<string>>(new Set());

  const stageId =
    selectedStageId && stages.some((s) => s.id === selectedStageId)
      ? selectedStageId
      : (stages[0]?.id ?? "");

  const selectedStage = stages.find((s) => s.id === stageId);
  const candidatePlayers = useMemo(() => {
    if (groupId) {
      const group = selectedStage?.groups.find((g) => g.id === groupId);
      return group?.players ?? [];
    }
    return roster;
  }, [groupId, selectedStage, roster]);

  const requiredPerTeam = matchType === "SINGLES" ? 1 : 2;

  // §30 — cosmetic only: a match is shown as "cross-category" when its two
  // teams draw from groups with different categories. Derived client-side
  // from the stage/group data already loaded here; nothing is persisted.
  const playerCategory = useMemo(() => {
    const map = new Map<string, string>();
    for (const stage of stages) {
      for (const group of stage.groups) {
        if (!group.category) continue;
        for (const p of group.players) map.set(p.id, group.category);
      }
    }
    return map;
  }, [stages]);

  function teamCategory(team: MatchTeam) {
    for (const p of team.players) {
      const cat = playerCategory.get(p.id);
      if (cat) return cat;
    }
    return null;
  }

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  function resetTeams() {
    setTeam1(new Set());
    setTeam2(new Set());
  }

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const input = {
      stageId,
      groupId: groupId || null,
      matchType,
      bestOf,
      courtId: courtId || null,
      scorerId: scorerId || null,
      team1PlayerIds: Array.from(team1),
      team2PlayerIds: Array.from(team2),
    };

    startTransition(async () => {
      const res = await createMatch(tournamentId, input);
      if (res.status === "ok") {
        resetTeams();
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  function handleDelete(match: Match) {
    if (!confirm(`Delete match #${match.matchNumber}? This can't be undone.`)) return;
    startTransition(async () => {
      const res = await deleteMatch(match.id, tournamentId);
      if (res.status === "error") setError(res.message);
      else router.refresh();
    });
  }

  function handleCancel(match: Match) {
    if (!confirm(`Cancel match #${match.matchNumber}?`)) return;
    startTransition(async () => {
      const res = await cancelMatch(match.id, tournamentId);
      if (res.status === "error") setError(res.message);
      else router.refresh();
    });
  }

  function handleReopen(match: Match) {
    if (
      !confirm(
        `Reopen match #${match.matchNumber}? This reverses its rating and stats effects and sets it back to LIVE for correction.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await reopenMatch(match.id, tournamentId);
      if (res.status === "error") setError(res.message);
      else router.refresh();
    });
  }

  if (stages.length === 0) {
    return (
      <Card padding="lg">
        <h2 className="text-sm font-semibold text-neutral-900">Matches</h2>
        <p className="mt-2 text-sm text-neutral-400">Add a stage first before creating matches.</p>
      </Card>
    );
  }

  return (
    <Card padding="lg">
      <h2 className="text-sm font-semibold text-neutral-900">
        Matches <span className="font-normal text-neutral-400">({matches.length})</span>
      </h2>

      <div className="mt-4 space-y-2">
        {matches.length === 0 && (
          <EmptyState
            title="No matches yet"
            description="Create the first match below — pick a stage, the teams, and (optionally) a court and scorer."
          />
        )}
        {matches.map((m) => {
          const sortedTeams = [...m.teams].sort((a, b) => a.teamNumber - b.teamNumber);
          const categories = sortedTeams.map(teamCategory);
          const isCrossCategory =
            categories[0] && categories[1] && categories[0] !== categories[1];

          return (
          <div
            key={m.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-surface-border p-3"
          >
            <div>
              <p className="text-sm font-medium text-neutral-900">
                #{m.matchNumber} · {m.matchType} · Best of {m.bestOf}
                {isCrossCategory && (
                  <span className="ml-2">
                    <Badge tone="brand">Cross-category</Badge>
                  </span>
                )}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-neutral-500">
                {sortedTeams.map((t, i) => (
                  <span key={t.teamNumber} className="inline-flex items-center gap-1.5">
                    {i > 0 && <span className="text-neutral-300">vs</span>}
                    {t.players.map((p) => p.name).join(" / ")}
                    {categories[i] && <CategoryBadge category={categories[i]!} />}
                  </span>
                ))}
              </p>
              <p className="text-xs text-neutral-400">
                {m.courtName ?? "No court"} · {m.scorerLabel ?? "No scorer assigned"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {m.status === "LIVE" ? (
                <LiveBadge />
              ) : (
                <Badge
                  tone={
                    m.status === "COMPLETED" ? "success" : m.status === "CANCELLED" ? "error" : "neutral"
                  }
                >
                  {m.status.charAt(0) + m.status.slice(1).toLowerCase()}
                </Badge>
              )}
              {m.status === "SCHEDULED" && (
                <>
                  <button
                    onClick={() => handleCancel(m)}
                    className="text-sm text-neutral-500 hover:text-neutral-900"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDelete(m)}
                    className="text-sm text-error-500 hover:text-error-700"
                  >
                    Delete
                  </button>
                </>
              )}
              {m.status === "COMPLETED" && (
                <button
                  onClick={() => handleReopen(m)}
                  disabled={isPending}
                  className="text-sm text-neutral-500 hover:text-neutral-900 disabled:opacity-50"
                >
                  Reopen
                </button>
              )}
            </div>
          </div>
          );
        })}
      </div>

      <form onSubmit={handleCreate} className="mt-5 space-y-4 border-t border-neutral-100 pt-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Stage</label>
            <select
              value={stageId}
              onChange={(e) => {
                setSelectedStageId(e.target.value);
                setGroupId("");
                resetTeams();
              }}
              className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
            >
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {selectedStage && selectedStage.groups.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">
                Group (optional)
              </label>
              <select
                value={groupId}
                onChange={(e) => {
                  setGroupId(e.target.value);
                  resetTeams();
                }}
                className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
              >
                <option value="">No group</option>
                {selectedStage.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Format</label>
            <select
              value={matchType}
              onChange={(e) => {
                setMatchType(e.target.value as (typeof matchTypeValues)[number]);
                resetTeams();
              }}
              className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
            >
              {matchTypeValues.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Best of</label>
            <select
              value={bestOf}
              onChange={(e) => setBestOf(Number(e.target.value) as (typeof bestOfValues)[number])}
              className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
            >
              {bestOfValues.map((b) => (
                <option key={b} value={b}>
                  Best of {b}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">
              Court (optional)
            </label>
            <select
              value={courtId}
              onChange={(e) => setCourtId(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
            >
              <option value="">Unassigned</option>
              {courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">
              Scorer (optional)
            </label>
            <select
              value={scorerId}
              onChange={(e) => setScorerId(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
            >
              <option value="">Unassigned</option>
              {scorers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">
              Team 1 ({requiredPerTeam} player{requiredPerTeam > 1 ? "s" : ""})
            </label>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-surface-border">
              {candidatePlayers.length === 0 && (
                <p className="px-3 py-2 text-sm text-neutral-400">No players available.</p>
              )}
              {candidatePlayers.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-2 border-b border-neutral-50 px-3 py-2 text-sm last:border-0 hover:bg-neutral-50"
                >
                  <input
                    type="checkbox"
                    checked={team1.has(p.id)}
                    disabled={team2.has(p.id)}
                    onChange={() => toggle(team1, setTeam1, p.id)}
                    className="h-4 w-4"
                  />
                  {p.name}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">
              Team 2 ({requiredPerTeam} player{requiredPerTeam > 1 ? "s" : ""})
            </label>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-surface-border">
              {candidatePlayers.length === 0 && (
                <p className="px-3 py-2 text-sm text-neutral-400">No players available.</p>
              )}
              {candidatePlayers.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-2 border-b border-neutral-50 px-3 py-2 text-sm last:border-0 hover:bg-neutral-50"
                >
                  <input
                    type="checkbox"
                    checked={team2.has(p.id)}
                    disabled={team1.has(p.id)}
                    onChange={() => toggle(team2, setTeam2, p.id)}
                    className="h-4 w-4"
                  />
                  {p.name}
                </label>
              ))}
            </div>
          </div>
        </div>

        <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
          {isPending ? "Creating…" : "+ Create Match"}
        </Button>
      </form>

      {error && (
        <div className="mt-3">
          <ErrorState message="We couldn't create that match. Try again." />
        </div>
      )}
    </Card>
  );
}
