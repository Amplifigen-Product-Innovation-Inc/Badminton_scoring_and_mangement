import { z } from "zod";

/** §12/§48 group within a stage. `category` is free text (e.g. a skill
 * bracket label) — no enum in the schema. */
export const createGroupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  category: z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.string().trim().max(100).nullable()
  ),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
