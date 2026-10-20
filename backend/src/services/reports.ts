import { asc, desc, eq, gte } from "drizzle-orm";

import { runAsUser } from "../db/client";
import {
  matches,
  opportunities,
  selfHelpGroups,
  userProfiles,
  verificationRecords,
} from "../db/schema";
import { env } from "../lib/env";
import type {
  GroupDistribution,
  MatchDistributionReport,
  Overview,
} from "../validation/reports";

// Same definition as the matching service's rotation signal: a match still
// being worked.
const ACTIVE_STATUSES = new Set([
  "proposed",
  "verified",
  "presented",
  "accepted",
]);

// The social worker's landing view: pending verifications, federation size,
// recent verification decisions, and opportunities approaching deadline.
// Everything RLS-scoped to the requester.
export async function getOverview(requestingUserId: string): Promise<Overview> {
  return runAsUser(requestingUserId, async (tx) => {
    const pending = await tx
      .select({ id: matches.id })
      .from(matches)
      .where(eq(matches.status, "proposed"));

    const groups = await tx
      .select({ id: selfHelpGroups.id })
      .from(selfHelpGroups);

    const decisions = await tx
      .select({
        matchId: verificationRecords.matchId,
        decision: verificationRecords.decision,
        decidedAt: verificationRecords.decidedAt,
        groupName: selfHelpGroups.name,
        opportunityTitle: opportunities.title,
        groupSynthetic: selfHelpGroups.isSynthetic,
        opportunitySynthetic: opportunities.isSynthetic,
      })
      .from(verificationRecords)
      .innerJoin(matches, eq(verificationRecords.matchId, matches.id))
      .innerJoin(selfHelpGroups, eq(matches.groupId, selfHelpGroups.id))
      .innerJoin(opportunities, eq(matches.opportunityId, opportunities.id))
      .orderBy(desc(verificationRecords.decidedAt))
      .limit(8);

    const today = new Date().toISOString().slice(0, 10);
    const deadlines = await tx
      .select({
        id: opportunities.id,
        title: opportunities.title,
        deadline: opportunities.deadline,
        sizeClass: opportunities.sizeClass,
        isSynthetic: opportunities.isSynthetic,
      })
      .from(opportunities)
      .where(gte(opportunities.deadline, today))
      .orderBy(asc(opportunities.deadline))
      .limit(8);

    return {
      pendingVerifications: pending.length,
      groupCount: groups.length,
      recentDecisions: decisions.map((d) => ({
        matchId: d.matchId,
        decision: d.decision,
        decidedAt: d.decidedAt.toISOString(),
        groupName: d.groupName,
        opportunityTitle: d.opportunityTitle,
        isSynthetic: d.groupSynthetic || d.opportunitySynthetic,
      })),
      upcomingDeadlines: deadlines
        .filter((d): d is typeof d & { deadline: string } => d.deadline !== null)
        .map((d) => ({
          id: d.id,
          title: d.title,
          deadline: d.deadline,
          sizeClass: d.sizeClass,
          isSynthetic: d.isSynthetic,
        })),
    };
  });
}

// Match distribution over a window for the requester's federation (RLS scopes
// the rows; admins see everything and get federationId: null). Any group
// holding more than the configured share of active matches is flagged — the
// signal that opportunity flow is pooling instead of rotating.
export async function getMatchDistribution(
  requestingUserId: string,
  windowDays: number,
): Promise<MatchDistributionReport> {
  return runAsUser(requestingUserId, async (tx) => {
    const profileRows = await tx
      .select({ federationId: userProfiles.federationId })
      .from(userProfiles)
      .where(eq(userProfiles.supabaseUserId, requestingUserId))
      .limit(1);
    const federationId = profileRows[0]?.federationId ?? null;

    const since = new Date(Date.now() - windowDays * 86_400_000);
    const rows = await tx
      .select({
        groupId: matches.groupId,
        groupName: selfHelpGroups.name,
        groupSynthetic: selfHelpGroups.isSynthetic,
        status: matches.status,
      })
      .from(matches)
      .innerJoin(selfHelpGroups, eq(matches.groupId, selfHelpGroups.id))
      .where(gte(matches.createdAt, since));

    const perGroup = new Map<
      string,
      { groupName: string; isSynthetic: boolean; total: number; active: number }
    >();
    let totalActive = 0;
    for (const row of rows) {
      const bucket = perGroup.get(row.groupId) ?? {
        groupName: row.groupName,
        isSynthetic: row.groupSynthetic,
        total: 0,
        active: 0,
      };
      bucket.total += 1;
      if (ACTIVE_STATUSES.has(row.status)) {
        bucket.active += 1;
        totalActive += 1;
      }
      perGroup.set(row.groupId, bucket);
    }

    const threshold = env.REPORTS_CONCENTRATION_SHARE;
    const byGroup: GroupDistribution[] = [...perGroup.entries()]
      .map(([groupId, bucket]) => {
        const share = totalActive > 0 ? bucket.active / totalActive : 0;
        return {
          groupId,
          groupName: bucket.groupName,
          isSynthetic: bucket.isSynthetic,
          totalMatches: bucket.total,
          activeMatches: bucket.active,
          shareOfActiveMatches: Math.round(share * 1000) / 1000,
          overConcentrated: bucket.active > 0 && share > threshold,
        };
      })
      .sort((a, b) => b.totalMatches - a.totalMatches);

    return {
      federationId,
      windowDays,
      concentrationThreshold: threshold,
      totalMatches: rows.length,
      totalActiveMatches: totalActive,
      byGroup,
    };
  });
}
