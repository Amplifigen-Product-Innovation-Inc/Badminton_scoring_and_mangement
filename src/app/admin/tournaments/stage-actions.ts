"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createStageSchema, updateStageSchema } from "@/lib/validation/stage";

export type StageActionResult = { status: "ok" } | { status: "error"; message: string };

/**
 * §11 flexible stage model. New stages are appended at the end
 * (max(stage_order) + 1) — reordering afterward is done explicitly via
 * moveStage, never by typing a number directly (avoids collisions with the
 * `unique (tournament_id, stage_order)` constraint).
 */
export async function createStage(
  tournamentId: string,
  input: unknown
): Promise<StageActionResult> {
  const parsed = createStageSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();

  const { data: last } = await supabase
    .from("tournament_stages")
    .select("stage_order")
    .eq("tournament_id", tournamentId)
    .order("stage_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("tournament_stages").insert({
    tournament_id: tournamentId,
    name: parsed.data.name,
    stage_type: parsed.data.stage_type,
    stage_order: (last?.stage_order ?? 0) + 1,
  });

  if (error) return { status: "error", message: error.message };

  revalidatePath(`/admin/tournaments/${tournamentId}`);
  return { status: "ok" };
}

export async function updateStage(
  stageId: string,
  tournamentId: string,
  input: unknown
): Promise<StageActionResult> {
  const parsed = updateStageSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tournament_stages")
    .update(parsed.data)
    .eq("id", stageId);

  if (error) return { status: "error", message: error.message };

  revalidatePath(`/admin/tournaments/${tournamentId}`);
  return { status: "ok" };
}

export async function deleteStage(
  stageId: string,
  tournamentId: string
): Promise<StageActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("tournament_stages").delete().eq("id", stageId);

  if (error) return { status: "error", message: error.message };

  revalidatePath(`/admin/tournaments/${tournamentId}`);
  return { status: "ok" };
}

/**
 * Swap this stage's position with its immediate neighbor. Goes through a
 * temporary negative stage_order to avoid tripping the
 * `unique (tournament_id, stage_order)` constraint mid-swap (Postgres
 * checks each UPDATE's uniqueness immediately, not at transaction commit,
 * since this constraint isn't declared DEFERRABLE).
 */
export async function moveStage(
  stageId: string,
  tournamentId: string,
  direction: "up" | "down"
): Promise<StageActionResult> {
  const supabase = await createClient();

  const { data: current, error: currentError } = await supabase
    .from("tournament_stages")
    .select("id, stage_order")
    .eq("id", stageId)
    .single();
  if (currentError) return { status: "error", message: currentError.message };

  const neighborQuery = supabase
    .from("tournament_stages")
    .select("id, stage_order")
    .eq("tournament_id", tournamentId);

  const { data: neighbor } = await (direction === "up"
    ? neighborQuery
        .lt("stage_order", current.stage_order)
        .order("stage_order", { ascending: false })
    : neighborQuery.gt("stage_order", current.stage_order).order("stage_order", { ascending: true })
  ).limit(1).maybeSingle();

  if (!neighbor) return { status: "ok" }; // already at the edge — no-op, not an error

  const { error: e1 } = await supabase
    .from("tournament_stages")
    .update({ stage_order: -current.stage_order })
    .eq("id", current.id);
  if (e1) return { status: "error", message: e1.message };

  const { error: e2 } = await supabase
    .from("tournament_stages")
    .update({ stage_order: current.stage_order })
    .eq("id", neighbor.id);
  if (e2) return { status: "error", message: e2.message };

  const { error: e3 } = await supabase
    .from("tournament_stages")
    .update({ stage_order: neighbor.stage_order })
    .eq("id", current.id);
  if (e3) return { status: "error", message: e3.message };

  revalidatePath(`/admin/tournaments/${tournamentId}`);
  return { status: "ok" };
}
