"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createCourtSchema } from "@/lib/validation/court";

export type CourtActionResult = { status: "ok" } | { status: "error"; message: string };

/** §48 global court registry — a court exists once, independent of any
 * tournament; per-tournament usage/status is tournament_courts (3.5). */
export async function createCourt(input: unknown): Promise<CourtActionResult> {
  const parsed = createCourtSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("courts").insert({ name: parsed.data.name });

  if (error) {
    if (error.code === "23505") return { status: "error", message: "A court with that name already exists." };
    return { status: "error", message: error.message };
  }

  revalidatePath("/admin/courts");
  return { status: "ok" };
}

/**
 * `courts` has `on delete restrict` from tournament_courts, so this fails
 * loudly (not silently) if the court is already attached to a tournament —
 * surface that as a normal error rather than a stack trace.
 */
export async function deleteCourt(id: string): Promise<CourtActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("courts").delete().eq("id", id);

  if (error) {
    if (error.code === "23503") {
      return {
        status: "error",
        message: "This court is used by a tournament — remove it there first.",
      };
    }
    return { status: "error", message: error.message };
  }

  revalidatePath("/admin/courts");
  return { status: "ok" };
}
