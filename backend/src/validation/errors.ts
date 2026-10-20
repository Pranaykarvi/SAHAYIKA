import { z } from "zod";

// The one error shape every endpoint returns, in every failure case. The
// central error handler produces it; nothing else writes error bodies.
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
