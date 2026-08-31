"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createGroupSchema } from "@/lib/validation/group";

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
