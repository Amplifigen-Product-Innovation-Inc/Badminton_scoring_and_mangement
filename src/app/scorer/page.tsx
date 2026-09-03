import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StartMatchButton } from "@/components/scorer/start-match-button";
import { LiveBadge } from "@/components/ui/badge";

/**
 * §22/5.1 — a scorer sees only their assigned court/matches. RLS
 * (0002_rls_policies.sql, matches_scorer_select_assigned) is what actually
 * enforces this — the `.eq("scorer_id", ...)` below (for a SCORER account)
 * is belt-and-suspenders UX filtering, not the security boundary.
 *
 * An ADMIN account is also allowed to score — every RLS policy and scoring
 * RPC (start_match/start_next_game/undo_last_rally/complete_match/
 * reopen_match) already lets is_admin() through unconditionally, with no
 * scorer_id check. So for admin this page drops the scorer_id filter
 * entirely and shows every LIVE/SCHEDULED match across all courts, since an
 * admin isn't "assigned" to just one.
 *
 * A SCORER with a single LIVE match is taken straight to the live scoring
 * screen (5.2) — there's nothing to choose, they're already scoring. Admin
 * never auto-redirects like that (they could have several matches live at
 * once across courts) — they always get the picker.
 */
export default async function ScorerHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!profile) redirect("/login");

  const isAdmin = profile.role === "ADMIN";

  let query = supabase
    .from("matches")
    .select(
      "id, match_number, match_type, best_of, status, courts(name), tournaments(name), teams!teams_match_id_fkey(id, team_number, match_participants(players(id, name)))"
    )
    .in("status", ["LIVE", "SCHEDULED"])
    .order("status"); // LIVE < SCHEDULED alphabetically — puts in-progress matches first

  if (!isAdmin) {
    query = query.eq("scorer_id", profile.id);
  }

  const { data: matches } = await query;

  if (!isAdmin) {
    const live = matches?.find((m) => m.status === "LIVE");
    if (live) redirect(`/scorer/matches/${live.id}`);
  }

  const live = isAdmin ? (matches?.filter((m) => m.status === "LIVE") ?? []) : [];
  const scheduled = matches?.filter((m) => m.status === "SCHEDULED") ?? [];

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-xl font-semibold text-neutral-900">
        {isAdmin ? "All matches" : "Your matches"}
      </h1>

      {live.length === 0 && scheduled.length === 0 && (
        <p className="mt-6 text-center text-neutral-400">
          {isAdmin
            ? "No live or scheduled matches right now."
            : "No assigned match right now. Check back once an admin assigns you one."}
        </p>
      )}

      {live.length > 0 && (
        <div className="mt-6 space-y-3">
          {live.map((m) => (
            <Link
              key={m.id}
              href={`/scorer/matches/${m.id}`}
              className="block rounded-xl border border-live-500/30 bg-live-500/5 p-4"
            >
              <LiveBadge />
              <p className="mt-1 text-base font-medium text-neutral-900">
                {m.tournaments?.name} · Match #{m.match_number} · {m.courts?.name ?? "No court"}
              </p>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-6 space-y-3">
        {scheduled.map((m) => {
          const team1 = m.teams?.find((t) => t.team_number === 1);
          const team2 = m.teams?.find((t) => t.team_number === 2);
          const names = (t: typeof team1) =>
            (t?.match_participants ?? []).map((mp) => mp.players?.name).filter(Boolean).join(" / ");
          const toPlayers = (t: typeof team1) =>
            (t?.match_participants ?? [])
              .map((mp) => mp.players)
              .filter((p): p is { id: string; name: string } => p != null);

          return (
            <div key={m.id} className="rounded-xl border border-surface-border bg-surface p-4">
              <p className="text-xs text-neutral-400">
                {m.tournaments?.name} · Match #{m.match_number} · {m.match_type} · Bo{m.best_of}
              </p>
              <p className="mt-1 text-base font-medium text-neutral-900">
                {names(team1)} <span className="text-neutral-400">vs</span> {names(team2)}
              </p>
              <p className="mt-1 text-sm text-neutral-500">{m.courts?.name ?? "No court assigned"}</p>
              {team1 && team2 && (
                <div className="mt-3">
                  <StartMatchButton
                    matchId={m.id}
                    team1={{ id: team1.id, players: toPlayers(team1) }}
                    team2={{ id: team2.id, players: toPlayers(team2) }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
