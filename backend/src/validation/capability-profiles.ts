import { z } from "zod";

import { embeddingSchema } from "./embedding";

export const capacityItemSchema = z.object({
  product: z.string().min(1),
  unitsPerMonth: z.number().positive(),
  minLeadTimeDays: z.number().int().nonnegative(),
});

// Provisional certification shape — refine when the capture flow is built,
// but it must stay free of individual identifiers: certifications belong to
// the group profile (invariant 4).
export const certificationSchema = z.object({
  name: z.string().min(1),
  issuedBy: z.string().min(1).optional(),
  year: z.number().int().optional(),
});

// One profile per group, enforced UNIQUE in the table: capability is
// group-level, never individual-level (invariant 4).
export const capabilityProfileInsertSchema = z.object({
  groupId: z.string().uuid(),
  skills: z.array(z.string().min(1)),
  certifications: z.array(certificationSchema),
  capacity: z.array(capacityItemSchema),
  equipment: z.array(z.string().min(1)),
  embedding: embeddingSchema.nullable().optional(),
  embeddingUpdatedAt: z.string().datetime().nullable().optional(),
  isSynthetic: z.boolean().default(false),
});

export const capabilityProfileUpdateSchema =
  capabilityProfileInsertSchema.partial();

// API response shape — embedding excluded; only its freshness is visible.
export const capabilityProfileResponseSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  skills: z.array(z.string()),
  certifications: z.array(certificationSchema),
  capacity: z.array(capacityItemSchema),
  equipment: z.array(z.string()),
  embeddingUpdatedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
  isSynthetic: z.boolean(),
});

// PUT body: the group id comes from the path, embedding fields from the
// pipeline, the synthetic flag from seeding — none are caller-writable.
export const capabilityProfileUpsertRequestSchema =
  capabilityProfileInsertSchema.omit({
    groupId: true,
    embedding: true,
    embeddingUpdatedAt: true,
    isSynthetic: true,
  });

export type CapacityItem = z.infer<typeof capacityItemSchema>;
export type Certification = z.infer<typeof certificationSchema>;
export type CapabilityProfileInsert = z.infer<
  typeof capabilityProfileInsertSchema
>;
export type CapabilityProfileUpdate = z.infer<
  typeof capabilityProfileUpdateSchema
>;
export type CapabilityProfileResponse = z.infer<
  typeof capabilityProfileResponseSchema
>;
export type CapabilityProfileUpsertRequest = z.infer<
  typeof capabilityProfileUpsertRequestSchema
>;
