"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startMatch } from "@/app/scorer/actions";
import { ErrorState } from "@/components/ui/error-state";

type Player = { id: string; name: string };
type Team = { id: string; players: Player[] };

/**
 * §29/4.8 + 0014_first_server.sql — starting a match now doubles as asking
 * the scorer's first question: who's serving first? Tapping a player IS
 * the start action (no separate confirm tap), matching the rally screen's
 * single-tap pattern. computeCurrentServer (serve.ts) uses this answer to
 * seed game 1 instead of defaulting to team 1's first listed player.
 */
export function StartMatchButton({
  matchId,
  team1,
  team2,
}: {
  matchId: string;
  team1: Team;
  team2: Team;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // §33 — don't surface the raw Supabase/Postgres error to the scorer.
  const [failed, setFailed] = useState(false);
  const [pendingPlayerId, setPendingPlayerId] = useState<string | null>(null);

  function handlePick(playerId: string) {
    setFailed(false);
    setPendingPlayerId(playerId);
    startTransition(async () => {
      const res = await startMatch(matchId, playerId);
      if (res.status === "ok") {
        router.push(`/scorer/matches/${matchId}`);
      } else {
        setFailed(true);
      }
    });
  }

  function retry() {
    if (pendingPlayerId) handlePick(pendingPlayerId);
  }

  return (
    <>
      <p className="text-center text-sm font-medium text-neutral-500">Who&apos;s serving first?</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {[...team1.players, ...team2.players].map((p) => (
          <button
            key={p.id}
            disabled={isPending}
            onClick={() => handlePick(p.id)}
            className="min-h-[72px] rounded-xl border border-surface-border bg-surface py-5 text-lg font-semibold text-neutral-900 shadow-sm transition-colors active:bg-neutral-100 disabled:opacity-50"
          >
            {p.name}
          </button>
        ))}
      </div>
      {failed && (
        <div className="mt-2">
          <ErrorState message="We couldn't start the match. Try again." onRetry={retry} />
        </div>
      )}
    </>
  );
}
