import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";

/**
 * Shared by the admin dashboard and the live court monitor (§7/§19) — both
 * need "the tournament the admin almost certainly wants to look at right
 * now": one actually running, else the most recently-created OPEN one so a
 * not-yet-started tournament still surfaces.
 */
export async function getActiveTournament(supabase: SupabaseClient<Database>) {
  const { data } = await supabase
    .from("tournaments")
    .select("id, name, status, date")
    .in("status", ["IN_PROGRESS", "OPEN"])
    .order("status") // "IN_PROGRESS" < "OPEN" alphabetically — running tournament wins
    .order("date", { ascending: false, nullsFirst: false });

  return data?.[0] ?? null;
}
