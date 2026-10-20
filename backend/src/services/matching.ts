import { and, eq, inArray } from "drizzle-orm";

import { runAsUser, type DbTx } from "../db/client";
import {
  ledgerEntries,
  matchEliminations,
  matches,
  opportunities,
} from "../db/schema";
import { embed } from "../lib/ai";
import { ApiError, NotFoundError } from "../lib/errors";
import {
  applyHardFilters,
  DEFAULT_FILTER_CONFIG,
} from "../lib/matching/filter";
import { rankSurvivors, type RankInput } from "../lib/matching/rank";
import {
  assessReadiness,
  type ReadinessSignals,
} from "../lib/matching/readiness";
import { retrieveCandidatesBySimilarity } from "../lib/matching/retrieve";
import { renderForEmbedding } from "../lib/opportunities/renderForEmbedding";
import type { MatchResponse } from "../validation/matches";

// A match still being worked (for rotation): anything not yet resolved by
// rejection, the group declining, or completion.
const ACTIVE_MATCH_STATUSES = [
  "proposed",
  "verified",
  "presented",
  "accepted",
] as const;

const SIX_MONTHS_MS = 183 * 86_400_000;

interface GroupSignalRows {
  thriftMonths: Set<string>;
  lent: number;
  repaid: number;
}

// Readiness signals are computed from raw ledger rows in TS rather than SQL
// aggregates: the volumes are small, the rules stay in one readable place,
// and no SQL leaks outside the one allowed pgvector query. Exported so the
// verification screen recomputes the same factors the pipeline used.
export async function gatherReadinessSignals(
  tx: DbTx,
  groupIds: string[],
  now: Date,
): Promise<Map<string, ReadinessSignals>> {
  const since = new Date(now.getTime() - SIX_MONTHS_MS)
    .toISOString()
    .slice(0, 10);

  const ledgerRows = await tx
    .select({
      groupId: ledgerEntries.groupId,
      kind: ledgerEntries.kind,
      amount: ledgerEntries.amount,
      entryDate: ledgerEntries.entryDate,
    })
    .from(ledgerEntries)
    .where(inArray(ledgerEntries.groupId, groupIds));

  const perGroup = new Map<string, GroupSignalRows>();
  for (const id of groupIds) {
    perGroup.set(id, { thriftMonths: new Set(), lent: 0, repaid: 0 });
  }
  for (const row of ledgerRows) {
    const bucket = perGroup.get(row.groupId);
    if (!bucket) continue;
    // Repayment discipline reads the whole ledger; thrift regularity only
    // the last six months.
    if (row.kind === "internal_loan") bucket.lent += Number(row.amount);
    if (row.kind === "repayment") bucket.repaid += Number(row.amount);
    if (row.kind === "thrift" && row.entryDate >= since) {
      bucket.thriftMonths.add(row.entryDate.slice(0, 7));
    }
  }

  const completedRows = await tx
    .select({ groupId: matches.groupId })
    .from(matches)
    .where(
      and(inArray(matches.groupId, groupIds), eq(matches.status, "completed")),
    );
  const completedCount = new Map<string, number>();
  for (const row of completedRows) {
    completedCount.set(row.groupId, (completedCount.get(row.groupId) ?? 0) + 1);
  }

  const signals = new Map<string, ReadinessSignals>();
  for (const [groupId, bucket] of perGroup) {
    signals.set(groupId, {
      thriftRegularity: Math.min(1, bucket.thriftMonths.size / 6),
      loanRepaymentRate:
        bucket.lent > 0 ? Math.min(1, bucket.repaid / bucket.lent) : null,
      completedDeliveries: completedCount.get(groupId) ?? 0,
      tenureMonths: 0, // filled from the candidate's formed_on below
    });
  }
  return signals;
}

async function findGroupsWithActiveMatches(
  tx: DbTx,
  groupIds: string[],
): Promise<Set<string>> {
  const rows = await tx
    .select({ groupId: matches.groupId })
    .from(matches)
    .where(
      and(
        inArray(matches.groupId, groupIds),
        inArray(matches.status, [...ACTIVE_MATCH_STATUSES]),
      ),
    );
  return new Set(rows.map((row) => row.groupId));
}

export function monthsSince(isoDate: string, now: Date): number {
  return Math.max(0, (now.getTime() - Date.parse(isoDate)) / (30.44 * 86_400_000));
}

