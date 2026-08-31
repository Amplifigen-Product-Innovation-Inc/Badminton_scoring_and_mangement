import { z } from "zod";

/**
 * §19/§20 match creation. Player counts are enforced against match_type
 * here (singles = 1/team, doubles = 2/team) — the DB has no CHECK for
 * this (match_participants is a plain junction table), so it's on the
 * application to keep team composition honest.
 */
export const matchTypeValues = ["SINGLES", "DOUBLES"] as const;
export const bestOfValues = [1, 3] as const;

const emptyToNull = (v: unknown) => (v === "" || v == null ? null : v);

export const createMatchSchema = z
  .object({
    stageId: z.string().uuid(),
    groupId: z.preprocess(emptyToNull, z.string().uuid().nullable()),
    // §17/§45 cross-category matches: team1 and team2 are qualified pairs
    // drawn from TWO DIFFERENT groups, so a single match-level `groupId`
    // (shared by both teams) can't represent that. These are optional and
    // backward compatible — when omitted, each team's source_group_id
    // falls back to `groupId` exactly as before (the group-stage case,
    // where both teams genuinely do share one group).
    team1SourceGroupId: z.preprocess(emptyToNull, z.string().uuid().nullable()).optional(),
    team2SourceGroupId: z.preprocess(emptyToNull, z.string().uuid().nullable()).optional(),
    matchType: z.enum(matchTypeValues),
    bestOf: z.coerce
      .number()
      .int()
      .refine((v) => (bestOfValues as readonly number[]).includes(v), "best_of must be 1 or 3"),
    courtId: z.preprocess(emptyToNull, z.string().uuid().nullable()),
    scorerId: z.preprocess(emptyToNull, z.string().uuid().nullable()),
    team1PlayerIds: z.array(z.string().uuid()).min(1),
    team2PlayerIds: z.array(z.string().uuid()).min(1),
  })
  .superRefine((data, ctx) => {
    const expected = data.matchType === "SINGLES" ? 1 : 2;
    if (data.team1PlayerIds.length !== expected) {
      ctx.addIssue({
        code: "custom",
        path: ["team1PlayerIds"],
        message: `${data.matchType} needs exactly ${expected} player(s) per team`,
      });
    }
    if (data.team2PlayerIds.length !== expected) {
      ctx.addIssue({
        code: "custom",
        path: ["team2PlayerIds"],
        message: `${data.matchType} needs exactly ${expected} player(s) per team`,
      });
    }
    const overlap = data.team1PlayerIds.filter((id) => data.team2PlayerIds.includes(id));
    if (overlap.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["team2PlayerIds"],
        message: "A player can't be on both teams",
      });
    }
  });

export type CreateMatchInput = z.infer<typeof createMatchSchema>;
