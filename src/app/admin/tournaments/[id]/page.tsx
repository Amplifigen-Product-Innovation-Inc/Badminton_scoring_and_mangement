import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TournamentEditForm } from "@/components/admin/tournament-edit-form";
import { StagesManager } from "@/components/admin/stages-manager";

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

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/admin/tournaments" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Tournaments
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-neutral-900">{tournament.name}</h1>

      <div className="mt-6 space-y-6">
        <TournamentEditForm tournament={tournament} />
        <StagesManager tournamentId={id} stages={stages ?? []} />
      </div>
    </main>
  );
}
