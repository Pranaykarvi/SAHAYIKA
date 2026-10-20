import type { CapacityItem } from "../../validation/capability-profiles";
import type { RetrievedCandidate } from "./retrieve";

// Hard constraints, not score penalties — and that is the point of this file.
// Semantic similarity cannot be trusted for feasibility: a two-loom weaving
// group and a ten-thousand-metre fabric tender read as near-identical text
// and are not a possible match. An infeasible candidate must disappear from
// the ranking entirely, with a recorded reason, not limp along with a low
// score that a high similarity could still rescue.

export interface OpportunityRequirements {
  // Plain-language description of what is being bought; matched against
  // profiled capacity products by token overlap.
  productText: string;
  quantity: number;
  deadline: string; // ISO date
  // Delivery origin of the demand, when known. Location is village-granular
  // by deliberate privacy constraint (invariant 5), so distance is computed
  // from districts — a coarse but honest estimate, not a limitation to work
  // around with finer coordinates.
  district?: string;
  state?: string;
}

export interface FilterConfig {
  // Maximum acceptable estimated delivery distance.
  maxDeliveryKm: number;
  // District-level distance proxies: same district, same state, other state.
  sameDistrictKm: number;
  sameStateKm: number;
  otherStateKm: number;
}

export const DEFAULT_FILTER_CONFIG: FilterConfig = {
  maxDeliveryKm: 150,
  sameDistrictKm: 20,
  sameStateKm: 120,
  otherStateKm: 500,
};

export type EliminationReasonCode =
  | "no_capacity_for_product"
  | "capacity_below_quantity"
  | "distance_exceeds_radius"
  | "deadline_inside_lead_time";

export interface Elimination {
  groupId: string;
  groupName: string;
  code: EliminationReasonCode;
  explanation: string;
}

export interface Survivor {
  candidate: RetrievedCandidate;
  relevantCapacity: CapacityItem;
  distanceKm: number | null;
  daysUntilDeadline: number;
}

export interface FilterOutcome {
  survivors: Survivor[];
  // Eliminations are returned, not discarded: the dashboard shows a social
  // worker what was removed and why, so the filters stay accountable.
  eliminations: Elimination[];
}

const STOPWORDS = new Set(["the", "and", "for", "with", "per", "sets", "units"]);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t)),
  );
}

// The capacity item whose product shares the most tokens with the demand
// text; null when nothing overlaps at all.
function findRelevantCapacity(
  capacity: CapacityItem[],
  productText: string,
): CapacityItem | null {
  const wanted = tokens(productText);
  let best: CapacityItem | null = null;
  let bestOverlap = 0;
  for (const item of capacity) {
    let overlap = 0;
    for (const token of tokens(item.product)) {
      if (wanted.has(token)) overlap += 1;
    }
    if (overlap > bestOverlap) {
      best = item;
      bestOverlap = overlap;
    }
  }
  return best;
}

function estimateDistanceKm(
  candidate: RetrievedCandidate,
  requirements: OpportunityRequirements,
  config: FilterConfig,
): number | null {
  if (!requirements.district) return null; // unknown demand location — skip
  if (candidate.district.toLowerCase() === requirements.district.toLowerCase()) {
    return config.sameDistrictKm;
  }
  if (
    requirements.state &&
    candidate.state.toLowerCase() === requirements.state.toLowerCase()
  ) {
    return config.sameStateKm;
  }
  return config.otherStateKm;
}

export function applyHardFilters(
  candidates: RetrievedCandidate[],
  requirements: OpportunityRequirements,
  config: FilterConfig = DEFAULT_FILTER_CONFIG,
  now: Date = new Date(),
): FilterOutcome {
  const survivors: Survivor[] = [];
  const eliminations: Elimination[] = [];
  const daysUntilDeadline = Math.floor(
    (Date.parse(requirements.deadline) - now.getTime()) / 86_400_000,
  );

  for (const candidate of candidates) {
    const relevant = findRelevantCapacity(
      candidate.capacity,
      requirements.productText,
    );
    if (!relevant) {
      eliminations.push({
        groupId: candidate.groupId,
        groupName: candidate.groupName,
        code: "no_capacity_for_product",
        explanation: `Nothing in the group's profiled capacity covers "${requirements.productText}", so feasibility cannot be established.`,
      });
      continue;
    }

    // Simplification, on purpose: the order must fit within one month of
    // profiled capacity. Multi-month scheduling is a later refinement.
    if (relevant.unitsPerMonth < requirements.quantity) {
      eliminations.push({
        groupId: candidate.groupId,
        groupName: candidate.groupName,
        code: "capacity_below_quantity",
        explanation: `Profiled monthly capacity for "${relevant.product}" is ${relevant.unitsPerMonth}, below the ${requirements.quantity} this order requires.`,
      });
      continue;
    }

    const distanceKm = estimateDistanceKm(candidate, requirements, config);
    if (distanceKm !== null && distanceKm > config.maxDeliveryKm) {
      eliminations.push({
        groupId: candidate.groupId,
        groupName: candidate.groupName,
        code: "distance_exceeds_radius",
        explanation: `Estimated delivery distance of ${distanceKm} km (district to district) exceeds the ${config.maxDeliveryKm} km radius.`,
      });
      continue;
    }

    if (daysUntilDeadline < relevant.minLeadTimeDays) {
      eliminations.push({
        groupId: candidate.groupId,
        groupName: candidate.groupName,
        code: "deadline_inside_lead_time",
        explanation: `Only ${daysUntilDeadline} days remain to the deadline, inside the group's minimum lead time of ${relevant.minLeadTimeDays} days for "${relevant.product}".`,
      });
      continue;
    }

    survivors.push({
      candidate,
      relevantCapacity: relevant,
      distanceKm,
      daysUntilDeadline,
    });
  }

  return { survivors, eliminations };
}
