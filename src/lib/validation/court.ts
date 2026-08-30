import { z } from "zod";

/** §48 global court registry — just a name; per-tournament usage/status
 * lives in tournament_courts, not here. */
export const createCourtSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
});

export type CreateCourtInput = z.infer<typeof createCourtSchema>;

export const tournamentCourtStatusValues = [
  "AVAILABLE",
  "ASSIGNED",
  "LIVE",
  "COMPLETED",
] as const;
