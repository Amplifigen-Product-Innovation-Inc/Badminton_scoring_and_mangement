import { z } from "zod";

/**
 * §11 Tournament Structure — a tournament is a flexible ordered sequence of
 * stages, not a hard-coded format. stage_order is admin-managed via
 * up/down moves (see moveStage in stage-actions.ts), not typed directly.
 */
export const stageTypeValues = ["GROUP", "CROSS_CATEGORY", "FINAL"] as const;
export const stageStatusValues = ["PENDING", "ACTIVE", "COMPLETED"] as const;

export const createStageSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  stage_type: z.enum(stageTypeValues),
});

export const updateStageSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  stage_type: z.enum(stageTypeValues),
  status: z.enum(stageStatusValues),
});

export type CreateStageInput = z.infer<typeof createStageSchema>;
export type UpdateStageInput = z.infer<typeof updateStageSchema>;
