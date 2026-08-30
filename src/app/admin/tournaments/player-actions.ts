"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addPlayerSchema } from "@/lib/validation/player";

export type PlayerActionResult = { status: "ok" } | { status: "error"; message: string };

type PlayerRow = { id: string; name: string; email: string };

/**
 * §58 search-and-select. Returns global players matching the query that
 * aren't already in this tournament — the checklist should never offer a
 * duplicate add (the DB's `unique (tournament_id, player_id)` would reject
 * it anyway, but filtering here keeps the UI honest).
 */
export async function searchAvailablePlayers(
  tournamentId: string,
  query: string
): Promise<PlayerRow[]> {
  const supabase = await createClient();

  const { data: already } = await supabase
    .from("tournament_players")
    .select("player_id")
    .eq("tournament_id", tournamentId);
  const excludeIds = (already ?? []).map((r) => r.player_id);

  let q = supabase.from("players").select("id, name, email").order("name").limit(20);
  const term = query.trim();
  if (term) q = q.or(`name.ilike.%${term}%,email.ilike.%${term}%`);
  if (excludeIds.length > 0) q = q.not("id", "in", `(${excludeIds.join(",")})`);

  const { data, error } = await q;
  if (error) return [];
  return data ?? [];
}

/** §58 "Add Selected" — bulk-add existing players to the tournament. */
export async function addPlayersToTournament(
  tournamentId: string,
  playerIds: string[]
): Promise<PlayerActionResult> {
  if (playerIds.length === 0) return { status: "ok" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("tournament_players")
    .insert(playerIds.map((player_id) => ({ tournament_id: tournamentId, player_id })));

  // Race with another admin adding the same player concurrently — treat as
  // a soft success rather than surfacing a confusing unique-violation.
  if (error && error.code !== "23505") return { status: "error", message: error.message };

  revalidatePath(`/admin/tournaments/${tournamentId}`);
  return { status: "ok" };
}

/**
 * §58 "+ Add New Player" — inserts into the global player table (same
 * validate/normalize/duplicate-check path as the main Players page, §9)
 * then immediately adds the (new-or-existing) player to this tournament.
 */
export async function addNewPlayerAndAddToTournament(
  tournamentId: string,
  input: unknown
): Promise<PlayerActionResult> {
  const parsed = addPlayerSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { name, email, phone } = parsed.data;
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("players")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  let playerId = existing?.id;
  if (!playerId) {
    const { data: created, error: insertError } = await supabase
      .from("players")
      .insert({ name, email, phone: phone || null })
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        const { data: raceWinner } = await supabase
          .from("players")
          .select("id")
          .eq("email", email)
          .single();
        playerId = raceWinner?.id;
      } else {
        return { status: "error", message: insertError.message };
      }
    } else {
      playerId = created.id;
    }
  }

  if (!playerId) return { status: "error", message: "Could not resolve player" };

  const { error: linkError } = await supabase
    .from("tournament_players")
    .insert({ tournament_id: tournamentId, player_id: playerId });

  if (linkError && linkError.code !== "23505") {
    return { status: "error", message: linkError.message };
  }

  revalidatePath(`/admin/tournaments/${tournamentId}`);
  return { status: "ok" };
}

/**
 * Removes a player from the tournament roster. Deletes the row outright
 * rather than marking WITHDRAWN — at this phase no match/group data can
 * reference the player yet (3.3 predates match creation, 3.6), so there's
 * no history to preserve. Revisit to a status-flip once matches exist.
 */
export async function removePlayerFromTournament(
  tournamentId: string,
  playerId: string
): Promise<PlayerActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tournament_players")
    .delete()
    .eq("tournament_id", tournamentId)
    .eq("player_id", playerId);

  if (error) return { status: "error", message: error.message };

  revalidatePath(`/admin/tournaments/${tournamentId}`);
  return { status: "ok" };
}
