import { z } from "zod";

/**
 * §24-28 rally recording. `id` is client-generated (§51 idempotent rally
 * IDs) — a retried submission reuses the same id, so the DB's primary-key
 * uniqueness is what actually prevents a duplicate rally, not this schema.
 *
 * `losingPlayerId` (0013_rally_drop_attribution.sql): every WINNER rally now
 * mandatorily pairs the specific opposing player who missed the winning
 * shot — required iff eventType is WINNER, mirroring the DB's
 * rallies_winner_requires_losing_player CHECK constraint.
 */
export const recordRallySchema = z
  .object({
    id: z.string().uuid(),
    matchId: z.string().uuid(),
    gameId: z.string().uuid(),
    playerId: z.string().uuid().nullable(),
    eventType: z.enum(["WINNER", "DROP", "SPLIT"]),
    winningTeamId: z.string().uuid(),
    losingPlayerId: z.string().uuid().nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.eventType === "WINNER" && val.losingPlayerId === null) {
      ctx.addIssue({
        code: "custom",
        path: ["losingPlayerId"],
        message: "losingPlayerId is required for a WINNER rally",
      });
    }
    if (val.eventType !== "WINNER" && val.losingPlayerId !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["losingPlayerId"],
        message: "losingPlayerId must be null unless eventType is WINNER",
      });
    }
  });

export type RecordRallyInput = z.infer<typeof recordRallySchema>;
