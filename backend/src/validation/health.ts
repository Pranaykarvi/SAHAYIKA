import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  uptimeSeconds: z.number().int().nonnegative(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
