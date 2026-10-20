import { z } from "zod";

// Deliberately absent, now and forever: address (invariant 5 — village
// granularity lives on the group), government ID numbers and biometrics
// (invariant 6). Do not add them here or in the table.
export const memberInsertSchema = z.object({
  groupId: z.string().uuid(),
  name: z.string().min(1),
  phone: z.string().min(1),
  preferredLanguage: z.string().min(1),
  joinedOn: z.string().date(),
  isSynthetic: z.boolean().default(false),
});

export const memberUpdateSchema = memberInsertSchema.partial();

export type MemberInsert = z.infer<typeof memberInsertSchema>;
export type MemberUpdate = z.infer<typeof memberUpdateSchema>;
