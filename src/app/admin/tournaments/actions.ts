"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createTournamentSchema, updateTournamentSchema } from "@/lib/validation/tournament";

export type TournamentActionResult =
  | { status: "ok"; id: string }
  | { status: "error"; message: string };

/**
 * §10 Create Tournament. Status always starts DRAFT — the enum's other
 * values are reached via updateTournament (edit/cancel), never set at
 * creation time.
 */
export async function createTournament(input: unknown): Promise<TournamentActionResult> {
  const parsed = createTournamentSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle()
    : { data: null };

  const { data, error } = await supabase
    .from("tournaments")
    .insert({ ...parsed.data, created_by: profile?.id ?? null })
    .select("id")
    .single();

  if (error) return { status: "error", message: error.message };

  revalidatePath("/admin/tournaments");
  return { status: "ok", id: data.id };
}

/**
 * §10 Edit tournament, including status transitions (OPEN/IN_PROGRESS/
 * COMPLETED/CANCELLED) — admin has full override per spec, so no
 * state-machine restriction here (TASKS.md 3.1 is basic CRUD; a stricter
 * transition guard belongs with the match/stage engine in later phases).
 */
export async function updateTournament(
  id: string,
  input: unknown
): Promise<TournamentActionResult> {
  const parsed = updateTournamentSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tournaments").update(parsed.data).eq("id", id);

  if (error) return { status: "error", message: error.message };

  revalidatePath("/admin/tournaments");
  revalidatePath(`/admin/tournaments/${id}`);
  return { status: "ok", id };
}

/** Convenience wrapper for the one-click Cancel action in the list/detail UI. */
export async function cancelTournament(id: string): Promise<TournamentActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tournaments")
    .update({ status: "CANCELLED" })
    .eq("id", id);

  if (error) return { status: "error", message: error.message };

  revalidatePath("/admin/tournaments");
  revalidatePath(`/admin/tournaments/${id}`);
  return { status: "ok", id };
}
