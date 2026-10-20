import { describe, expect, it } from "vitest";

import {
  opportunitySummarySchema,
  type OpportunitySummary,
} from "./opportunities";

function citedSummary(): OpportunitySummary {
  return {
    whatIsBeingBought: "500 school uniform sets",
    quantity: { amount: 500, unit: "sets" },
    qualitySpec: "Cotton blend per approved sample",
    deadline: "2026-12-15",
    eligibility: ["Registered women's SHG"],
    paymentTerms: "60% on delivery, 40% within 30 days",
    penalties: "2% deduction per week of delay",
    sourceCitations: [
      { field: "whatIsBeingBought", page: 1, quotedText: "Supply of 500 school uniform sets" },
      { field: "quantity", page: 1, quotedText: "Quantity: 500 sets" },
      { field: "qualitySpec", page: 2, quotedText: "Cotton blend per approved sample" },
      { field: "deadline", page: 2, quotedText: "Last date of delivery: 15 December 2026" },
      { field: "eligibility", page: 2, quotedText: "Open to registered women's SHGs" },
      { field: "paymentTerms", page: 3, quotedText: "60% on delivery, 40% within 30 days" },
      { field: "penalties", page: 3, quotedText: "2% deduction per week of delay" },
    ],
  };
}

describe("opportunitySummarySchema citation rule", () => {
  it("accepts a fully cited summary", () => {
    expect(opportunitySummarySchema.safeParse(citedSummary()).success).toBe(
      true,
    );
  });

  it("rejects a summary whose non-null field is uncited", () => {
    const summary = citedSummary();
    summary.sourceCitations = summary.sourceCitations.filter(
      (c) => c.field !== "paymentTerms",
    );
    const result = opportunitySummarySchema.safeParse(summary);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain("paymentTerms");
    }
  });

  it("allows null fields to be uncited — null has no source to quote", () => {
    const summary = citedSummary();
    summary.penalties = null;
    summary.qualitySpec = null;
    summary.eligibility = [];
    summary.sourceCitations = summary.sourceCitations.filter(
      (c) =>
        c.field !== "penalties" &&
        c.field !== "qualitySpec" &&
        c.field !== "eligibility",
    );
    expect(opportunitySummarySchema.safeParse(summary).success).toBe(true);
  });

  it("rejects an empty citation list outright", () => {
    const summary = citedSummary();
    summary.sourceCitations = [];
    expect(opportunitySummarySchema.safeParse(summary).success).toBe(false);
  });
});
