import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TournamentEditForm } from "@/components/admin/tournament-edit-form";
import { StagesManager } from "@/components/admin/stages-manager";
import { TournamentPlayersManager } from "@/components/admin/tournament-players-manager";
import { GroupsManager } from "@/components/admin/groups-manager";
import { TournamentCourtsManager } from "@/components/admin/tournament-courts-manager";
import { MatchesManager } from "@/components/admin/matches-manager";
import { CrossCategoryStandings } from "@/components/admin/cross-category-standings";
import { TournamentProgress, type ProgressStepStatus } from "@/components/ui/tournament-progress";
import { LiveBadge } from "@/components/ui/badge";

export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, date, location, format, num_courts, description, status, target_score")
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

  const groupIds = (groupRows ?? []).map((g) => g.id);

  // §26/§28 — one group_standings + qualification lookup per group. Small
  // fan-out (a tournament has a handful of groups, not hundreds), run in
  // parallel rather than serially awaited.
  const [standingsByGroup, qualificationRows] = await Promise.all([
    Promise.all(
      groupIds.map(async (gid) => {
        const { data } = await supabase.rpc("group_standings", { p_group_id: gid });
        return [gid, data ?? []] as const;
      })
    ),
    groupIds.length > 0
      ? supabase
          .from("group_qualifications")
          .select("group_id, player_id, qualification_rank")
          .in("group_id", groupIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);
  const standingsMap = new Map(standingsByGroup);
  const qualificationsByGroup = new Map<string, { playerId: string; rank: number }[]>();
  for (const q of qualificationRows.data ?? []) {
    const list = qualificationsByGroup.get(q.group_id) ?? [];
    list.push({ playerId: q.player_id, rank: q.qualification_rank });
    qualificationsByGroup.set(q.group_id, list);
  }

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
        standings: standingsMap.get(g.id) ?? [],
        qualifications: qualificationsByGroup.get(g.id) ?? [],
      })),
  }));

  // §30/§31 — cross_category_standings is per CROSS_CATEGORY-type stage,
  // same small-fan-out shape as the group standings above.
  const crossCategoryStageIds = (stages ?? [])
    .filter((s) => s.stage_type === "CROSS_CATEGORY")
    .map((s) => s.id);
  const crossCategoryStandingsByStage = new Map(
    await Promise.all(
      crossCategoryStageIds.map(async (sid) => {
        const { data } = await supabase.rpc("cross_category_standings", { p_stage_id: sid });
        return [sid, data ?? []] as const;
      })
    )
  );

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

  // §20 — setup progress, computed from what's actually in place rather
  // than gating navigation: every section below stays editable regardless,
  // so the admin is never blocked or forced to restart for missing a step.
  const setupSteps: { label: string; status: ProgressStepStatus }[] = [
    { label: "Basics", status: "done" },
    { label: "Players", status: roster.length > 0 ? "done" : "upcoming" },
    {
      label: "Groups",
      status: stagesWithGroups.some((s) => s.groups.length > 0) ? "done" : "upcoming",
    },
    { label: "Courts", status: courts.length > 0 ? "done" : "upcoming" },
    { label: "Matches", status: matches.length > 0 ? "done" : "upcoming" },
  ];

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link href="/admin/tournaments" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Tournaments
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-neutral-900">{tournament.name}</h1>
        {tournament.status === "IN_PROGRESS" && <LiveBadge label="IN PROGRESS" />}
      </div>
      <div className="mt-3">
        <TournamentProgress steps={setupSteps} />
      </div>

      <div className="mt-6 space-y-6">
        <TournamentEditForm tournament={tournament} />
        <TournamentPlayersManager tournamentId={id} roster={roster} />
        <StagesManager tournamentId={id} stages={stages ?? []} />
        <GroupsManager tournamentId={id} stages={stagesWithGroups} roster={roster} />
        {crossCategoryStageIds.map((sid) => {
          const stage = stages!.find((s) => s.id === sid)!;
          const rows = crossCategoryStandingsByStage.get(sid) ?? [];
          return <CrossCategoryStandings key={sid} stageName={stage.name} rows={rows} />;
        })}
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
