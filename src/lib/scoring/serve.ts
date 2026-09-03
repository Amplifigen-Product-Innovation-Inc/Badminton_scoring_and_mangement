/**
 * Derives who is currently serving, purely from the rally history already
 * being recorded for scoring — no extra scorer input needed.
 *
 * RULES (modern rally-point badminton — no pre-2006 "first/second server"
 * concept; that only existed under old side-out scoring):
 *   - Whichever side is serving keeps the SAME player serving as long as
 *     they keep winning rallies; that player's court (right/left) swaps
 *     each such point (right when their team's score is even, left when
 *     odd), so the two teammates swap positions with the server.
 *   - The moment the serving side loses a rally, service passes to the
 *     other side outright (no partner hand-off, no exception even for the
 *     very first serve of the game — a single loss is always a side-out).
 *   - The receiving side's two players don't move while receiving, so
 *     whichever of them is in the correct court (by THEIR team's own score
 *     parity) when they gain serve is who serves next — determined by
 *     wherever that swap history last left them.
 *
 * DEFAULT (no data to base it on, and the scorer isn't asked): team 1
 * serves first each game, starting with its first listed player at
 * "right". This only affects which name is shown as serving — it never
 * affects the actual score, which is computed independently
 * (recompute_game_score, driven by rallies.winning_team_id).
 */

export type ServeTeam = { id: string; players: { id: string; name: string }[] };
export type ServeRally = { winningTeamId: string };

export type ServerState = {
  servingTeamId: string;
  /** The specific player currently up to serve. Null only if the serving
   * team has no players on record (shouldn't happen for a real match). */
  server: { id: string; name: string } | null;
};

export function computeCurrentServer(
  rallies: ServeRally[],
  team1: ServeTeam,
  team2: ServeTeam
): ServerState {
  // [right, left] occupants for each team; swaps in place as service
  // continues. Length 1 for singles — trivially always "server".
  const positions: Record<string, { id: string; name: string }[]> = {
    [team1.id]: [...team1.players],
    [team2.id]: [...team2.players],
  };

  let servingTeamId = team1.id;
  const score: Record<string, number> = { [team1.id]: 0, [team2.id]: 0 };

  for (const rally of rallies) {
    if (rally.winningTeamId === servingTeamId) {
      score[servingTeamId] += 1;
      const pos = positions[servingTeamId];
      if (pos.length === 2) {
        positions[servingTeamId] = [pos[1], pos[0]];
      }
    } else {
      // Side-out — service passes outright, no score change, positions of
      // the newly-serving team are left exactly as they were.
      servingTeamId = rally.winningTeamId;
    }
  }

  const pos = positions[servingTeamId] ?? [];
  const parity = score[servingTeamId] % 2; // 0 = right, 1 = left
  const server = pos.length === 2 ? (pos[parity] ?? pos[0] ?? null) : (pos[0] ?? null);

  return { servingTeamId, server: server ?? null };
}
