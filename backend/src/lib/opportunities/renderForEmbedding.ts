import type { OpportunitySummary } from "../../validation/opportunities";

// THE single canonical definition of what text represents an opportunity.
// Both the AI-ingest path and the manual-entry path embed exactly this
// rendering — if two definitions existed, the same opportunity could land in
// two different places in vector space depending on how it entered the
// system. Citations are deliberately excluded: they are provenance, not
// content. Change this function and every stored embedding is stale.
export function renderForEmbedding(summary: OpportunitySummary): string {
  return [
    `What is being bought: ${summary.whatIsBeingBought}`,
    `Quantity: ${summary.quantity.amount} ${summary.quantity.unit}`,
    `Quality specification: ${summary.qualitySpec ?? "not stated"}`,
    `Deadline: ${summary.deadline}`,
    `Eligibility: ${
      summary.eligibility.length > 0
        ? summary.eligibility.join("; ")
        : "not stated"
    }`,
    `Payment terms: ${summary.paymentTerms}`,
    `Penalties: ${summary.penalties ?? "not stated"}`,
  ].join("\n");
}
