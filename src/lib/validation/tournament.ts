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

export const createTournamentSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  date: z.preprocess(emptyToNull, z.string().date().nullable()),
  location: z.preprocess(emptyToNull, z.string().trim().max(200).nullable()),
  format: z.preprocess(emptyToNull, z.enum(tournamentFormatValues).nullable()),
  num_courts: z.preprocess(
    emptyToNull,
    z.coerce.number().int().positive().nullable()
  ),
  description: z.preprocess(emptyToNull, z.string().trim().max(2000).nullable()),
});

export const updateTournamentSchema = createTournamentSchema.extend({
  status: z.enum(tournamentStatusValues),
});

export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
export type UpdateTournamentInput = z.infer<typeof updateTournamentSchema>;
