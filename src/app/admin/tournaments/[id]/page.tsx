import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TournamentEditForm } from "@/components/admin/tournament-edit-form";
import { StagesManager } from "@/components/admin/stages-manager";
import { TournamentPlayersManager } from "@/components/admin/tournament-players-manager";
import { GroupsManager } from "@/components/admin/groups-manager";
import { TournamentCourtsManager } from "@/components/admin/tournament-courts-manager";
import { MatchesManager } from "@/components/admin/matches-manager";

export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, date, location, format, num_courts, description, status")
    .eq("id", id)
    .maybeSingle();

  if (!tournament) notFound();

  const { data: stages } = await supabase
    .from("tournament_stages")
    .select("id, name, stage_type, stage_order, status")
    .eq("tournament_id", id)
    .order("stage_order");

  const { data: rosterRows } = await supabase
    .from("tournament_players")
    .select("status, players(id, name, email)")
    .eq("tournament_id", id);

  const roster = (rosterRows ?? [])
    .filter((r) => r.players)
    .map((r) => ({
      id: r.players!.id,
      name: r.players!.name,
      email: r.players!.email,
      status: r.status,
    }));

  const stageIds = (stages ?? []).map((s) => s.id);
  const { data: groupRows } =
    stageIds.length > 0
      ? await supabase
          .from("tournament_groups")
          .select("id, stage_id, name, category, group_players(players(id, name))")
          .in("stage_id", stageIds)
      : { data: [] as never[] };

  const stagesWithGroups = (stages ?? []).map((stage) => ({
    ...stage,
    groups: (groupRows ?? [])
      .filter((g) => g.stage_id === stage.id)
      .map((g) => ({
        id: g.id,
        name: g.name,
        category: g.category,
        players: (g.group_players ?? [])
          .map((gp) => gp.players)
          .filter((p): p is { id: string; name: string } => p != null),
      })),
  }));

  const { data: courtRows } = await supabase
    .from("tournament_courts")
    .select("status, courts(id, name)")
    .eq("tournament_id", id);

  const courts = (courtRows ?? [])
    .filter((r) => r.courts)
    .map((r) => ({ id: r.courts!.id, name: r.courts!.name, status: r.status }));

  const { data: scorerRows } = await supabase
    .from("profiles")
    .select("id, players(name)")
    .eq("role", "SCORER");

  const scorers = (scorerRows ?? []).map((s) => ({
    id: s.id,
    label: s.players?.name ?? `Scorer ${s.id.slice(0, 8)}`,
  }));

  const { data: matchRows } = await supabase
    .from("matches")
    .select(
      "id, match_number, match_type, best_of, status, courts(name), profiles(id, players(name)), teams!teams_match_id_fkey(team_number, match_participants(players(id, name)))"
    )
    .eq("tournament_id", id)
    .order("match_number");

  // Same fallback as the scorer-picker dropdown (a scorer profile need not
  // be linked to a player, per profiles.player_id's own comment in
  // 0001_init_schema.sql) — without it a scorer_id that's set but
  // player-less renders as "no scorer assigned", which is simply wrong.
  const matches = (matchRows ?? []).map((m) => ({
    id: m.id,
    matchNumber: m.match_number,
    matchType: m.match_type,
    bestOf: m.best_of,
    status: m.status,
    courtName: m.courts?.name ?? null,
    scorerLabel: m.profiles
      ? (m.profiles.players?.name ?? `Scorer ${m.profiles.id.slice(0, 8)}`)
      : null,
    teams: (m.teams ?? []).map((t) => ({
      teamNumber: t.team_number,
      players: (t.match_participants ?? [])
        .map((mp) => mp.players)
        .filter((p): p is { id: string; name: string } => p != null),
    })),
  }));

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/admin/tournaments" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Tournaments
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-neutral-900">{tournament.name}</h1>

      <div className="mt-6 space-y-6">
        <TournamentEditForm tournament={tournament} />
        <TournamentPlayersManager tournamentId={id} roster={roster} />
        <StagesManager tournamentId={id} stages={stages ?? []} />
        <GroupsManager tournamentId={id} stages={stagesWithGroups} roster={roster} />
        <TournamentCourtsManager tournamentId={id} courts={courts} />
        <MatchesManager
          tournamentId={id}
          stages={stagesWithGroups}
          roster={roster}
          courts={courts}
          scorers={scorers}
          matches={matches}
        />
      </div>
    </main>
  );
}
