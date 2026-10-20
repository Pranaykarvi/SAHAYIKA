import { z } from "zod";

export const CONSENT_STATUSES = ["active", "suspended", "revoked"] as const;

// Location is captured at village granularity only (invariant 5): village,
// district, state. No GPS coordinates and no addresses, here or in the table.
export const selfHelpGroupInsertSchema = z.object({
  name: z.string().min(1),
  federationId: z.string().uuid(),
  village: z.string().min(1),
  district: z.string().min(1),
  state: z.string().min(1),
  formedOn: z.string().date(),
  bookkeeperMemberId: z.string().uuid().nullable().optional(),
  consentStatus: z.enum(CONSENT_STATUSES).default("active"),
  isSynthetic: z.boolean().default(false),
});

export const selfHelpGroupUpdateSchema = selfHelpGroupInsertSchema.partial();

export const selfHelpGroupResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  federationId: z.string().uuid(),
  village: z.string(),
  district: z.string(),
  state: z.string(),
  formedOn: z.string().date(),
  bookkeeperMemberId: z.string().uuid().nullable(),
  consentStatus: z.enum(CONSENT_STATUSES),
  isSynthetic: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// Consent can only be narrowed over the API: suspend or revoke. Returning a
// group to active is an administrative act, not an endpoint.
export const consentUpdateRequestSchema = z.object({
  consentStatus: z.enum(["suspended", "revoked"]),
  reason: z.string().min(1).optional(),
});

export type SelfHelpGroupInsert = z.infer<typeof selfHelpGroupInsertSchema>;
export type SelfHelpGroupUpdate = z.infer<typeof selfHelpGroupUpdateSchema>;
export type SelfHelpGroupResponse = z.infer<typeof selfHelpGroupResponseSchema>;
export type ConsentUpdateRequest = z.infer<typeof consentUpdateRequestSchema>;
