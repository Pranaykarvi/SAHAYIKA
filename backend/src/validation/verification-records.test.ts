import { describe, expect, it } from "vitest";

import { verifyMatchRequestSchema } from "./verification-records";

describe("verifyMatchRequestSchema", () => {
  it("rejects a rationale under ten characters before any service runs", () => {
    const result = verifyMatchRequestSchema.safeParse({
      decision: "approved",
      rationale: "looks ok",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a substantive rationale", () => {
    const result = verifyMatchRequestSchema.safeParse({
      decision: "approved",
      rationale: "Capacity verified against the tender quantities.",
    });
    expect(result.success).toBe(true);
  });
});
