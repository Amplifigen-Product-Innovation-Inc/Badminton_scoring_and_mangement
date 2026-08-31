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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LiveBadge, Badge } from "@/components/ui/badge";
import { ScoreDisplay } from "@/components/ui/score-display";
import { ErrorState } from "@/components/ui/error-state";

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
 *
 * Visual redesign per the market-ready design plan (§8-17): score is the
 * dominant element, primary controls sit in the lower/thumb-reach half of
 * the screen (§11), deuce/final-point are called out so the scorer never
 * has to remember the rules (§17), and errors/undo route through the
 * shared design-system components.
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
  // §33 — track only which action failed, never the raw Supabase/Postgres
  // message; the copy shown per action is a fixed, human string below.
  const [errorAction, setErrorAction] = useState<"rally" | "undo" | "nextGame" | "complete" | null>(
    null
  );
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
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-8">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          {tournamentName}
        </p>
        <h1 className="mt-1 text-xl font-semibold text-neutral-900">
          Match #{matchNumber} · {matchType} · Best of {bestOf}
        </h1>
        <p className="mt-2 text-neutral-500">Not started yet.</p>
        <div className="mt-6">
          <StartMatchButton matchId={matchId} />
        </div>
      </main>
    );
  }

  if (status === "COMPLETED" || status === "CANCELLED") {
    const team1Wins = games.filter(
      (g) => g.status === "COMPLETED" && g.winner_team_id === team1.id
    ).length;
    const team2Wins = games.filter(
      (g) => g.status === "COMPLETED" && g.winner_team_id === team2.id
    ).length;
    const winner = status === "COMPLETED" ? (team1Wins > team2Wins ? team1 : team2) : null;

    return (
      <main className="mx-auto max-w-md px-4 py-8">
        {status === "COMPLETED" ? (
          <Card className="border-brand-200 bg-brand-50 text-center" padding="lg">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
              Match complete
            </p>
            <p className="mt-3 text-2xl font-bold text-neutral-900">{teamLabel(team1)}</p>
            <p className="font-score my-1 text-4xl text-neutral-900">
              {team1Wins} – {team2Wins}
            </p>
            <p className="text-2xl font-bold text-neutral-900">{teamLabel(team2)}</p>
            {winner && (
              <p className="mt-4 text-sm font-semibold text-brand-700">
                Winner: {teamLabel(winner)}
              </p>
            )}
          </Card>
        ) : (
          <Card className="bg-neutral-100 text-center" padding="lg">
            <p className="text-sm font-medium text-neutral-600">Match cancelled</p>
          </Card>
        )}
        <div className="mt-4 space-y-2">
          {games.map((g) => (
            <div
              key={g.id}
              className="flex items-center justify-between rounded-lg border border-surface-border px-4 py-3"
            >
              <span className="text-sm text-neutral-500">Game {g.game_number}</span>
              <span className="font-score text-base text-neutral-900">
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

  // §17 — the scorer never has to remember the rules. Standard badminton:
  // deuce (win-by-2) once both sides reach 20, decided outright at 30 —
  // the last point before that cap is the "final point" call-out.
  const rallyPoint = Math.max(score1, score2) + 1;
  const isDeuce = score1 >= 20 && score2 >= 20 && Math.abs(score1 - score2) < 2 && rallyPoint < 30;
  const isFinalPoint = score1 === 29 && score2 === 29;

  function submitRally(playerId: string | null, eventType: "WINNER" | "DROP" | "SPLIT", winningTeamId: string) {
    setErrorAction(null);
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
        setErrorAction("rally");
        setOptimistic(null);
      }
    });
  }

  function retrySubmission() {
    if (!pendingSubmission.current) return;
    setErrorAction(null);
    doSubmit(pendingSubmission.current.args);
  }

  function handleUndo() {
    setErrorAction(null);
    setIsSubmitting(true);
    undoLastRally(matchId, currentGame.id).then((res) => {
      setIsSubmitting(false);
      if (res.status === "ok") router.refresh();
      else setErrorAction("undo");
    });
  }

  function handleStartNextGame() {
    setErrorAction(null);
    setIsSubmitting(true);
    startNextGame(matchId).then((res) => {
      setIsSubmitting(false);
      if (res.status === "ok") router.refresh();
      else setErrorAction("nextGame");
    });
  }

  function handleCompleteMatch() {
    setErrorAction(null);
    setIsSubmitting(true);
    completeMatch(matchId).then((res) => {
      setIsSubmitting(false);
      if (res.status === "ok") router.push("/scorer");
      else setErrorAction("complete");
    });
  }

  const ERROR_COPY: Record<
    NonNullable<typeof errorAction>,
    { message: string; reassurance?: string }
  > = {
    rally: {
      message: "We couldn't save that rally.",
      reassurance: "Your current score is still safe — nothing was lost.",
    },
    undo: { message: "We couldn't undo that rally. Try again." },
    nextGame: { message: "We couldn't start the next game. Try again." },
    complete: {
      message: "We couldn't complete the match.",
      reassurance: "The final score is saved — try again to finish up.",
    },
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-5">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            {courtName ?? "No court"} · {tournamentName}
          </p>
          <p className="mt-0.5 text-xs text-neutral-400">
            Game {currentGame.game_number} of {bestOf} · {matchType}
          </p>
        </div>
        {gameInProgress && <LiveBadge />}
      </header>

      {/* Score — the dominant element on screen (§9/§39) */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Card className="text-center" padding="lg">
          <p className="truncate text-sm font-semibold text-neutral-600">{teamLabel(team1)}</p>
          <ScoreDisplay value={score1} size="xl" className="mt-1 block text-neutral-900" />
        </Card>
        <Card className="text-center" padding="lg">
          <p className="truncate text-sm font-semibold text-neutral-600">{teamLabel(team2)}</p>
          <ScoreDisplay value={score2} size="xl" className="mt-1 block text-neutral-900" />
        </Card>
      </div>

      {gameInProgress && (isDeuce || isFinalPoint) && (
        <div className="mt-3 flex justify-center">
          <Badge tone={isFinalPoint ? "error" : "warning"} className="px-3 py-1.5 text-sm">
            {isFinalPoint ? "FINAL POINT" : "DEUCE · Win by 2"}
          </Badge>
        </div>
      )}

      {!gameInProgress && !matchDecided && (
        <Card className="mt-6 bg-success-50 text-center" padding="lg">
          <p className="text-sm font-semibold text-success-700">
            Game {currentGame.game_number} complete
          </p>
          <p className="font-score mt-1 text-2xl text-neutral-900">
            {currentGame.team_1_score} – {currentGame.team_2_score}
          </p>
          <Button
            onClick={handleStartNextGame}
            disabled={isSubmitting}
            size="lg"
            className="mt-4 w-full"
          >
            Start Game {currentGame.game_number + 1}
          </Button>
        </Card>
      )}

      {!gameInProgress && matchDecided && (
        <Card className="mt-6 bg-success-50 text-center" padding="lg">
          <p className="text-sm font-semibold text-success-700">Match decided</p>
          <p className="mt-1 text-lg font-bold text-neutral-900">
            {teamLabel(team1Wins > team2Wins ? team1 : team2)} wins
          </p>
          <Button onClick={handleCompleteMatch} disabled={isSubmitting} size="lg" className="mt-4 w-full">
            Complete Match
          </Button>
        </Card>
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
                      className="min-h-[72px] rounded-xl border border-surface-border bg-surface py-5 text-lg font-semibold text-neutral-900 shadow-sm transition-colors active:bg-neutral-100 disabled:opacity-50"
                    >
                      {p.name}
                    </button>
                  )
                )}
              </div>
              <button
                disabled={isSubmitting}
                onClick={() => setSelection({ kind: "split" })}
                className="mt-3 min-h-[52px] w-full rounded-xl border border-surface-border bg-surface text-base font-medium text-neutral-600 active:bg-neutral-100 disabled:opacity-50"
              >
                Split — can&apos;t attribute
              </button>
            </>
          )}

          {selection?.kind === "player" && (
            <>
              <p className="text-center text-sm font-medium text-neutral-500">
                {selection.player.name} —
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Button
                  variant="success"
                  size="xl"
                  disabled={isSubmitting}
                  onClick={() => submitRally(selection.player.id, "WINNER", selection.team.id)}
                >
                  Winning shot
                </Button>
                <Button
                  variant="destructive"
                  size="xl"
                  disabled={isSubmitting}
                  onClick={() =>
                    submitRally(
                      selection.player.id,
                      "DROP",
                      selection.team.id === team1.id ? team2.id : team1.id
                    )
                  }
                >
                  Drop
                </Button>
              </div>
              <Button
                variant="ghost"
                size="md"
                className="mt-3 w-full"
                disabled={isSubmitting}
                onClick={() => setSelection(null)}
              >
                Cancel
              </Button>
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
                  className="min-h-[72px] rounded-xl border border-surface-border bg-surface py-6 text-lg font-semibold text-neutral-900 active:bg-neutral-100 disabled:opacity-50"
                >
                  {teamLabel(team1)}
                </button>
                <button
                  disabled={isSubmitting}
                  onClick={() => submitRally(null, "SPLIT", team2.id)}
                  className="min-h-[72px] rounded-xl border border-surface-border bg-surface py-6 text-lg font-semibold text-neutral-900 active:bg-neutral-100 disabled:opacity-50"
                >
                  {teamLabel(team2)}
                </button>
              </div>
              <Button
                variant="ghost"
                size="md"
                className="mt-3 w-full"
                disabled={isSubmitting}
                onClick={() => setSelection(null)}
              >
                Cancel
              </Button>
            </>
          )}
        </div>
      )}

      {errorAction && (
        <div className="mt-3">
          <ErrorState
            message={ERROR_COPY[errorAction].message}
            reassurance={ERROR_COPY[errorAction].reassurance}
            onRetry={
              errorAction === "rally" && pendingSubmission.current
                ? retrySubmission
                : errorAction === "undo"
                  ? handleUndo
                  : errorAction === "nextGame"
                    ? handleStartNextGame
                    : errorAction === "complete"
                      ? handleCompleteMatch
                      : undefined
            }
          />
        </div>
      )}

      {gameInProgress && (
        <Button
          variant="secondary"
          size="lg"
          onClick={handleUndo}
          disabled={isSubmitting}
          className="mt-6 w-full"
        >
          ↶ Undo last
        </Button>
      )}
    </main>
  );
}

function teamLabel(team: Team) {
  return team.players.map((p) => p.name).join(" / ");
}
