import { describe, expect, it } from "vitest";

import { ApiError, unwrap } from "./client";

function response(status: number): Response {
  return { status } as Response;
}

describe("unwrap", () => {
  it("returns data when the call succeeded", () => {
    const data = { status: "ok" };
    expect(unwrap({ data, response: response(200) })).toBe(data);
  });

  it("throws a typed ApiError carrying the backend error shape", () => {
    try {
      unwrap({
        error: {
          error: { code: "VERIFICATION_REQUIRED", message: "no verification" },
        },
        response: response(409),
      });
      throw new Error("expected unwrap to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiError = err as ApiError;
      expect(apiError.status).toBe(409);
      expect(apiError.code).toBe("VERIFICATION_REQUIRED");
      expect(apiError.message).toBe("no verification");
    }
  });

  it("falls back to a generic error when the body is not the standard shape", () => {
    try {
      unwrap({ error: "gateway exploded", response: response(502) });
      throw new Error("expected unwrap to throw");
    } catch (err) {
      const apiError = err as ApiError;
      expect(apiError.status).toBe(502);
      expect(apiError.code).toBe("UNKNOWN");
    }
  });
});
