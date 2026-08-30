import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TournamentEditForm } from "@/components/admin/tournament-edit-form";
import { StagesManager } from "@/components/admin/stages-manager";
import { TournamentPlayersManager } from "@/components/admin/tournament-players-manager";
import { GroupsManager } from "@/components/admin/groups-manager";

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
      </div>
    </main>
  );
}
