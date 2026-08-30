"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createMatchSchema } from "@/lib/validation/match";

export type MatchActionResult = { status: "ok" } | { status: "error"; message: string };

/**
 * §19/§20 match creation. match_number is tournament-scoped and
 * auto-incremented (max+1), matching the stage-order append pattern (3.2).
 * scorer assignment is match-level only for now (matches.scorer_id) — see
 * the design note in TASKS.md 3.6 on why court-level (§22's stated
 * preference) is deferred rather than built alongside this.
 */
export async function createMatch(
  tournamentId: string,
  input: unknown
): Promise<MatchActionResult> {
  const parsed = createMatchSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path?.join(".");
    const message = issue ? (field ? `${field}: ${issue.message}` : issue.message) : "Invalid input";
    return { status: "error", message };
  }
  const data = parsed.data;

  const supabase = await createClient();

  const { data: last } = await supabase
    .from("matches")
    .select("match_number")
    .eq("tournament_id", tournamentId)
    .order("match_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: match, error: matchError } = await supabase
    .from("matches")
    .insert({
      tournament_id: tournamentId,
      stage_id: data.stageId,
      group_id: data.groupId,
      court_id: data.courtId,
      scorer_id: data.scorerId,
      match_number: (last?.match_number ?? 0) + 1,
      match_type: data.matchType,
      best_of: data.bestOf,
    })
    .select("id")
    .single();

  if (matchError) return { status: "error", message: matchError.message };

  // No cross-table transaction available from here (supabase-js issues each
  // .insert as its own statement) — on any failure past this point, delete
  // the match we just created rather than leave a teamless orphan row
  // around. A real atomic version of this belongs in a Postgres RPC
  // alongside the Phase 4 scoring-engine functions.
  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .insert([
      { match_id: match.id, team_number: 1, source_group_id: data.groupId },
      { match_id: match.id, team_number: 2, source_group_id: data.groupId },
    ])
    .select("id, team_number");

  if (teamsError) {
    await supabase.from("matches").delete().eq("id", match.id);
    return { status: "error", message: teamsError.message };
  }

  const team1 = teams.find((t) => t.team_number === 1)!;
  const team2 = teams.find((t) => t.team_number === 2)!;

  const participants = [
    ...data.team1PlayerIds.map((player_id) => ({
      match_id: match.id,
      team_id: team1.id,
      player_id,
    })),
    ...data.team2PlayerIds.map((player_id) => ({
      match_id: match.id,
      team_id: team2.id,
      player_id,
    })),
  ];

  const { error: participantsError } = await supabase
    .from("match_participants")
    .insert(participants);

  if (participantsError) {
    await supabase.from("matches").delete().eq("id", match.id);
    return { status: "error", message: participantsError.message };
  }

  revalidatePath(`/admin/tournaments/${tournamentId}`);
  return { status: "ok" };
}

/**
 * Only lets a SCHEDULED match with no games yet be removed outright —
 * cascade deletes teams/participants/games, which is safe pre-play but
 * would silently destroy rally history once a match has actually started
 * (that's what CANCELLED status / 7.5's edit+recalculate are for instead).
 */
export async function deleteMatch(matchId: string, tournamentId: string): Promise<MatchActionResult> {
  const supabase = await createClient();

  const { data: match } = await supabase
    .from("matches")
    .select("status")
    .eq("id", matchId)
    .maybeSingle();

  if (!match) return { status: "error", message: "Match not found" };
  if (match.status !== "SCHEDULED") {
    return {
      status: "error",
      message: "Only a SCHEDULED match with no play yet can be deleted — cancel it instead.",
    };
  }

  const { error } = await supabase.from("matches").delete().eq("id", matchId);
  if (error) return { status: "error", message: error.message };

  revalidatePath(`/admin/tournaments/${tournamentId}`);
  return { status: "ok" };
}

export async function cancelMatch(matchId: string, tournamentId: string): Promise<MatchActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("matches")
    .update({ status: "CANCELLED" })
    .eq("id", matchId);

  if (error) return { status: "error", message: error.message };

  revalidatePath(`/admin/tournaments/${tournamentId}`);
  return { status: "ok" };
}
