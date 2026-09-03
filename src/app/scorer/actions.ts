"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordRallySchema } from "@/lib/validation/rally";

export type ScorerActionResult = { status: "ok" } | { status: "error"; message: string };

/** §29/4.8 — SCHEDULED -> LIVE, creates game 1. Thin wrapper over the RPC;
 * all authorization/validity lives there (start_match, 0006_match_lifecycle.sql).
 * `firstServerPlayerId` (0014_first_server.sql) is the scorer's answer to
 * "who's serving first?", asked once at match start — stored on the match
 * and used to seed computeCurrentServer for game 1. */
export async function startMatch(
  matchId: string,
  firstServerPlayerId: string
): Promise<ScorerActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_match", {
    p_match_id: matchId,
    p_first_server_player_id: firstServerPlayerId,
  });

  if (error) return { status: "error", message: error.message };

  revalidatePath("/scorer");
  revalidatePath(`/scorer/matches/${matchId}`);
  return { status: "ok" };
}

/**
 * §24-28 rally recording — a plain scorer-owned INSERT (RLS already
 * restricts this to the caller's own LIVE match/IN_PROGRESS game,
 * 0002_rls_policies.sql), not an RPC. §51 idempotency: `input.id` is
 * client-generated: a retried submission (same id) hits the rallies PK
 * unique-violation, which is treated as success here rather than surfaced
 * as an error — the point of an idempotent id is that "already recorded"
 * and "just recorded" look the same to the caller.
 */
export async function recordRally(input: unknown): Promise<ScorerActionResult> {
  const parsed = recordRallySchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!profile) return { status: "error", message: "No profile for current user" };

  const { error } = await supabase.from("rallies").insert({
    id: parsed.data.id,
    game_id: parsed.data.gameId,
    player_id: parsed.data.playerId,
    event_type: parsed.data.eventType,
    winning_team_id: parsed.data.winningTeamId,
    losing_player_id: parsed.data.losingPlayerId,
    created_by: profile.id,
  });

  if (error && error.code !== "23505") return { status: "error", message: error.message };

  revalidatePath(`/scorer/matches/${parsed.data.matchId}`);
  return { status: "ok" };
}

/** §53/4.3 — thin wrapper over the undo_last_rally RPC. */
export async function undoLastRally(matchId: string, gameId: string): Promise<ScorerActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("undo_last_rally", { p_game_id: gameId });

  if (error) return { status: "error", message: error.message };

  revalidatePath(`/scorer/matches/${matchId}`);
  return { status: "ok" };
}

/** Bo3 continuation (§29/4.8) — thin wrapper over start_next_game. */
export async function startNextGame(matchId: string): Promise<ScorerActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_next_game", { p_match_id: matchId });

  if (error) return { status: "error", message: error.message };

  revalidatePath(`/scorer/matches/${matchId}`);
  return { status: "ok" };
}

/** §29 steps 1-9/4.7 — thin wrapper over complete_match. */
export async function completeMatch(matchId: string): Promise<ScorerActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_match", { p_match_id: matchId });

  if (error) return { status: "error", message: error.message };

  revalidatePath("/scorer");
  revalidatePath(`/scorer/matches/${matchId}`);
  return { status: "ok" };
}
