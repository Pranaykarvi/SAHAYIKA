import { describe, expect, it } from "vitest";

import {
  applyHardFilters,
  DEFAULT_FILTER_CONFIG,
  type OpportunityRequirements,
} from "./filter";
import type { RetrievedCandidate } from "./retrieve";

const NOW = new Date("2026-10-01T00:00:00Z");

function candidate(
  overrides: Partial<RetrievedCandidate> & { groupId: string },
): RetrievedCandidate {
  return {
    groupName: `Group ${overrides.groupId}`,
    village: "Testvillage",
    district: "Alpha",
    state: "Teststate",
    formedOn: "2020-01-01",
    capacity: [
      { product: "woven fabric", unitsPerMonth: 12000, minLeadTimeDays: 15 },
    ],
    similarity: 0.9,
    ...overrides,
  };
}

const FABRIC_TENDER: OpportunityRequirements = {
  productText: "Supply of woven fabric for school uniforms",
  quantity: 10000,
  deadline: "2026-12-15",
};

describe("applyHardFilters", () => {
  it("eliminates a semantically close but capacity-infeasible candidate, naming capacity", () => {
    // The spec's own example: a two-loom weaving group reads as near-identical
    // text to a ten-thousand-metre fabric tender — similarity 0.97 — and is
    // not a possible match.
    const twoLoomGroup = candidate({
      groupId: "g-two-looms",
      similarity: 0.97,
      capacity: [
        { product: "woven fabric", unitsPerMonth: 400, minLeadTimeDays: 10 },
      ],
    });
    const bigGroup = candidate({ groupId: "g-mill", similarity: 0.6 });

    const outcome = applyHardFilters(
      [twoLoomGroup, bigGroup],
      FABRIC_TENDER,
      DEFAULT_FILTER_CONFIG,
      NOW,
    );

    expect(outcome.survivors.map((s) => s.candidate.groupId)).toEqual([
      "g-mill",
    ]);
    const elimination = outcome.eliminations.find(
      (e) => e.groupId === "g-two-looms",
    );
    expect(elimination?.code).toBe("capacity_below_quantity");
    expect(elimination?.explanation).toContain("capacity");
    expect(elimination?.explanation).toContain("400");
    expect(elimination?.explanation).toContain("10000");
  });

  it("eliminates when nothing in the profile covers the product", () => {
    const pickleGroup = candidate({
      groupId: "g-pickles",
      capacity: [
        { product: "mango pickle jars", unitsPerMonth: 900, minLeadTimeDays: 5 },
      ],
    });
    const outcome = applyHardFilters(
      [pickleGroup],
      FABRIC_TENDER,
      DEFAULT_FILTER_CONFIG,
      NOW,
    );
    expect(outcome.survivors).toHaveLength(0);
    expect(outcome.eliminations[0]?.code).toBe("no_capacity_for_product");
  });

  it("eliminates on district distance beyond the radius, and skips the check when demand location is unknown", () => {
    const farGroup = candidate({ groupId: "g-far", state: "Otherstate" });

    const withLocation = applyHardFilters(
      [farGroup],
      { ...FABRIC_TENDER, district: "Beta", state: "Teststate" },
      DEFAULT_FILTER_CONFIG,
      NOW,
    );
    expect(withLocation.eliminations[0]?.code).toBe("distance_exceeds_radius");

    const withoutLocation = applyHardFilters(
      [farGroup],
      FABRIC_TENDER,
      DEFAULT_FILTER_CONFIG,
      NOW,
    );
    expect(withoutLocation.survivors).toHaveLength(1);
    expect(withoutLocation.survivors[0]?.distanceKm).toBeNull();
  });

  it("eliminates when the deadline falls inside the minimum lead time", () => {
    const slowGroup = candidate({
      groupId: "g-slow",
      capacity: [
        { product: "woven fabric", unitsPerMonth: 20000, minLeadTimeDays: 120 },
      ],
    });
    const outcome = applyHardFilters(
      [slowGroup],
      FABRIC_TENDER, // 75 days out from NOW
      DEFAULT_FILTER_CONFIG,
      NOW,
    );
    expect(outcome.eliminations[0]?.code).toBe("deadline_inside_lead_time");
    expect(outcome.eliminations[0]?.explanation).toContain("120");
  });
});
