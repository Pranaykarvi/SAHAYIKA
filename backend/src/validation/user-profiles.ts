import { z } from "zod";

export const USER_ROLES = ["social_worker", "bookkeeper", "admin"] as const;

export type UserRole = (typeof USER_ROLES)[number];

// The role decides which scope field is set: a social worker belongs to a
// federation, a bookkeeper to a group, an admin to neither. Mirrored by a
// CHECK constraint in the table.
function roleShapeIsValid(profile: {
  role: UserRole;
  federationId?: string | null;
  groupId?: string | null;
}): boolean {
  switch (profile.role) {
    case "social_worker":
      return profile.federationId != null && profile.groupId == null;
    case "bookkeeper":
      return profile.groupId != null && profile.federationId == null;
    case "admin":
      return profile.federationId == null && profile.groupId == null;
  }
}

const userProfileBaseSchema = z.object({
  supabaseUserId: z.string().uuid(),
  role: z.enum(USER_ROLES),
  federationId: z.string().uuid().nullable().optional(),
  groupId: z.string().uuid().nullable().optional(),
  displayName: z.string().min(1),
});

// There is no sign-up flow: an administrator creates these rows, because
// members do not self-register in this model.
export const userProfileInsertSchema = userProfileBaseSchema.refine(
  roleShapeIsValid,
  {
    message:
      "social_worker requires federationId only, bookkeeper requires groupId only, admin requires neither",
  },
);

// A role change must arrive together with the scope fields that make the new
// role's shape valid.
export const userProfileUpdateSchema = userProfileBaseSchema
  .omit({ supabaseUserId: true })
  .partial()
  .refine(
    (update) =>
      update.role === undefined ||
      roleShapeIsValid({
        role: update.role,
        federationId: update.federationId ?? null,
        groupId: update.groupId ?? null,
      }),
    {
      message:
        "changing role requires the matching scope field (federationId or groupId)",
    },
  );

// GET /me — the authenticated caller's own profile, used by the frontend to
// route by role (the backend still enforces roles independently).
export const meResponseSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(USER_ROLES),
  federationId: z.string().uuid().nullable(),
  groupId: z.string().uuid().nullable(),
  // True when any synthetic record is visible to this account — the frontend
  // shows a persistent demonstration-build banner while this is true
  // (invariant 7: nothing fabricated may look real).
  syntheticDataPresent: z.boolean(),
});

export type UserProfileInsert = z.infer<typeof userProfileInsertSchema>;
export type UserProfileUpdate = z.infer<typeof userProfileUpdateSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
