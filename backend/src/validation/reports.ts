import { z } from "zod";

export const distributionQuerySchema = z.object({
  // Window over which matches are counted, in days back from now.
  windowDays: z.coerce.number().int().min(1).max(730).default(90),
});

export const groupDistributionSchema = z.object({
  groupId: z.string().uuid(),
  groupName: z.string(),
  isSynthetic: z.boolean(),
  totalMatches: z.number().int().nonnegative(),
  activeMatches: z.number().int().nonnegative(),
  // This group's share of all active matches in the federation (0..1).
  shareOfActiveMatches: z.number().min(0).max(1),
  // True when the share exceeds the configured concentration threshold —
  // the signal that opportunity flow is pooling on one group.
  overConcentrated: z.boolean(),
});

// Match distribution across the requesting social worker's federation.
// federationId is null for admins, who are not federation-scoped.
export const matchDistributionReportSchema = z.object({
  federationId: z.string().uuid().nullable(),
  windowDays: z.number().int(),
  concentrationThreshold: z.number().min(0).max(1),
  totalMatches: z.number().int().nonnegative(),
  totalActiveMatches: z.number().int().nonnegative(),
  byGroup: z.array(groupDistributionSchema),
});

// The social worker's landing view, in one call.
export const overviewSchema = z.object({
  pendingVerifications: z.number().int().nonnegative(),
  groupCount: z.number().int().nonnegative(),
  recentDecisions: z.array(
    z.object({
      matchId: z.string().uuid(),
      decision: z.enum(["approved", "rejected", "needs_information"]),
      decidedAt: z.string().datetime(),
      groupName: z.string(),
      opportunityTitle: z.string(),
      isSynthetic: z.boolean(),
    }),
  ),
  upcomingDeadlines: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      deadline: z.string().date(),
      sizeClass: z.string().nullable(),
      isSynthetic: z.boolean(),
    }),
  ),
});

export type Overview = z.infer<typeof overviewSchema>;
export type DistributionQuery = z.infer<typeof distributionQuerySchema>;
export type GroupDistribution = z.infer<typeof groupDistributionSchema>;
export type MatchDistributionReport = z.infer<
  typeof matchDistributionReportSchema
>;
