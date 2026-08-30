"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addPlayerSchema } from "@/lib/validation/player";

export type AddPlayerResult =
  | { status: "created"; player: { id: string; name: string; email: string } }
  | { status: "duplicate"; player: { id: string; name: string; email: string } }
  | { status: "error"; message: string };

/**
 * §9 Add Player flow: validate -> normalize -> check duplicate -> insert ->
 * refresh list. Duplicate detection is belt-and-suspenders: we check first
 * (so we can show the "already exists" UX with the existing player's
 * details, §9) and the DB's UNIQUE constraint on players.email is the actual
 * backstop against a race between two concurrent submissions.
 */
export async function addPlayer(input: unknown): Promise<AddPlayerResult> {
  const parsed = addPlayerSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { name, email, phone } = parsed.data;
  const supabase = await createClient();

  const { data: existing, error: lookupError } = await supabase
    .from("players")
    .select("id, name, email")
    .eq("email", email)
    .maybeSingle();

  if (lookupError) return { status: "error", message: lookupError.message };
  if (existing) return { status: "duplicate", player: existing };

  const { data: created, error: insertError } = await supabase
    .from("players")
    .insert({ name, email, phone: phone || null })
    .select("id, name, email")
    .single();

  if (insertError) {
    // Unique-violation race: someone else inserted the same email between our
    // lookup and this insert. Treat it the same as a normal duplicate hit.
    if (insertError.code === "23505") {
      const { data: raceWinner } = await supabase
        .from("players")
        .select("id, name, email")
        .eq("email", email)
        .single();
      if (raceWinner) return { status: "duplicate", player: raceWinner };
    }
    return { status: "error", message: insertError.message };
  }

  revalidatePath("/admin/players");
  return { status: "created", player: created };
}
