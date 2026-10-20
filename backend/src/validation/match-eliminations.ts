import { z } from "zod";

// Reason codes mirror src/lib/matching/filter.ts — the dashboard shows a
// social worker what the hard filters removed and why.
export const ELIMINATION_REASON_CODES = [
  "no_capacity_for_product",
  "capacity_below_quantity",
  "distance_exceeds_radius",
  "deadline_inside_lead_time",
] as const;

export const matchEliminationInsertSchema = z.object({
  opportunityId: z.string().uuid(),
  groupId: z.string().uuid(),
  reasonCode: z.enum(ELIMINATION_REASON_CODES),
  explanation: z.string().min(1),
});

export const matchEliminationResponseSchema = z.object({
  id: z.string().uuid(),
  opportunityId: z.string().uuid(),
  groupId: z.string().uuid(),
  reasonCode: z.enum(ELIMINATION_REASON_CODES),
  explanation: z.string(),
  createdAt: z.string().datetime(),
});

export type MatchEliminationInsert = z.infer<
  typeof matchEliminationInsertSchema
>;
export type MatchEliminationResponse = z.infer<
  typeof matchEliminationResponseSchema
>;
