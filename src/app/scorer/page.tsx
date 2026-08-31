import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StartMatchButton } from "@/components/scorer/start-match-button";

/**
 * §22/5.1 — a scorer sees only their assigned court/matches. RLS
 * (0002_rls_policies.sql, matches_scorer_select_assigned) is what actually
 * enforces this — the `.eq("scorer_id", ...)` below is belt-and-suspenders
 * UX filtering, not the security boundary.
 *
 * A LIVE match takes the scorer straight to the live scoring screen (5.2) —
 * there's nothing to choose, they're already scoring. Otherwise, list any
 * SCHEDULED match(es) with a "Start Match" button.
 */
export default async function ScorerHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!profile) redirect("/login");

  const { data: matches } = await supabase
    .from("matches")
    .select(
      "id, match_number, match_type, best_of, status, courts(name), tournaments(name), teams!teams_match_id_fkey(team_number, match_participants(players(name)))"
    )
    .eq("scorer_id", profile.id)
    .in("status", ["LIVE", "SCHEDULED"])
    .order("status"); // LIVE < SCHEDULED alphabetically — puts an in-progress match first

  const live = matches?.find((m) => m.status === "LIVE");
  if (live) redirect(`/scorer/matches/${live.id}`);

  const scheduled = matches?.filter((m) => m.status === "SCHEDULED") ?? [];

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-xl font-semibold text-neutral-900">Your matches</h1>

      {scheduled.length === 0 && (
        <p className="mt-6 text-center text-neutral-400">
          No assigned match right now. Check back once an admin assigns you one.
        </p>
      )}

      <div className="mt-6 space-y-3">
        {scheduled.map((m) => {
          const team1 = m.teams?.find((t) => t.team_number === 1);
          const team2 = m.teams?.find((t) => t.team_number === 2);
          const names = (t: typeof team1) =>
            (t?.match_participants ?? []).map((mp) => mp.players?.name).filter(Boolean).join(" / ");

          return (
            <div key={m.id} className="rounded-xl border border-surface-border bg-surface p-4">
              <p className="text-xs text-neutral-400">
                {m.tournaments?.name} · Match #{m.match_number} · {m.match_type} · Bo{m.best_of}
              </p>
              <p className="mt-1 text-base font-medium text-neutral-900">
                {names(team1)} <span className="text-neutral-400">vs</span> {names(team2)}
              </p>
              <p className="mt-1 text-sm text-neutral-500">{m.courts?.name ?? "No court assigned"}</p>
              <StartMatchButton matchId={m.id} />
            </div>
          );
        })}
      </div>
    </main>
  );
}
