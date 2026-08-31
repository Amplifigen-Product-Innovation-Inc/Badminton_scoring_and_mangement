import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveTournament } from "@/lib/admin/active-tournament";
import { Card } from "@/components/ui/card";
import { KPI } from "@/components/ui/kpi";
import { LiveBadge } from "@/components/ui/badge";
import { TournamentProgress, type ProgressStepStatus } from "@/components/ui/tournament-progress";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

/**
 * §7/§54 — admin command center. Surfaces what's happening right now and
 * what needs a decision, ahead of anything the admin has to go looking for.
 * Every number here comes from a real query against existing tables — no
 * "scorer disconnected" style signal is shown because nothing in the schema
 * tracks it yet (§36 — data trust means never inventing a status).
 */
export default async function AdminHomePage() {
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
        <h1 className="text-2xl font-semibold text-neutral-900">Dashboard</h1>
        <div className="mt-6">
          <EmptyState
            title="No tournament running"
            description="Create a tournament and open it up to see live courts, match progress, and what needs your attention here."
            action={
              <Link href="/admin/tournaments">
                <Button>+ Create tournament</Button>
              </Link>
            }
          />
        </div>
      </main>
    );
  }

  const { data: stages } = await supabase
    .from("tournament_stages")
    .select("id, name, status")
    .eq("tournament_id", tournament.id)
    .order("stage_order");

  const { data: courtRows } = await supabase
    .from("tournament_courts")
    .select("status, courts(id, name)")
    .eq("tournament_id", tournament.id);

  const { data: matchRows } = await supabase
    .from("matches")
    .select("id, status, court_id, scorer_id")
    .eq("tournament_id", tournament.id);

  const matches = matchRows ?? [];
  const liveMatches = matches.filter((m) => m.status === "LIVE");
  const completedCount = matches.filter((m) => m.status === "COMPLETED").length;
  const upcomingCount = matches.filter((m) => m.status === "SCHEDULED").length;
  const courtsActive = new Set(liveMatches.map((m) => m.court_id).filter(Boolean)).size;

  const attention = [
    ...liveMatches
      .filter((m) => !m.court_id)
      .map(() => "A live match has no court assigned."),
    ...liveMatches
      .filter((m) => !m.scorer_id)
      .map(() => "A live match has no scorer assigned."),
  ];

  const progressSteps = (stages ?? []).map((s) => ({
    label: s.name,
    status:
      s.status === "COMPLETED" ? "done" : s.status === "ACTIVE" ? "live" : "upcoming",
  })) satisfies { label: string; status: ProgressStepStatus }[];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <p className="text-sm text-neutral-500">{greeting}, Admin</p>
      <div className="mt-1 flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-neutral-900">{tournament.name}</h1>
        {tournament.status === "IN_PROGRESS" && <LiveBadge />}
      </div>

      {progressSteps.length > 0 && (
        <div className="mt-4">
          <TournamentProgress steps={progressSteps} />
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KPI label="Courts active" value={courtsActive} hint={`of ${courtRows?.length ?? 0}`} tone="brand" />
        <KPI label="Matches live" value={liveMatches.length} tone={liveMatches.length > 0 ? "brand" : "neutral"} />
        <KPI label="Completed" value={completedCount} />
        <KPI label="Upcoming" value={upcomingCount} />
      </div>

      {attention.length > 0 && (
        <Card className="mt-6 border-warning-500/30 bg-warning-50" padding="md">
          <p className="text-sm font-semibold text-warning-700">Attention required</p>
          <ul className="mt-2 space-y-1">
            {attention.map((msg, i) => (
              <li key={i} className="text-sm text-warning-700">
                ⚠ {msg}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900">Live courts</h2>
        <Link href="/admin/matches" className="text-sm font-medium text-brand-700 hover:underline">
          View all courts →
        </Link>
      </div>
    </main>
  );
}
