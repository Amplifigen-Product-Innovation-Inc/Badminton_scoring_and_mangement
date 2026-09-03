"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createGroupSchema } from "@/lib/validation/group";
import { createMatch } from "@/app/admin/tournaments/match-actions";

export type GroupActionResult = { status: "ok" } | { status: "error"; message: string };

/** §12 Groups CRUD, scoped to a stage. */
export async function createGroup(
  stageId: string,
  tournamentId: string,
  input: unknown
): Promise<GroupActionResult> {
  const parsed = createGroupSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tournament_groups")
    .insert({ stage_id: stageId, name: parsed.data.name, category: parsed.data.category });

  if (error) return { status: "error", message: error.message };

  revalidatePath(`/admin/tournaments/${tournamentId}`);
  return { status: "ok" };
}

export async function deleteGroup(
  groupId: string,
  tournamentId: string
): Promise<GroupActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("tournament_groups").delete().eq("id", groupId);

  if (error) return { status: "error", message: error.message };

  revalidatePath(`/admin/tournaments/${tournamentId}`);
  return { status: "ok" };
}

/** §48 group membership — a player already on the tournament roster gets
 * assigned into a group within one of its stages. */
export async function addPlayerToGroup(
  groupId: string,
  playerId: string,
  tournamentId: string
): Promise<GroupActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("group_players")
    .insert({ group_id: groupId, player_id: playerId });

  if (error && error.code !== "23505") return { status: "error", message: error.message };

  revalidatePath(`/admin/tournaments/${tournamentId}`);
  return { status: "ok" };
}

export async function removePlayerFromGroup(
  groupId: string,
  playerId: string,
  tournamentId: string
): Promise<GroupActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("group_players")
    .delete()
    .eq("group_id", groupId)
    .eq("player_id", playerId);

  if (error) return { status: "error", message: error.message };

  revalidatePath(`/admin/tournaments/${tournamentId}`);
  return { status: "ok" };
}

/**
 * §15/§28 — persists the group's top 2 into group_qualifications via
 * compute_group_qualification (0007_group_standings.sql). Leaves any
 * admin-overridden rank untouched (the RPC's own job, not this wrapper's).
 */
export async function computeGroupQualification(
  groupId: string,
  tournamentId: string
): Promise<GroupActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("compute_group_qualification", { p_group_id: groupId });

  if (error) return { status: "error", message: error.message };

  revalidatePath(`/admin/tournaments/${tournamentId}`);
  return { status: "ok" };
}

/**
 * "Qualify top 2" for a CROSS_CATEGORY stage — mirrors
 * computeGroupQualification above, persisting into
 * cross_category_qualifications (0011_cross_category_qualification.sql).
 *
 * Additionally, best-effort auto-creates the next match between the top 2
 * qualified teams, IF: a FINAL stage already exists in this tournament
 * (never auto-created — an admin adds it via Stages, same as any other
 * stage), and no match in that stage already involves either qualified
 * source group (so recomputing qualification after a re-ranking never
 * duplicates the final). Failing to auto-create the match is never a
 * qualification failure — the persisted ranks are what "top 2" actually
 * means; the match is a convenience the admin can always create manually
 * via Matches below if this can't.
 */
export async function computeCrossCategoryQualification(
  stageId: string,
  tournamentId: string
): Promise<GroupActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("compute_cross_category_qualification", {
    p_stage_id: stageId,
  });

  if (error) return { status: "error", message: error.message };

  const { data: qualRows } = await supabase
    .from("cross_category_qualifications")
    .select("source_group_id, qualification_rank")
    .eq("stage_id", stageId)
    .order("qualification_rank");

  if ((qualRows?.length ?? 0) === 2) {
    const [first, second] = qualRows!;

    const { data: finalStage } = await supabase
      .from("tournament_stages")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("stage_type", "FINAL")
      .maybeSingle();

    if (finalStage) {
      const { data: finalStageMatches } = await supabase
        .from("matches")
        .select("id, teams!teams_match_id_fkey(source_group_id)")
        .eq("stage_id", finalStage.id);

      const alreadyCreated = (finalStageMatches ?? []).some((m) =>
        (m.teams ?? []).some(
          (t) =>
            t.source_group_id === first.source_group_id ||
            t.source_group_id === second.source_group_id
        )
      );

      if (!alreadyCreated) {
        const [{ data: team1Players }, { data: team2Players }, { data: sampleMatch }] =
          await Promise.all([
            supabase
              .from("group_qualifications")
              .select("player_id")
              .eq("group_id", first.source_group_id)
              .order("qualification_rank"),
            supabase
              .from("group_qualifications")
              .select("player_id")
              .eq("group_id", second.source_group_id)
              .order("qualification_rank"),
            supabase
              .from("matches")
              .select("match_type, best_of")
              .eq("stage_id", stageId)
              .limit(1)
              .maybeSingle(),
          ]);

        if (team1Players && team1Players.length > 0 && team2Players && team2Players.length > 0) {
          await createMatch(tournamentId, {
            stageId: finalStage.id,
            groupId: null,
            team1SourceGroupId: first.source_group_id,
            team2SourceGroupId: second.source_group_id,
            matchType: sampleMatch?.match_type ?? "SINGLES",
            bestOf: sampleMatch?.best_of ?? 3,
            courtId: null,
            scorerId: null,
            team1PlayerIds: team1Players.map((p) => p.player_id),
            team2PlayerIds: team2Players.map((p) => p.player_id),
          });
        }
      }
    }
  }

  revalidatePath(`/admin/tournaments/${tournamentId}`);
  return { status: "ok" };
}
