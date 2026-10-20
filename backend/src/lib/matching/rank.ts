import type { MatchReason, ReadinessBand } from "../../validation/matches";

// Weights for the ranked combination over filter survivors. All signals are
// normalized to [0, 1] before weighting, so a weight is the share of the
// final score that signal can contribute. Rotation is the one negative
// weight: it is an adjustment for fairness of distribution, not a quality
// signal. Positive weights sum to 0.95, keeping the score within the API's
// 0..1 contract even before clamping.
export const RANK_WEIGHTS = {
  // Semantic closeness between profile and demand — the strongest signal,
  // but deliberately under half: feasibility and discipline must be able to
  // outvote text similarity.
  similarity: 0.35,
  // How comfortably the order fits in a month's capacity, not merely whether
  // it fits (the filter already guaranteed that).
  capacityHeadroom: 0.15,
  // Nearer deliveries are cheaper and less fragile. District-level estimate.
  distance: 0.1,
  // Slack between the deadline and the group's demonstrated lead time.
  deadlineSlack: 0.1,
  // Readiness band mapped ready=1 / stretch=0.5 / not_ready=0. A band, not a
  // score — see readiness.ts for why.
  readiness: 0.15,
  // Completed deliveries on comparable orders.
  trackRecord: 0.1,
  // Subtracted when the group already holds an active match, so opportunity
  // flow rotates instead of concentrating on the most-matched group.
  rotation: -0.05,
} as const;

export interface RankInput {
  groupId: string;
  groupName: string;
  similarity: number;
  capacityUnitsPerMonth: number;
  orderQuantity: number;
  distanceKm: number | null;
  maxDeliveryKm: number;
  daysUntilDeadline: number;
  minLeadTimeDays: number;
  readinessBand: ReadinessBand;
  comparableDeliveries: number;
  hasActiveMatch: boolean;
}

export interface RankedCandidate {
  groupId: string;
  groupName: string;
  score: number;
  reasons: MatchReason[];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function scoreOne(input: RankInput): RankedCandidate {
  const reasons: MatchReason[] = [];
  let score = 0;

  const add = (signal: string, contribution: number, explanation: string) => {
    if (contribution === 0) return; // only signals that moved the score
    score += contribution;
    reasons.push({ signal, contribution: round(contribution), explanation });
  };

  const similarity = clamp01(input.similarity);
  add(
    "similarity",
    similarity * RANK_WEIGHTS.similarity,
    `The group's capability profile reads as a ${Math.round(similarity * 100)}% semantic match for what is being bought.`,
  );

  const headroom = clamp01(
    (input.capacityUnitsPerMonth - input.orderQuantity) /
      input.capacityUnitsPerMonth,
  );
  add(
    "capacityHeadroom",
    headroom * RANK_WEIGHTS.capacityHeadroom,
    `Monthly capacity of ${input.capacityUnitsPerMonth} covers the ${input.orderQuantity} required with ${Math.round(headroom * 100)}% to spare.`,
  );

  if (input.distanceKm !== null) {
    const proximity = clamp01(1 - input.distanceKm / input.maxDeliveryKm);
    add(
      "distance",
      proximity * RANK_WEIGHTS.distance,
      `Estimated delivery distance of ${input.distanceKm} km sits well inside the ${input.maxDeliveryKm} km radius.`,
    );
  }

  const slack = clamp01(
    input.daysUntilDeadline <= 0
      ? 0
      : (input.daysUntilDeadline - input.minLeadTimeDays) /
          input.daysUntilDeadline,
  );
  add(
    "deadlineSlack",
    slack * RANK_WEIGHTS.deadlineSlack,
    `The deadline leaves ${input.daysUntilDeadline} days against the group's stated lead time of ${input.minLeadTimeDays} days.`,
  );

  const readinessSignal =
    input.readinessBand === "ready"
      ? 1
      : input.readinessBand === "stretch"
        ? 0.5
        : 0;
  add(
    "readiness",
    readinessSignal * RANK_WEIGHTS.readiness,
    input.readinessBand === "ready"
      ? "Ledger discipline and history place the group in the ready band for this order size."
      : "The order would stretch the group, but its ledgers and history put it within reach.",
  );

  const track = clamp01(input.comparableDeliveries / 3);
  add(
    "trackRecord",
    track * RANK_WEIGHTS.trackRecord,
    `${input.comparableDeliveries} completed ${input.comparableDeliveries === 1 ? "order" : "orders"} of comparable size demonstrate delivery ability.`,
  );

  if (input.hasActiveMatch) {
    add(
      "rotation",
      RANK_WEIGHTS.rotation,
      "Score reduced for rotation: the group already holds an active match, making room for other groups.",
    );
  }

  // A match that cannot explain itself is a bug, not a degraded result
  // (invariant 3). Throw rather than write an unexplainable match row.
  if (reasons.length === 0) {
    throw new Error(
      `match for group ${input.groupId} produced no reasons; refusing to create an unexplainable match`,
    );
  }

  return {
    groupId: input.groupId,
    groupName: input.groupName,
    score: round(clamp01(score)),
    reasons,
  };
}

export function rankSurvivors(inputs: RankInput[]): RankedCandidate[] {
  return inputs.map(scoreOne).sort((a, b) => b.score - a.score);
}
