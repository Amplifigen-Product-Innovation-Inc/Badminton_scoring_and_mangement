"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  completeMatch,
  recordRally,
  startNextGame,
  undoLastRally,
} from "@/app/scorer/actions";
import { StartMatchButton } from "@/components/scorer/start-match-button";

type Player = { id: string; name: string };
type Team = { id: string; players: Player[] };
type Game = {
  id: string;
  game_number: number;
  status: string;
  team_1_score: number;
  team_2_score: number;
  winner_team_id: string | null;
};

type Selection = { kind: "player"; player: Player; team: Team } | { kind: "split" } | null;

/**
 * §23/§55 — the highest-priority screen in the app. Flow: tap a player (or
 * SPLIT directly) -> tap the outcome -> next rally, no navigation away.
 * Score always visible, UNDO always visible.
 *
 * §52 double-tap protection: every action button disables while a request
 * is in flight. §51 idempotent rally IDs: each rally gets a client-
 * generated id up front; a retry of a failed submission reuses that same
 * id/payload rather than minting a new one, so the DB's own primary-key
 * uniqueness is what prevents a duplicate rally on retry.
 */
export function LiveScoringScreen({
  matchId,
  matchNumber,
  matchType,
  bestOf,
  status,
  courtName,
  tournamentName,
  team1,
  team2,
  games,
}: {
  matchId: string;
  matchNumber: number;
  matchType: string;
  bestOf: number;
  status: string;
  courtName: string | null;
  tournamentName: string;
  team1: Team;
  team2: Team;
  games: Game[];
}) {
  const router = useRouter();
  const [selection, setSelection] = useState<Selection>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Records the score this optimistic bump was computed FROM, alongside
  // the bumped values — so it's naturally superseded (no effect/sync
  // needed) the moment router.refresh() delivers a currentGame whose real
  // score no longer matches that baseline, whether because the request we
  // were anticipating landed or because something else changed the score
  // in the meantime (e.g. an admin correction).
  const [optimistic, setOptimistic] = useState<{
    baseScore1: number;
    baseScore2: number;
    team1: number;
    team2: number;
  } | null>(null);
  const pendingSubmission = useRef<{ id: string; args: Parameters<typeof recordRally>[0] } | null>(
    null
  );

  const currentGame = games[games.length - 1];

  if (status === "SCHEDULED") {
    return (
      <main className="mx-auto max-w-md px-4 py-8">
        <h1 className="text-lg font-semibold text-neutral-900">
          Match #{matchNumber} · {matchType} · Bo{bestOf}
        </h1>
        <p className="mt-2 text-neutral-500">Not started yet.</p>
        <StartMatchButton matchId={matchId} />
      </main>
    );
  }

  if (status === "COMPLETED" || status === "CANCELLED") {
    return (
      <main className="mx-auto max-w-md px-4 py-8">
        <div className="rounded-xl bg-neutral-900 px-4 py-3 text-center text-white">
          <p className="text-sm font-medium">
            {status === "COMPLETED" ? "Match complete" : "Match cancelled"}
          </p>
        </div>
        <h1 className="mt-4 text-lg font-semibold text-neutral-900">
          {teamLabel(team1)} <span className="text-neutral-400">vs</span> {teamLabel(team2)}
        </h1>
        <div className="mt-4 space-y-2">
          {games.map((g) => (
            <div
              key={g.id}
              className="flex items-center justify-between rounded-lg border border-neutral-200 px-4 py-3"
            >
              <span className="text-sm text-neutral-500">Game {g.game_number}</span>
              <span className="text-base font-semibold text-neutral-900">
                {g.team_1_score} – {g.team_2_score}
              </span>
            </div>
          ))}
        </div>
      </main>
    );
  }

  if (!currentGame) {
    return (
      <main className="mx-auto max-w-md px-4 py-8">
        <p className="text-neutral-500">This match has no games yet.</p>
      </main>
    );
  }

  const team1Wins = games.filter((g) => g.status === "COMPLETED" && g.winner_team_id === team1.id)
    .length;
  const team2Wins = games.filter((g) => g.status === "COMPLETED" && g.winner_team_id === team2.id)
    .length;
  const gamesNeeded = Math.ceil(bestOf / 2);
  const matchDecided = team1Wins >= gamesNeeded || team2Wins >= gamesNeeded;
  const gameInProgress = currentGame.status === "IN_PROGRESS";

  const optimisticIsCurrent =
    optimistic != null &&
    optimistic.baseScore1 === currentGame.team_1_score &&
    optimistic.baseScore2 === currentGame.team_2_score;
  const score1 = optimisticIsCurrent ? optimistic.team1 : currentGame.team_1_score;
  const score2 = optimisticIsCurrent ? optimistic.team2 : currentGame.team_2_score;

  function submitRally(playerId: string | null, eventType: "WINNER" | "DROP" | "SPLIT", winningTeamId: string) {
    setError(null);
    setSelection(null);

    const id = crypto.randomUUID();
    const args: Parameters<typeof recordRally>[0] = {
      id,
      matchId,
      gameId: currentGame.id,
      playerId,
      eventType,
      winningTeamId,
    };
    pendingSubmission.current = { id, args };

    setOptimistic({
      baseScore1: currentGame.team_1_score,
      baseScore2: currentGame.team_2_score,
      team1: currentGame.team_1_score + (winningTeamId === team1.id ? 1 : 0),
      team2: currentGame.team_2_score + (winningTeamId === team2.id ? 1 : 0),
    });

    doSubmit(args);
  }

  function doSubmit(args: Parameters<typeof recordRally>[0]) {
    setIsSubmitting(true);
    recordRally(args).then((res) => {
      setIsSubmitting(false);
      if (res.status === "ok") {
        router.refresh();
      } else {
        setError(res.message);
        setOptimistic(null);
      }
    });
  }

  function retrySubmission() {
    if (!pendingSubmission.current) return;
    setError(null);
    doSubmit(pendingSubmission.current.args);
  }

  function handleUndo() {
    setError(null);
    setIsSubmitting(true);
    undoLastRally(matchId, currentGame.id).then((res) => {
      setIsSubmitting(false);
      if (res.status === "ok") router.refresh();
      else setError(res.message);
    });
  }

  function handleStartNextGame() {
    setError(null);
    setIsSubmitting(true);
    startNextGame(matchId).then((res) => {
      setIsSubmitting(false);
      if (res.status === "ok") router.refresh();
      else setError(res.message);
    });
  }

  function handleCompleteMatch() {
    setError(null);
    setIsSubmitting(true);
    completeMatch(matchId).then((res) => {
      setIsSubmitting(false);
      if (res.status === "ok") router.push("/scorer");
      else setError(res.message);
    });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-6">
      <header className="text-center">
        <p className="text-xs text-neutral-400">
          {tournamentName} · {courtName ?? "No court"}
        </p>
        <p className="mt-0.5 text-xs text-neutral-400">
          Game {currentGame.game_number} of {bestOf} · {matchType}
        </p>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-4 text-center">
          <p className="truncate text-sm font-medium text-neutral-600">{teamLabel(team1)}</p>
          <p className="mt-1 text-4xl font-bold text-neutral-900">{score1}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 text-center">
          <p className="truncate text-sm font-medium text-neutral-600">{teamLabel(team2)}</p>
          <p className="mt-1 text-4xl font-bold text-neutral-900">{score2}</p>
        </div>
      </div>

      {!gameInProgress && !matchDecided && (
        <div className="mt-6 rounded-xl bg-emerald-50 p-4 text-center">
          <p className="text-sm font-medium text-emerald-800">
            Game {currentGame.game_number} complete.
          </p>
          <button
            onClick={handleStartNextGame}
            disabled={isSubmitting}
            className="mt-3 w-full rounded-lg bg-neutral-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
          >
            Start Game {currentGame.game_number + 1}
          </button>
        </div>
      )}

      {!gameInProgress && matchDecided && (
        <div className="mt-6 rounded-xl bg-emerald-50 p-4 text-center">
          <p className="text-sm font-medium text-emerald-800">Match decided!</p>
          <button
            onClick={handleCompleteMatch}
            disabled={isSubmitting}
            className="mt-3 w-full rounded-lg bg-neutral-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
          >
            Complete Match
          </button>
        </div>
      )}

      {gameInProgress && (
        <div className="mt-6 flex-1">
          {selection === null && (
            <>
              <p className="text-center text-sm font-medium text-neutral-500">
                Who caused the rally?
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {[...team1.players.map((p) => ({ p, team: team1 })), ...team2.players.map((p) => ({ p, team: team2 }))].map(
                  ({ p, team }) => (
                    <button
                      key={p.id}
                      disabled={isSubmitting}
                      onClick={() => setSelection({ kind: "player", player: p, team })}
                      className="rounded-xl border border-neutral-200 bg-white py-6 text-lg font-medium text-neutral-900 active:bg-neutral-50 disabled:opacity-50"
                    >
                      {p.name}
                    </button>
                  )
                )}
              </div>
              <button
                disabled={isSubmitting}
                onClick={() => setSelection({ kind: "split" })}
                className="mt-3 w-full rounded-xl border border-neutral-200 bg-white py-4 text-base font-medium text-neutral-600 active:bg-neutral-50 disabled:opacity-50"
              >
                SPLIT (can&apos;t attribute)
              </button>
            </>
          )}

          {selection?.kind === "player" && (
            <>
              <p className="text-center text-sm font-medium text-neutral-500">
                {selection.player.name} —
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  disabled={isSubmitting}
                  onClick={() => submitRally(selection.player.id, "WINNER", selection.team.id)}
                  className="rounded-xl bg-emerald-600 py-8 text-xl font-semibold text-white active:bg-emerald-700 disabled:opacity-50"
                >
                  WINNING SHOT
                </button>
                <button
                  disabled={isSubmitting}
                  onClick={() =>
                    submitRally(
                      selection.player.id,
                      "DROP",
                      selection.team.id === team1.id ? team2.id : team1.id
                    )
                  }
                  className="rounded-xl bg-red-600 py-8 text-xl font-semibold text-white active:bg-red-700 disabled:opacity-50"
                >
                  DROP
                </button>
              </div>
              <button
                disabled={isSubmitting}
                onClick={() => setSelection(null)}
                className="mt-3 w-full py-3 text-sm text-neutral-500 disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          )}

          {selection?.kind === "split" && (
            <>
              <p className="text-center text-sm font-medium text-neutral-500">
                Which side won the rally?
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  disabled={isSubmitting}
                  onClick={() => submitRally(null, "SPLIT", team1.id)}
                  className="rounded-xl border border-neutral-200 bg-white py-8 text-lg font-medium text-neutral-900 active:bg-neutral-50 disabled:opacity-50"
                >
                  {teamLabel(team1)}
                </button>
                <button
                  disabled={isSubmitting}
                  onClick={() => submitRally(null, "SPLIT", team2.id)}
                  className="rounded-xl border border-neutral-200 bg-white py-8 text-lg font-medium text-neutral-900 active:bg-neutral-50 disabled:opacity-50"
                >
                  {teamLabel(team2)}
                </button>
              </div>
              <button
                disabled={isSubmitting}
                onClick={() => setSelection(null)}
                className="mt-3 w-full py-3 text-sm text-neutral-500 disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 p-3 text-center">
          <p className="text-sm text-red-700">{error}</p>
          {pendingSubmission.current && (
            <button onClick={retrySubmission} className="mt-2 text-sm font-medium text-red-800 underline">
              Retry
            </button>
          )}
        </div>
      )}

      {gameInProgress && (
        <button
          onClick={handleUndo}
          disabled={isSubmitting}
          className="mt-6 w-full rounded-lg border border-neutral-300 bg-white py-3 text-base font-medium text-neutral-700 disabled:opacity-50"
        >
          Undo Last
        </button>
      )}
    </main>
  );
}

function teamLabel(team: Team) {
  return team.players.map((p) => p.name).join(" / ");
}
