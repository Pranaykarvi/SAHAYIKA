import { z } from "zod";

import { embeddingSchema } from "./embedding";

export const OPPORTUNITY_SOURCES = [
  "portal",
  "partner",
  "manual",
  "seed",
] as const;

export const SIZE_CLASSES = ["small", "medium", "large"] as const;

export type SizeClass = (typeof SIZE_CLASSES)[number];

export const CITABLE_SUMMARY_FIELDS = [
  "whatIsBeingBought",
  "quantity",
  "qualitySpec",
  "deadline",
  "eligibility",
  "paymentTerms",
  "penalties",
] as const;

export const sourceCitationSchema = z.object({
  field: z.enum(CITABLE_SUMMARY_FIELDS),
  page: z.number().int().positive(),
  quotedText: z.string().min(1),
});

const summaryFieldsSchema = z.object({
  whatIsBeingBought: z.string().min(1),
  quantity: z.object({
    amount: z.number().positive(),
    unit: z.string().min(1),
  }),
  qualitySpec: z.string().min(1).nullable(),
  deadline: z.string().date(),
  eligibility: z.array(z.string().min(1)),
  paymentTerms: z.string().min(1),
  penalties: z.string().min(1).nullable(),
  sourceCitations: z.array(sourceCitationSchema).min(1),
});

// Every non-null field must carry a citation naming the page and the exact
// quoted text it came from. This is strict on purpose, and the reason is
// concrete: a summariser that drops a penalty clause or invents a lenient
// deadline creates real contractual exposure for a group with no legal
// support. A summary with an uncited field is rejected outright — the
// opportunity is then written with needs_manual_entry = true and NO summary,
// never with a partial one. (Nullable fields may be null uncited — null is
// "the document does not state this", which has no source to quote. An empty
// eligibility list is treated the same way.)
export const opportunitySummarySchema = summaryFieldsSchema.superRefine(
  (summary, ctx) => {
    const cited = new Set(summary.sourceCitations.map((c) => c.field));
    for (const field of CITABLE_SUMMARY_FIELDS) {
      const value = summary[field];
      const absent =
        value === null || (Array.isArray(value) && value.length === 0);
      if (!absent && !cited.has(field)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sourceCitations"],
          message: `field "${field}" has no source citation`,
        });
      }
    }
  },
);

// Mirrors the table: summary, deadline, and sizeClass are nullable because a
// needs_manual_entry row exists before a human completes it.
export const opportunityInsertSchema = z.object({
  source: z.enum(OPPORTUNITY_SOURCES),
  title: z.string().min(1),
  summary: opportunitySummarySchema.nullable(),
  documentRef: z.string().nullable().optional(),
  deadline: z.string().date().nullable(),
  sizeClass: z.enum(SIZE_CLASSES).nullable(),
  embedding: embeddingSchema.nullable().optional(),
  needsManualEntry: z.boolean().default(false),
  isSynthetic: z.boolean().default(false),
});

export const opportunityUpdateSchema = opportunityInsertSchema.partial();

// API response shape. The embedding is deliberately absent: raw vectors never
// cross the API boundary. summary/deadline/sizeClass are null on rows that
// await manual entry.
export const opportunityResponseSchema = z.object({
  id: z.string().uuid(),
  source: z.enum(OPPORTUNITY_SOURCES),
  title: z.string(),
  summary: opportunitySummarySchema.nullable(),
  documentRef: z.string().nullable(),
  deadline: z.string().date().nullable(),
  sizeClass: z.enum(SIZE_CLASSES).nullable(),
  needsManualEntry: z.boolean(),
  isSynthetic: z.boolean(),
  createdAt: z.string().datetime(),
});

// Raw document text plus whatever metadata the source carries; the AI
// ingestion pipeline (stage 5) extracts the rest or flags needs_manual_entry.
export const opportunityIngestRequestSchema = z.object({
  documentText: z.string().min(1),
  metadata: z
    .object({
      title: z.string().min(1).optional(),
      source: z.enum(["portal", "partner"]).optional(),
      deadline: z.string().date().optional(),
      documentRef: z.string().optional(),
    })
    .optional(),
});

// Manual entry: a social worker supplies the full summary themselves — the
// same cited shape the AI path must produce; the citation rule applies to
// humans too. The row's deadline is derived from summary.deadline, so there
// is exactly one source of truth for it.
export const opportunityCreateRequestSchema = z.object({
  source: z.enum(OPPORTUNITY_SOURCES).default("manual"),
  title: z.string().min(1),
  summary: opportunitySummarySchema,
  documentRef: z.string().nullable().optional(),
  sizeClass: z.enum(SIZE_CLASSES),
});

export const opportunityListQuerySchema = z.object({
  deadlineBefore: z.string().date().optional(),
  deadlineAfter: z.string().date().optional(),
});

export type OpportunitySummary = z.infer<typeof opportunitySummarySchema>;
export type SourceCitation = z.infer<typeof sourceCitationSchema>;
export type OpportunityInsert = z.infer<typeof opportunityInsertSchema>;
export type OpportunityUpdate = z.infer<typeof opportunityUpdateSchema>;
export type OpportunityResponse = z.infer<typeof opportunityResponseSchema>;
export type OpportunityIngestRequest = z.infer<
  typeof opportunityIngestRequestSchema
>;
export type OpportunityCreateRequest = z.infer<
  typeof opportunityCreateRequestSchema
>;
export type OpportunityListQuery = z.infer<typeof opportunityListQuerySchema>;
