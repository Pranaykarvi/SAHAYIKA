import { describe, expect, it } from "vitest";

import { assessReadiness } from "./readiness";

describe("assessReadiness", () => {
  it("bands a disciplined, tenured group as ready for a medium order", () => {
    const result = assessReadiness(
      {
        thriftRegularity: 1,
        loanRepaymentRate: 0.9,
        completedDeliveries: 2,
        tenureMonths: 36,
      },
      "medium",
    );
    expect(result.band).toBe("ready");
    expect(result.factors).toHaveLength(3);
  });

  it("bands a single shortfall as stretch, not not_ready", () => {
    const result = assessReadiness(
      {
        thriftRegularity: 0.33, // below the medium bar
        loanRepaymentRate: 0.9,
        completedDeliveries: 2,
        tenureMonths: 36,
      },
      "medium",
    );
    expect(result.band).toBe("stretch");
    // The unmet factor leads the explanation.
    expect(result.factors[0]).toContain("only");
  });

  it("treats absent lending history as neutral, never as a failure", () => {
    const result = assessReadiness(
      {
        thriftRegularity: 1,
        loanRepaymentRate: null,
        completedDeliveries: 1,
        tenureMonths: 24,
      },
      "medium",
    );
    expect(result.band).toBe("ready");
    expect(result.factors.join(" ")).not.toContain("below the bar");
  });

  it("outputs a band and sentences, never a numeric score", () => {
    const result = assessReadiness(
      {
        thriftRegularity: 0,
        loanRepaymentRate: 0.1,
        completedDeliveries: 0,
        tenureMonths: 2,
      },
      "large",
    );
    expect(result.band).toBe("not_ready");
    expect(Object.keys(result).sort()).toEqual(["band", "factors"]);
    for (const factor of result.factors) {
      expect(typeof factor).toBe("string");
    }
  });
});
