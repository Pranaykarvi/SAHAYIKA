import { and, desc, eq } from "drizzle-orm";

import {
  isUniqueViolation,
  isVerificationGuardViolation,
  runAsUser,
  type DbTx,
} from "../db/client";
import {
  capabilityProfiles,
  groupDecisions,
  matchEliminations,
  matches,
  opportunities,
  selfHelpGroups,
  userProfiles,
  verificationRecords,
} from "../db/schema";
import { ApiError, NotFoundError } from "../lib/errors";
import { logger } from "../lib/logger";
import { assessReadiness } from "../lib/matching/readiness";
import type {
  GroupDecisionRequest,
  GroupDecisionResponse,
} from "../validation/group-decisions";
import type {
  GroupMatchHistoryItem,
  MatchDetail,
  MatchQueueItem,
  MatchResponse,
  MatchWithOpportunity,
  ReadinessOverrideRequest,
} from "../validation/matches";
import { summarizeLedger } from "./ledger";
import { gatherReadinessSignals, monthsSince } from "./matching";
import type {
  VerificationRecordResponse,
  VerifyMatchRequest,
} from "../validation/verification-records";

type MatchRow = typeof matches.$inferSelect;

function toMatchResponse(row: MatchRow): MatchResponse {
  return {
    id: row.id,
    groupId: row.groupId,
    opportunityId: row.opportunityId,
    score: Number(row.score),
    reasons: row.reasons,
    readinessBand: row.readinessBand,
    readinessOverride: row.readinessOverride,
    readinessOverrideReason: row.readinessOverrideReason,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadMatch(tx: DbTx, matchId: string): Promise<MatchRow> {
  const rows = await tx
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError("match not found");
  return row;
}

// The bookkeeper surface. The status filter is a literal in this query — not
// a parameter, not a controller default, not a query-string option — so there
// is no code path through which a caller can widen it to unverified matches
// (invariant 1). RLS enforces the same floor underneath. Each match carries
// its reasons and the opportunity summary: the group decides on substance.
export async function listVerifiedMatchesForGroup(
  requestingUserId: string,
  groupId: string,
): Promise<MatchWithOpportunity[]> {
  const rows = await runAsUser(requestingUserId, (tx) =>
    tx
      .select({
        match: matches,
        opportunity: {
          id: opportunities.id,
          title: opportunities.title,
          summary: opportunities.summary,
          deadline: opportunities.deadline,
          sizeClass: opportunities.sizeClass,
          isSynthetic: opportunities.isSynthetic,
        },
      })
      .from(matches)
      .innerJoin(opportunities, eq(matches.opportunityId, opportunities.id))
      .where(and(eq(matches.groupId, groupId), eq(matches.status, "verified")))
      .orderBy(desc(matches.createdAt)),
  );
  return rows.map((row) => ({
    ...toMatchResponse(row.match),
    opportunity: row.opportunity,
  }));
}

// Proposed matches awaiting verification, newest first. RLS scopes the rows
// to the requester's federation.
export async function listMatchQueue(
  requestingUserId: string,
): Promise<MatchQueueItem[]> {
  const rows = await runAsUser(requestingUserId, (tx) =>
    tx
      .select({
        match: matches,
        groupName: selfHelpGroups.name,
        groupSynthetic: selfHelpGroups.isSynthetic,
        opportunityTitle: opportunities.title,
        opportunitySynthetic: opportunities.isSynthetic,
      })
      .from(matches)
      .innerJoin(selfHelpGroups, eq(matches.groupId, selfHelpGroups.id))
      .innerJoin(opportunities, eq(matches.opportunityId, opportunities.id))
      .where(eq(matches.status, "proposed"))
      .orderBy(desc(matches.createdAt)),
  );
  return rows.map((row) => ({
    ...toMatchResponse(row.match),
    groupName: row.groupName,
    opportunityTitle: row.opportunityTitle,
    isSynthetic: row.groupSynthetic || row.opportunitySynthetic,
  }));
}

// Everything the verification screen needs, assembled server-side: summary
// with citations, group profile and ledger position, readiness recomputed
// from current signals (same functions the pipeline used), the ranking
// reasons, and the hard-filter eliminations for this opportunity.
export async function getMatch(
  requestingUserId: string,
  matchId: string,
): Promise<MatchDetail> {
  const now = new Date();
  return runAsUser(requestingUserId, async (tx) => {
    const match = await loadMatch(tx, matchId);

    const groupRows = await tx
      .select()
      .from(selfHelpGroups)
      .where(eq(selfHelpGroups.id, match.groupId))
      .limit(1);
    const group = groupRows[0];
    if (!group) throw new NotFoundError("group not found");

    const opportunityRows = await tx
      .select()
      .from(opportunities)
      .where(eq(opportunities.id, match.opportunityId))
      .limit(1);
    const opportunity = opportunityRows[0];
    if (!opportunity) throw new NotFoundError("opportunity not found");

    const profileRows = await tx
      .select()
      .from(capabilityProfiles)
      .where(eq(capabilityProfiles.groupId, match.groupId))
      .limit(1);
    const profile = profileRows[0] ?? null;

    const ledgerSummary = await summarizeLedger(tx, match.groupId);

    const signals = await gatherReadinessSignals(tx, [match.groupId], now);
    const baseSignals = signals.get(match.groupId);
    const readiness = assessReadiness(
      {
        thriftRegularity: baseSignals?.thriftRegularity ?? 0,
        loanRepaymentRate: baseSignals?.loanRepaymentRate ?? null,
        completedDeliveries: baseSignals?.completedDeliveries ?? 0,
        tenureMonths: monthsSince(group.formedOn, now),
      },
      opportunity.sizeClass,
    );

    const eliminationRows = await tx
      .select({
        groupId: matchEliminations.groupId,
        groupName: selfHelpGroups.name,
        reasonCode: matchEliminations.reasonCode,
        explanation: matchEliminations.explanation,
        createdAt: matchEliminations.createdAt,
      })
      .from(matchEliminations)
      .innerJoin(
        selfHelpGroups,
        eq(matchEliminations.groupId, selfHelpGroups.id),
      )
      .where(eq(matchEliminations.opportunityId, match.opportunityId))
      .orderBy(desc(matchEliminations.createdAt));
    // One entry per group — re-runs may have recorded the same elimination.
    const seen = new Set<string>();
    const eliminations = eliminationRows
      .filter((row) =>
        seen.has(row.groupId) ? false : (seen.add(row.groupId), true),
      )
      .map(({ groupId, groupName, reasonCode, explanation }) => ({
        groupId,
        groupName,
        reasonCode,
        explanation,
      }));

    return {
      ...toMatchResponse(match),
      group: {
        id: group.id,
        name: group.name,
        village: group.village,
        district: group.district,
        state: group.state,
        consentStatus: group.consentStatus,
        isSynthetic: group.isSynthetic,
      },
      opportunity: {
        id: opportunity.id,
        title: opportunity.title,
        summary: opportunity.summary,
        deadline: opportunity.deadline,
        sizeClass: opportunity.sizeClass,
        documentRef: opportunity.documentRef,
        isSynthetic: opportunity.isSynthetic,
      },
      capabilityProfile: profile
        ? {
            skills: profile.skills,
            capacity: profile.capacity,
            equipment: profile.equipment,
            embeddingUpdatedAt:
              profile.embeddingUpdatedAt?.toISOString() ?? null,
          }
        : null,
      ledgerSummary,
      readiness,
      eliminations,
    };
  });
}

// Full match history for a group, with outcomes. No status pin here, and
// that is safe BECAUSE of RLS: a social worker sees their federation's
// matches in every status, while a bookkeeper calling the same endpoint is
// still limited to verified-and-later rows by the read policy.
export async function listGroupMatchHistory(
  requestingUserId: string,
  groupId: string,
): Promise<GroupMatchHistoryItem[]> {
  const rows = await runAsUser(requestingUserId, (tx) =>
    tx
      .select({
        match: matches,
        opportunityTitle: opportunities.title,
        opportunitySynthetic: opportunities.isSynthetic,
        decision: groupDecisions.decision,
        decidedAt: groupDecisions.recordedAt,
        // Attribution: the recorder's display name. RLS decides visibility —
        // a social worker can read their federation's bookkeeper profiles
        // (policy in migration 0008); outside that scope this is null.
        recordedByName: userProfiles.displayName,
      })
      .from(matches)
      .innerJoin(opportunities, eq(matches.opportunityId, opportunities.id))
      .leftJoin(groupDecisions, eq(groupDecisions.matchId, matches.id))
      .leftJoin(
        userProfiles,
        eq(userProfiles.supabaseUserId, groupDecisions.recordedBy),
      )
      .where(eq(matches.groupId, groupId))
      .orderBy(desc(matches.createdAt)),
  );
  return rows.map((row) => ({
    id: row.match.id,
    opportunityTitle: row.opportunityTitle,
    status: row.match.status,
    score: Number(row.match.score),
    readinessBand: row.match.readinessBand,
    readinessOverride: row.match.readinessOverride,
    createdAt: row.match.createdAt.toISOString(),
    groupDecision: row.decision ?? null,
    decisionRecordedBy: row.recordedByName ?? null,
    decisionRecordedAt: row.decidedAt?.toISOString() ?? null,
    isSynthetic: row.opportunitySynthetic,
  }));
}

export async function verifyMatch(
  requestingUserId: string,
  matchId: string,
  input: VerifyMatchRequest,
): Promise<VerificationRecordResponse> {
  return runAsUser(requestingUserId, async (tx) => {
    await loadMatch(tx, matchId);

    let record;
    try {
      const inserted = await tx
        .insert(verificationRecords)
        .values({
          matchId,
          socialWorkerId: requestingUserId,
          decision: input.decision,
          rationale: input.rationale,
        })
        .returning();
      record = inserted[0];
    } catch (err) {
      // One verification per match — the unique constraint is the enforcer.
      if (isUniqueViolation(err)) {
        throw new ApiError(
          409,
          "ALREADY_VERIFIED",
          "this match already has a verification record",
        );
      }
      throw err;
    }
    if (!record) throw new Error("verification insert returned no row");

    // approved -> verified, rejected -> rejected. needs_information leaves
    // the match 'proposed'; the verification record itself is the flag the
    // queue surfaces — the status machine does not move.
    if (input.decision === "approved") {
      await tx
        .update(matches)
        .set({ status: "verified" })
        .where(eq(matches.id, matchId));
    } else if (input.decision === "rejected") {
      await tx
        .update(matches)
        .set({ status: "rejected" })
        .where(eq(matches.id, matchId));
    }

    // Audit trail — every verification decision, structured.
    logger.info(
      {
        audit: "verification_decision",
        actor: requestingUserId,
        matchId,
        decision: input.decision,
        rationale: input.rationale,
      },
      "verification decision recorded",
    );

    return {
      id: record.id,
      matchId: record.matchId,
      socialWorkerId: record.socialWorkerId,
      decision: record.decision,
      rationale: record.rationale,
      decidedAt: record.decidedAt.toISOString(),
    };
  });
}

export async function overrideReadiness(
  requestingUserId: string,
  matchId: string,
  input: ReadinessOverrideRequest,
): Promise<MatchResponse> {
  return runAsUser(requestingUserId, async (tx) => {
    // readiness_band is deliberately untouched: the automated band and the
    // human override live side by side, and every match response returns
    // both, so the disagreement stays visible instead of being silently
    // resolved.
    const rows = await tx
      .update(matches)
      .set({
        readinessOverride: input.band,
        readinessOverrideReason: input.reason,
      })
      .where(eq(matches.id, matchId))
      .returning();
    const row = rows[0];
    if (!row) throw new NotFoundError("match not found");

    logger.info(
      {
        audit: "readiness_override",
        actor: requestingUserId,
        matchId,
        band: input.band,
        reason: input.reason,
      },
      "readiness override recorded",
    );

    return toMatchResponse(row);
  });
}

export async function recordGroupDecision(
  requestingUserId: string,
  matchId: string,
  input: GroupDecisionRequest,
): Promise<GroupDecisionResponse> {
  return runAsUser(requestingUserId, async (tx) => {
    await loadMatch(tx, matchId);

    // Move to 'presented' FIRST, deliberately: this exercises the stage-1
    // database guard. If no approved verification exists, the update fails
    // at the database — exactly the behaviour we want; the API merely
    // translates the refusal.
    try {
      await tx
        .update(matches)
        .set({ status: "presented" })
        .where(eq(matches.id, matchId));
    } catch (err) {
      if (isVerificationGuardViolation(err)) {
        throw new ApiError(
          409,
          "VERIFICATION_REQUIRED",
          "this match has no approved verification and cannot be presented or decided",
        );
      }
      throw err;
    }

    let decisionRow;
    try {
      const inserted = await tx
        .insert(groupDecisions)
        .values({
          matchId,
          decision: input.decision,
          recordedBy: requestingUserId,
          note: input.note ?? null,
        })
        .returning();
      decisionRow = inserted[0];
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ApiError(
          409,
          "ALREADY_DECIDED",
          "the group has already decided on this match",
        );
      }
      throw err;
    }
    if (!decisionRow) throw new Error("group decision insert returned no row");

    await tx
      .update(matches)
      .set({ status: input.decision === "accepted" ? "accepted" : "declined" })
      .where(eq(matches.id, matchId));

    // Audit trail — every group decision, structured.
    logger.info(
      {
        audit: "group_decision",
        actor: requestingUserId,
        matchId,
        decision: input.decision,
        note: input.note ?? null,
      },
      "group decision recorded",
    );

    return {
      id: decisionRow.id,
      matchId: decisionRow.matchId,
      decision: decisionRow.decision,
      recordedBy: decisionRow.recordedBy,
      recordedAt: decisionRow.recordedAt.toISOString(),
      note: decisionRow.note,
      // Accepting records the group's own decision only — no commitment to
      // any external party is created by this call.
      createsExternalCommitment: false,
    };
  });
}
