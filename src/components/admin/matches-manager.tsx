"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelMatch, createMatch, deleteMatch } from "@/app/admin/tournaments/match-actions";
import { bestOfValues, matchTypeValues } from "@/lib/validation/match";

type RosterPlayer = { id: string; name: string };
type Group = { id: string; name: string; players: RosterPlayer[] };
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

const STATUS_STYLES: Record<string, string> = {
  SCHEDULED: "bg-neutral-100 text-neutral-600",
  LIVE: "bg-emerald-50 text-emerald-700",
  COMPLETED: "bg-neutral-100 text-neutral-500",
  CANCELLED: "bg-red-50 text-red-700",
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

  if (stages.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-neutral-900">Matches</h2>
        <p className="mt-2 text-sm text-neutral-400">Add a stage first before creating matches.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6">
      <h2 className="text-sm font-semibold text-neutral-900">
        Matches <span className="font-normal text-neutral-400">({matches.length})</span>
      </h2>

      <div className="mt-4 space-y-2">
        {matches.length === 0 && (
          <p className="text-sm text-neutral-400">No matches yet — create the first one below.</p>
        )}
        {matches.map((m) => (
          <div
            key={m.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-100 p-3"
          >
            <div>
              <p className="text-sm font-medium text-neutral-900">
                #{m.matchNumber} · {m.matchType} · Bo{m.bestOf}
              </p>
              <p className="text-xs text-neutral-500">
                {m.teams
                  .sort((a, b) => a.teamNumber - b.teamNumber)
                  .map((t) => t.players.map((p) => p.name).join(" / "))
                  .join(" vs ")}
              </p>
              <p className="text-xs text-neutral-400">
                {m.courtName ?? "No court"} · {m.scorerLabel ?? "No scorer assigned"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[m.status] ?? "bg-neutral-100 text-neutral-600"}`}
              >
                {m.status}
              </span>
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
                    className="text-sm text-red-500 hover:text-red-700"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
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
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
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
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
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
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
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
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
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
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
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
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
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
            <div className="max-h-40 overflow-y-auto rounded-lg border border-neutral-200">
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
            <div className="max-h-40 overflow-y-auto rounded-lg border border-neutral-200">
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

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 sm:w-auto"
        >
          {isPending ? "Creating…" : "+ Create Match"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
