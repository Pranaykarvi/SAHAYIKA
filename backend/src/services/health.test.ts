import { describe, expect, it } from "vitest";

import { healthResponseSchema } from "../validation/health";
import { checkHealth } from "./health";

describe("checkHealth", () => {
  it("returns a response matching the health schema", () => {
    const result = checkHealth();
    expect(() => healthResponseSchema.parse(result)).not.toThrow();
    expect(result.status).toBe("ok");
  });
});
