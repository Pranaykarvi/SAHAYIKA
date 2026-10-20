import { describe, expect, it } from "vitest";

import { rankSurvivors, type RankInput } from "./rank";

function input(overrides: Partial<RankInput> & { groupId: string }): RankInput {
  return {
    groupName: `Group ${overrides.groupId}`,
    similarity: 0.8,
    capacityUnitsPerMonth: 2000,
    orderQuantity: 500,
    distanceKm: 20,
    maxDeliveryKm: 150,
    daysUntilDeadline: 60,
    minLeadTimeDays: 10,
    readinessBand: "ready",
    comparableDeliveries: 2,
    hasActiveMatch: false,
    ...overrides,
  };
}

describe("rankSurvivors", () => {
  it("rotation demotes a group holding an active match, with a reason saying so", () => {
    const [first, second] = rankSurvivors([
      input({ groupId: "g-busy", hasActiveMatch: true }),
      input({ groupId: "g-free" }),
    ]);
    expect(first?.groupId).toBe("g-free");
    expect(second?.groupId).toBe("g-busy");
    const rotation = second?.reasons.find((r) => r.signal === "rotation");
    expect(rotation?.contribution).toBeLessThan(0);
    expect(rotation?.explanation).toContain("rotation");
  });

  it("reasons is non-empty for every produced match", () => {
    const ranked = rankSurvivors([
      input({ groupId: "a" }),
      input({ groupId: "b", readinessBand: "not_ready", similarity: 0.1 }),
      input({ groupId: "c", distanceKm: null, comparableDeliveries: 0 }),
    ]);
    for (const match of ranked) {
      expect(match.reasons.length).toBeGreaterThan(0);
      for (const reason of match.reasons) {
        expect(reason.explanation.length).toBeGreaterThan(10);
      }
    }
  });

  it("throws rather than produce a match with no reasons", () => {
    // Every signal flat zero: nothing moved the score, nothing can be
    // explained — the function must throw, not degrade (invariant 3).
    expect(() =>
      rankSurvivors([
        input({
          groupId: "g-unexplainable",
          similarity: 0,
          capacityUnitsPerMonth: 500,
          orderQuantity: 500,
          distanceKm: null,
          daysUntilDeadline: 0,
          readinessBand: "not_ready",
          comparableDeliveries: 0,
          hasActiveMatch: false,
        }),
      ]),
    ).toThrow(/no reasons/);
  });

  it("orders by descending score and keeps scores within [0, 1]", () => {
    const ranked = rankSurvivors([
      input({ groupId: "weak", similarity: 0.2, readinessBand: "stretch" }),
      input({ groupId: "strong", similarity: 0.95 }),
    ]);
    expect(ranked[0]?.groupId).toBe("strong");
    for (const match of ranked) {
      expect(match.score).toBeGreaterThanOrEqual(0);
      expect(match.score).toBeLessThanOrEqual(1);
    }
  });
});
