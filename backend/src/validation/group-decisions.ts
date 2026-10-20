import { z } from "zod";

export const GROUP_DECISIONS = ["accepted", "declined"] as const;

// The group's own decision on a presented match — recorded, never inferred.
export const groupDecisionInsertSchema = z.object({
  matchId: z.string().uuid(),
  decision: z.enum(GROUP_DECISIONS),
  recordedBy: z.string().uuid(),
  recordedAt: z.string().datetime().optional(),
  note: z.string().nullable().optional(),
});

export const groupDecisionUpdateSchema = groupDecisionInsertSchema
  .pick({ decision: true, note: true })
  .partial();

// POST /matches/:id/decision body — matchId from the path, recordedBy from
// the token.
export const groupDecisionRequestSchema = z.object({
  decision: z.enum(GROUP_DECISIONS),
  note: z.string().nullable().optional(),
});

export const groupDecisionResponseSchema = z.object({
  id: z.string().uuid(),
  matchId: z.string().uuid(),
  decision: z.enum(GROUP_DECISIONS),
  recordedBy: z.string().uuid(),
  recordedAt: z.string().datetime(),
  note: z.string().nullable(),
  // Always false, and in the contract on purpose: accepting records the
  // group's own decision only — it creates no commitment to any external
  // party, and the UI uses this field to say exactly that.
  createsExternalCommitment: z.literal(false),
});

export type GroupDecisionInsert = z.infer<typeof groupDecisionInsertSchema>;
export type GroupDecisionUpdate = z.infer<typeof groupDecisionUpdateSchema>;
export type GroupDecisionRequest = z.infer<typeof groupDecisionRequestSchema>;
export type GroupDecisionResponse = z.infer<typeof groupDecisionResponseSchema>;
