import { z } from "zod";

export const VERIFICATION_DECISIONS = [
  "approved",
  "rejected",
  "needs_information",
] as const;

// A decision without a reason is not a decision: rationale is required and
// must be substantive (>= 10 characters), mirrored by a CHECK in the table.
export const verificationRecordInsertSchema = z.object({
  matchId: z.string().uuid(),
  socialWorkerId: z.string().uuid(),
  decision: z.enum(VERIFICATION_DECISIONS),
  rationale: z.string().min(10),
  decidedAt: z.string().datetime().optional(),
});

export const verificationRecordUpdateSchema = verificationRecordInsertSchema
  .pick({ decision: true, rationale: true })
  .partial();

// POST /matches/:id/verify body — matchId comes from the path and the social
// worker's identity from the token, never from the body.
export const verifyMatchRequestSchema = z.object({
  decision: z.enum(VERIFICATION_DECISIONS),
  rationale: z.string().min(10),
});

export const verificationRecordResponseSchema = z.object({
  id: z.string().uuid(),
  matchId: z.string().uuid(),
  socialWorkerId: z.string().uuid(),
  decision: z.enum(VERIFICATION_DECISIONS),
  rationale: z.string(),
  decidedAt: z.string().datetime(),
});

export type VerificationRecordInsert = z.infer<
  typeof verificationRecordInsertSchema
>;
export type VerificationRecordUpdate = z.infer<
  typeof verificationRecordUpdateSchema
>;
export type VerifyMatchRequest = z.infer<typeof verifyMatchRequestSchema>;
export type VerificationRecordResponse = z.infer<
  typeof verificationRecordResponseSchema
>;
