import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LiveScoringScreen } from "@/components/scorer/live-scoring-screen";

export default async function ScorerMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: match } = await supabase
    .from("matches")
    .select(
      `id, match_number, match_type, best_of, status,
       courts(name), tournaments(name, target_score, win_by, max_score),
       teams!teams_match_id_fkey(id, team_number, match_participants(players(id, name))),
       games(id, game_number, status, team_1_score, team_2_score, winner_team_id,
             rallies(winning_team_id, sequence_number))`
    )
    .eq("id", id)
    .maybeSingle();

  // RLS already scopes this to the caller's own assigned match — a miss
  // here means either it doesn't exist or it isn't theirs, same UX either
  // way (§50: never let the UI distinguish "not found" from "not yours").
  if (!match) notFound();

  const team1 = match.teams?.find((t) => t.team_number === 1);
  const team2 = match.teams?.find((t) => t.team_number === 2);
  if (!team1 || !team2) notFound();

  const toPlayers = (t: typeof team1) =>
    (t?.match_participants ?? [])
      .map((mp) => mp.players)
      .filter((p): p is { id: string; name: string } => p != null);

  const games = [...(match.games ?? [])]
    .sort((a, b) => a.game_number - b.game_number)
    .map((g) => ({
      ...g,
      rallies: [...(g.rallies ?? [])]
        .sort((a, b) => a.sequence_number - b.sequence_number)
        .map((r) => ({ winningTeamId: r.winning_team_id })),
    }));

  return (
    <LiveScoringScreen
      matchId={match.id}
      matchNumber={match.match_number}
      matchType={match.match_type}
      bestOf={match.best_of}
      status={match.status}
      courtName={match.courts?.name ?? null}
      tournamentName={match.tournaments?.name ?? ""}
      targetScore={match.tournaments?.target_score ?? 21}
      winBy={match.tournaments?.win_by ?? 2}
      maxScore={match.tournaments?.max_score ?? 30}
      team1={{ id: team1.id, players: toPlayers(team1) }}
      team2={{ id: team2.id, players: toPlayers(team2) }}
      games={games}
    />
  );
}
