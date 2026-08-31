import { z } from "zod";

/**
 * §24-28 rally recording. `id` is client-generated (§51 idempotent rally
 * IDs) — a retried submission reuses the same id, so the DB's primary-key
 * uniqueness is what actually prevents a duplicate rally, not this schema.
 */
export const recordRallySchema = z.object({
  id: z.string().uuid(),
  matchId: z.string().uuid(),
  gameId: z.string().uuid(),
  playerId: z.string().uuid().nullable(),
  eventType: z.enum(["WINNER", "DROP", "SPLIT"]),
  winningTeamId: z.string().uuid(),
});

export type RecordRallyInput = z.infer<typeof recordRallySchema>;
