import { describe, expect, it } from "vitest";

import { opportunitySummarySchema } from "../../../validation/opportunities";
import { fakeProvider } from "./fake";

const COMPLETE_TENDER = `Page 1
Tender notice 42/2026 — District school board
What is being bought: 500 school uniform sets for government primary schools
Quantity: 500 sets
Deadline: 2026-12-15
Page 2
Quality specification: Cotton blend, stitched to the approved board sample
Eligibility: Registered women's SHG; GST registration
Payment terms: 60% on delivery, 40% within 30 days of inspection
Penalties: 2% deduction per week of delay`;

describe("fake extraction provider", () => {
  it("extracts a fully cited summary from a complete document", async () => {
    const summary = await fakeProvider.extractStructured(
      COMPLETE_TENDER,
      opportunitySummarySchema,
      "",
    );
    expect(summary.whatIsBeingBought).toContain("school uniform");
    expect(summary.quantity).toEqual({ amount: 500, unit: "sets" });
    expect(summary.paymentTerms).toContain("60% on delivery");
    // Every citation quotes text that is literally in the document, with the
    // right page.
    for (const citation of summary.sourceCitations) {
      expect(COMPLETE_TENDER).toContain(citation.quotedText);
    }
    const page2Fields = summary.sourceCitations
      .filter((c) => c.page === 2)
      .map((c) => c.field);
    expect(page2Fields).toContain("paymentTerms");
  });

  it("fails closed on a document missing payment terms", async () => {
    const withoutPaymentTerms = COMPLETE_TENDER.split("\n")
      .filter((line) => !line.startsWith("Payment terms:"))
      .join("\n");
    await expect(
      fakeProvider.extractStructured(
        withoutPaymentTerms,
        opportunitySummarySchema,
        "",
      ),
    ).rejects.toThrow();
  });
});
