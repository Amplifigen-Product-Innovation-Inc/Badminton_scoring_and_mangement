import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveTournament } from "@/lib/admin/active-tournament";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { LiveCourtMonitor, type MonitorMatch } from "@/components/admin/live-court-monitor";

/**
 * §19/§54 — live court monitor: what's happening on every court right now,
 * filterable and searchable, each tile opening straight into the match.
 */
export default async function AdminMatchesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (profile?.role !== "ADMIN") redirect("/scorer");

  const tournament = await getActiveTournament(supabase);

  if (!tournament) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-semibold text-neutral-900">Courts</h1>
        <div className="mt-6">
          <EmptyState
            title="No tournament running"
            description="Open a tournament and assign courts to see live match status here."
            action={
              <Link href="/admin/tournaments">
                <Button>Go to tournaments</Button>
              </Link>
            }
          />
        </div>
      </main>
    );
  }

  const { data: courtRows } = await supabase
    .from("tournament_courts")
    .select("courts(id, name)")
    .eq("tournament_id", tournament.id);

  const courts = (courtRows ?? [])
    .filter((r) => r.courts)
    .map((r) => ({ id: r.courts!.id, name: r.courts!.name }));

  const { data: matchRows } = await supabase
    .from("matches")
    .select(
      "id, match_number, status, court_id, tournament_stages(name), teams!teams_match_id_fkey(team_number, match_participants(players(name))), games(team_1_score, team_2_score, status)"
    )
    .eq("tournament_id", tournament.id)
    .order("match_number");

  const matches: MonitorMatch[] = (matchRows ?? []).map((m) => {
    const currentGame = (m.games ?? [])
      .filter((g) => g.status === "IN_PROGRESS")
      .at(-1);
    const teamLabel = (teamNumber: number) =>
      (m.teams ?? [])
        .find((t) => t.team_number === teamNumber)
        ?.match_participants?.map((mp) => mp.players?.name)
        .filter(Boolean)
        .join(" / ") ?? "TBD";

    return {
      id: m.id,
      matchNumber: m.match_number,
      status: m.status,
      courtId: m.court_id,
      stageName: m.tournament_stages?.name ?? null,
      team1Label: teamLabel(1),
      team2Label: teamLabel(2),
      score: currentGame ? [currentGame.team_1_score, currentGame.team_2_score] : undefined,
    };
  });

  const stageNames = Array.from(new Set(matches.map((m) => m.stageName).filter(Boolean))) as string[];

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-neutral-900">Courts</h1>
      <p className="mt-1 text-sm text-neutral-500">{tournament.name}</p>

      {courts.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No courts assigned"
            description="Assign courts to this tournament to see live status here."
            action={
              <Link href={`/admin/tournaments/${tournament.id}`}>
                <Button>Assign courts</Button>
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-6">
          <LiveCourtMonitor courts={courts} matches={matches} stageNames={stageNames} />
        </div>
      )}
    </main>
  );
}
