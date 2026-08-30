"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createCourtSchema, tournamentCourtStatusValues } from "@/lib/validation/court";

export type CourtActionResult = { status: "ok" } | { status: "error"; message: string };
type CourtRow = { id: string; name: string };

/** §48 search-and-select for courts, same shape as searchAvailablePlayers
 * (3.3) — excludes courts already attached to this tournament. */
export async function searchAvailableCourts(
  tournamentId: string,
  query: string
): Promise<CourtRow[]> {
  const supabase = await createClient();

  const { data: already } = await supabase
    .from("tournament_courts")
    .select("court_id")
    .eq("tournament_id", tournamentId);
  const excludeIds = (already ?? []).map((r) => r.court_id);

  let q = supabase.from("courts").select("id, name").order("name").limit(20);
  const term = query.trim();
  if (term) q = q.ilike("name", `%${term}%`);
  if (excludeIds.length > 0) q = q.not("id", "in", `(${excludeIds.join(",")})`);

  const { data, error } = await q;
  if (error) return [];
  return data ?? [];
}

export async function addCourtsToTournament(
  tournamentId: string,
  courtIds: string[]
): Promise<CourtActionResult> {
  if (courtIds.length === 0) return { status: "ok" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("tournament_courts")
    .insert(courtIds.map((court_id) => ({ tournament_id: tournamentId, court_id })));

  if (error && error.code !== "23505") return { status: "error", message: error.message };

  revalidatePath(`/admin/tournaments/${tournamentId}`);
  return { status: "ok" };
}

/** "+ Add New Court" — creates the global court then attaches it, same
 * pattern as addNewPlayerAndAddToTournament. */
export async function addNewCourtAndAddToTournament(
  tournamentId: string,
  input: unknown
): Promise<CourtActionResult> {
  const parsed = createCourtSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("courts")
    .select("id")
    .eq("name", parsed.data.name)
    .maybeSingle();

  let courtId = existing?.id;
  if (!courtId) {
    const { data: created, error: insertError } = await supabase
      .from("courts")
      .insert({ name: parsed.data.name })
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        const { data: raceWinner } = await supabase
          .from("courts")
          .select("id")
          .eq("name", parsed.data.name)
          .single();
        courtId = raceWinner?.id;
      } else {
        return { status: "error", message: insertError.message };
      }
    } else {
      courtId = created.id;
    }
  }

  if (!courtId) return { status: "error", message: "Could not resolve court" };

  const { error: linkError } = await supabase
    .from("tournament_courts")
    .insert({ tournament_id: tournamentId, court_id: courtId });

  if (linkError && linkError.code !== "23505") {
    return { status: "error", message: linkError.message };
  }

  revalidatePath(`/admin/tournaments/${tournamentId}`);
  return { status: "ok" };
}

export async function updateTournamentCourtStatus(
  tournamentId: string,
  courtId: string,
  status: unknown
): Promise<CourtActionResult> {
  const parsed = tournamentCourtStatusValues.find((s) => s === status);
  if (!parsed) return { status: "error", message: "Invalid status" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("tournament_courts")
    .update({ status: parsed })
    .eq("tournament_id", tournamentId)
    .eq("court_id", courtId);

  if (error) return { status: "error", message: error.message };

  revalidatePath(`/admin/tournaments/${tournamentId}`);
  return { status: "ok" };
}

export async function removeCourtFromTournament(
  tournamentId: string,
  courtId: string
): Promise<CourtActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tournament_courts")
    .delete()
    .eq("tournament_id", tournamentId)
    .eq("court_id", courtId);

  if (error) return { status: "error", message: error.message };

  revalidatePath(`/admin/tournaments/${tournamentId}`);
  return { status: "ok" };
}
