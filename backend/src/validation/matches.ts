import { z } from "zod";

import { GROUP_DECISIONS } from "./group-decisions";
import { opportunitySummarySchema, SIZE_CLASSES } from "./opportunities";

export const READINESS_BANDS = ["ready", "stretch", "not_ready"] as const;

export type ReadinessBand = (typeof READINESS_BANDS)[number];

export const MATCH_STATUSES = [
  "proposed",
  "verified",
  "rejected",
  "presented",
  "accepted",
  "declined",
  "completed",
] as const;

// Invariant 3: every match explains itself in plain language. `explanation`
// is a sentence a social worker can read aloud, not a code or a score dump.
export const matchReasonSchema = z.object({
  signal: z.string().min(1),
  contribution: z.number(),
  explanation: z.string().min(1),
});

// A match is born `proposed` with at least one reason. Overrides are not
// accepted at insert time — they are a later human action on an existing row.
export const matchInsertSchema = z.object({
  groupId: z.string().uuid(),
  opportunityId: z.string().uuid(),
  score: z.number().min(0).max(1),
  reasons: z.array(matchReasonSchema).min(1),
  readinessBand: z.enum(READINESS_BANDS),
  status: z.enum(MATCH_STATUSES).default("proposed"),
});

// readiness_override is separate from readiness_band so the automated band
// survives a social worker's disagreement, and an override must carry a
// reason (invariant 2) — mirrored by a CHECK constraint in the table.
export const matchUpdateSchema = z
  .object({
    score: z.number().min(0).max(1).optional(),
    reasons: z.array(matchReasonSchema).min(1).optional(),
    readinessBand: z.enum(READINESS_BANDS).optional(),
    readinessOverride: z.enum(READINESS_BANDS).nullable().optional(),
    readinessOverrideReason: z.string().min(1).nullable().optional(),
    status: z.enum(MATCH_STATUSES).optional(),
  })
  .refine(
    (update) =>
      update.readinessOverride == null ||
      (update.readinessOverrideReason != null &&
        update.readinessOverrideReason.length > 0),
    {
      message: "a readiness override must record a reason",
      path: ["readinessOverrideReason"],
    },
  );

// API response shape. score is a number in [0, 1]; the service layer casts
// from Postgres numeric.
export const matchResponseSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  opportunityId: z.string().uuid(),
  score: z.number().min(0).max(1),
  reasons: z.array(matchReasonSchema),
  readinessBand: z.enum(READINESS_BANDS),
  readinessOverride: z.enum(READINESS_BANDS).nullable(),
  readinessOverrideReason: z.string().nullable(),
  status: z.enum(MATCH_STATUSES),
  createdAt: z.string().datetime(),
});

export const matchingRunRequestSchema = z.object({
  opportunityId: z.string().uuid(),
});

// An override always carries a reason (invariant 2); passing null clears an
// earlier override, and the reason then explains the clearing. The original
// readiness_band is never touched — band and override are both returned by
// every endpoint that returns a match, so the disagreement stays visible.
export const readinessOverrideRequestSchema = z.object({
  band: z.enum(READINESS_BANDS).nullable(),
  reason: z.string().min(1),
});

// The bookkeeper surface returns each verified match together with the
// opportunity it concerns — the group decides on substance, not on a match id.
export const matchWithOpportunitySchema = matchResponseSchema.extend({
  opportunity: z.object({
    id: z.string().uuid(),
    title: z.string(),
    summary: opportunitySummarySchema.nullable(),
    deadline: z.string().date().nullable(),
    sizeClass: z.enum(SIZE_CLASSES).nullable(),
    isSynthetic: z.boolean(),
  }),
});

// Queue rows carry the names a social worker scans by, and the synthetic
// flag so sample data is badged even in lists (invariant 7).
export const matchQueueItemSchema = matchResponseSchema.extend({
  groupName: z.string(),
  opportunityTitle: z.string(),
  isSynthetic: z.boolean(),
});

// The verification screen's whole payload: the summary with its citations,
// the group's profile and ledger position, readiness with its contributing
// factors (recomputed from current signals), the ranking reasons, and the
// hard-filter eliminations for the same opportunity. Both readiness_band and
// readiness_override are present — the disagreement stays visible.
export const matchDetailSchema = matchResponseSchema.extend({
  group: z.object({
    id: z.string().uuid(),
    name: z.string(),
    village: z.string(),
    district: z.string(),
    state: z.string(),
    consentStatus: z.string(),
    isSynthetic: z.boolean(),
  }),
  opportunity: z.object({
    id: z.string().uuid(),
    title: z.string(),
    summary: opportunitySummarySchema.nullable(),
    deadline: z.string().date().nullable(),
    sizeClass: z.enum(SIZE_CLASSES).nullable(),
    documentRef: z.string().nullable(),
    isSynthetic: z.boolean(),
  }),
  capabilityProfile: z
    .object({
      skills: z.array(z.string()),
      capacity: z.array(
        z.object({
          product: z.string(),
          unitsPerMonth: z.number(),
          minLeadTimeDays: z.number(),
        }),
      ),
      equipment: z.array(z.string()),
      embeddingUpdatedAt: z.string().datetime().nullable(),
    })
    .nullable(),
  ledgerSummary: z.object({
    balance: z.string(),
    entryCount: z.number().int().nonnegative(),
    lastEntryDate: z.string().date().nullable(),
  }),
  readiness: z.object({
    band: z.enum(READINESS_BANDS),
    factors: z.array(z.string()).max(3),
  }),
  eliminations: z.array(
    z.object({
      groupId: z.string().uuid(),
      groupName: z.string(),
      reasonCode: z.string(),
      explanation: z.string(),
    }),
  ),
});

// Full match history for a group, with outcomes — scoped by RLS, so a
// bookkeeper calling it still only ever sees verified-and-later matches.
export const groupMatchHistoryItemSchema = z.object({
  id: z.string().uuid(),
  opportunityTitle: z.string(),
  status: z.enum(MATCH_STATUSES),
  score: z.number(),
  readinessBand: z.enum(READINESS_BANDS),
  readinessOverride: z.enum(READINESS_BANDS).nullable(),
  createdAt: z.string().datetime(),
  groupDecision: z.enum(GROUP_DECISIONS).nullable(),
  // Attribution: who recorded the group's decision, and when. Null when the
  // recorder's profile is outside the caller's read scope.
  decisionRecordedBy: z.string().nullable(),
  decisionRecordedAt: z.string().datetime().nullable(),
  isSynthetic: z.boolean(),
});

export type MatchReason = z.infer<typeof matchReasonSchema>;
export type MatchInsert = z.infer<typeof matchInsertSchema>;
export type MatchUpdate = z.infer<typeof matchUpdateSchema>;
export type MatchResponse = z.infer<typeof matchResponseSchema>;
export type MatchWithOpportunity = z.infer<typeof matchWithOpportunitySchema>;
export type MatchQueueItem = z.infer<typeof matchQueueItemSchema>;
export type MatchDetail = z.infer<typeof matchDetailSchema>;
export type GroupMatchHistoryItem = z.infer<typeof groupMatchHistoryItemSchema>;
export type MatchingRunRequest = z.infer<typeof matchingRunRequestSchema>;
export type ReadinessOverrideRequest = z.infer<
  typeof readinessOverrideRequestSchema
>;