export async function runMatching(
  requestingUserId: string,
  opportunityId: string,
): Promise<MatchResponse[]> {
  const now = new Date();

  // Phase 1 — load the opportunity (own RLS scope).
  const opportunity = await runAsUser(requestingUserId, async (tx) => {
    const rows = await tx
      .select()
      .from(opportunities)
      .where(eq(opportunities.id, opportunityId))
      .limit(1);
    return rows[0] ?? null;
  });
  if (!opportunity) throw new NotFoundError("opportunity not found");
  if (!opportunity.summary) {
    throw new ApiError(
      409,
      "NEEDS_MANUAL_ENTRY",
      "the opportunity has no summary yet; complete manual entry before matching",
    );
  }
  const summary = opportunity.summary;
  const deadline = opportunity.deadline ?? summary.deadline;

  // Phase 2 — ensure the query embedding, outside any transaction so an AI
  // call never holds a database connection. embed() fails closed; a failure
  // here aborts the run before anything is written.
  let queryEmbedding = opportunity.embedding;
  if (!queryEmbedding) {
    const [vector] = await embed([renderForEmbedding(summary)]);
    if (!vector) throw new Error("could not embed the opportunity");
    queryEmbedding = vector;
  }

  // Phase 3 — retrieve, filter, assess, rank, and write, atomically.
  return runAsUser(requestingUserId, async (tx) => {
    const candidates = await retrieveCandidatesBySimilarity(
      tx,
      queryEmbedding,
      opportunityId,
    );

    const { survivors, eliminations } = applyHardFilters(
      candidates,
      {
        productText: summary.whatIsBeingBought,
        quantity: summary.quantity.amount,
        deadline,
        // The opportunity carries no location (by design, so far); the
        // distance filter disengages when the demand district is unknown.
      },
      DEFAULT_FILTER_CONFIG,
      now,
    );

    // Persist eliminations for the dashboard whether or not anything
    // survived — "what was removed and why" is half the point.
    if (eliminations.length > 0) {
      await tx.insert(matchEliminations).values(
        eliminations.map((e) => ({
          opportunityId,
          groupId: e.groupId,
          reasonCode: e.code,
          explanation: e.explanation,
        })),
      );
    }
    if (survivors.length === 0) return [];

    const groupIds = survivors.map((s) => s.candidate.groupId);
    const signalsByGroup = await gatherReadinessSignals(tx, groupIds, now);
    const activeMatchGroups = await findGroupsWithActiveMatches(tx, groupIds);

    const rankInputs: RankInput[] = [];
    const bandByGroup = new Map<string, "ready" | "stretch" | "not_ready">();
    for (const survivor of survivors) {
      const { candidate } = survivor;
      const baseSignals = signalsByGroup.get(candidate.groupId);
      if (!baseSignals) continue;
      const readiness = assessReadiness(
        {
          ...baseSignals,
          tenureMonths: monthsSince(candidate.formedOn, now),
        },
        opportunity.sizeClass,
      );
      bandByGroup.set(candidate.groupId, readiness.band);
      rankInputs.push({
        groupId: candidate.groupId,
        groupName: candidate.groupName,
        similarity: candidate.similarity,
        capacityUnitsPerMonth: survivor.relevantCapacity.unitsPerMonth,
        orderQuantity: summary.quantity.amount,
        distanceKm: survivor.distanceKm,
        maxDeliveryKm: DEFAULT_FILTER_CONFIG.maxDeliveryKm,
        daysUntilDeadline: survivor.daysUntilDeadline,
        minLeadTimeDays: survivor.relevantCapacity.minLeadTimeDays,
        readinessBand: readiness.band,
        comparableDeliveries: baseSignals.completedDeliveries,
        hasActiveMatch: activeMatchGroups.has(candidate.groupId),
      });
    }

    const ranked = rankSurvivors(rankInputs);

    // Status is 'proposed' and nothing else — ever. Verification (stage 6)
    // moves it forward; the DB trigger and RLS enforce that no shortcut
    // exists. The reasons guard double-checks invariant 3 at the write site
    // even though rankSurvivors already throws.
    for (const match of ranked) {
      if (match.reasons.length === 0) {
        throw new Error(
          `match for group ${match.groupId} has no reasons; refusing to write`,
        );
      }
    }
    const inserted = await tx
      .insert(matches)
      .values(
        ranked.map((match) => ({
          groupId: match.groupId,
          opportunityId,
          score: match.score.toFixed(4),
          reasons: match.reasons,
          readinessBand: bandByGroup.get(match.groupId) ?? "not_ready",
          status: "proposed" as const,
        })),
      )
      .returning();

    const byGroup = new Map(inserted.map((row) => [row.groupId, row]));
    return ranked.map((match) => {
      const row = byGroup.get(match.groupId);
      if (!row) throw new Error("inserted match row missing");
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
    });
  });
}
