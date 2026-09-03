import { z } from "zod";

/**
 * §10 Tournament Creation fields, plus the status enum from the same
 * section. `date`/`location`/`format`/`description` are all nullable in the
 * schema (0001_init_schema.sql) — empty string from the form means "not set",
 * not the literal string.
 */
const emptyToNull = (val: unknown) => (val === "" || val == null ? null : val);

export const tournamentStatusValues = [
  "DRAFT",
  "OPEN",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;

// `format` used to be free text ("Singles, round-robin groups", etc.) — now a
// fixed dropdown so the value is actually usable elsewhere (e.g. defaulting
// match_type when creating matches) instead of an unstructured description.
export const tournamentFormatValues = ["SINGLES", "DOUBLES", "MIXED_DOUBLES"] as const;

// Game-points presets, exposed as a dropdown rather than raw target_score/
// win_by/max_score inputs. The three underlying columns
// (0001_init_schema.sql) already drive recompute_game_score for every game
// in the tournament — this is only a friendlier way to set them.
// 11-point: half-length "fast" games, common for casual/time-boxed formats
// — win-by-2, capped at 15 (same +4 cap-over-target margin ratio as
// standard scoring's 21/30). 21-point: standard badminton (the schema's
// own defaults).
export const gamePointsValues = ["11", "21"] as const;

const GAME_POINTS_CONFIG: Record<
  (typeof gamePointsValues)[number],
  { target_score: number; win_by: number; max_score: number }
> = {
  "11": { target_score: 11, win_by: 2, max_score: 15 },
  "21": { target_score: 21, win_by: 2, max_score: 30 },
};

/** Reverse mapping for pre-filling the edit form's dropdown from a
 * tournament's existing target_score. Falls back to "21" (the schema
 * default) for any tournament whose scoring config predates this dropdown
 * or was hand-set to something else — there's no "custom" option in the UI,
 * so this is the closest preset rather than a lossless round-trip. */
export function gamePointsFromTargetScore(targetScore: number): (typeof gamePointsValues)[number] {
  return targetScore === 11 ? "11" : "21";
}

const baseTournamentSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  date: z.preprocess(emptyToNull, z.string().date().nullable()),
  location: z.preprocess(emptyToNull, z.string().trim().max(200).nullable()),
  format: z.preprocess(emptyToNull, z.enum(tournamentFormatValues).nullable()),
  num_courts: z.preprocess(
    emptyToNull,
    z.coerce.number().int().positive().nullable()
  ),
  description: z.preprocess(emptyToNull, z.string().trim().max(2000).nullable()),
  game_points: z.preprocess(emptyToNull, z.enum(gamePointsValues).nullable()),
});

function withGamePointsConfig<T extends { game_points: string | null }>(data: T) {
  const { game_points, ...rest } = data;
  return { ...rest, ...GAME_POINTS_CONFIG[(game_points as (typeof gamePointsValues)[number]) ?? "21"] };
}

export const createTournamentSchema = baseTournamentSchema.transform(withGamePointsConfig);

export const updateTournamentSchema = baseTournamentSchema
  .extend({ status: z.enum(tournamentStatusValues) })
  .transform(withGamePointsConfig);

export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
export type UpdateTournamentInput = z.infer<typeof updateTournamentSchema>;
