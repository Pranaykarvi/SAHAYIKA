import type { NextFunction, Request, Response } from "express";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { errorHandler } from "./error-handler";
import { ApiError, NotFoundError } from "./errors";

interface Captured {
  statusCode: number | null;
  body: unknown;
  res: Response;
}

function makeRes(): Captured {
  const captured: Captured = {
    statusCode: null,
    body: undefined,
    res: undefined as unknown as Response,
  };
  const res = {
    headersSent: false,
    status(code: number) {
      captured.statusCode = code;
      return res;
    },
    json(body: unknown) {
      captured.body = body;
      return res;
    },
  };
  captured.res = res as unknown as Response;
  return captured;
}

const req = {} as Request;
const next = (() => undefined) as NextFunction;

describe("errorHandler", () => {
  it("maps ZodError to 400 with field details", () => {
    const result = z.object({ title: z.string() }).safeParse({});
    if (result.success) throw new Error("expected parse failure");
    const captured = makeRes();
    errorHandler(result.error, req, captured.res, next);
    expect(captured.statusCode).toBe(400);
    expect(captured.body).toMatchObject({
      error: { code: "VALIDATION", message: "request validation failed" },
    });
  });

  it("maps stage stubs to a clean 501", () => {
    const captured = makeRes();
    errorHandler(new Error("not implemented: stage 4"), req, captured.res, next);
    expect(captured.statusCode).toBe(501);
    expect(captured.body).toEqual({
      error: { code: "NOT_IMPLEMENTED", message: "not implemented: stage 4" },
    });
  });

  it("maps ApiError subclasses to their status", () => {
    const captured = makeRes();
    errorHandler(new NotFoundError("no such match"), req, captured.res, next);
    expect(captured.statusCode).toBe(404);
    expect(captured.body).toEqual({
      error: { code: "NOT_FOUND", message: "no such match" },
    });
  });

  it("includes details only when the ApiError carries them", () => {
    const captured = makeRes();
    errorHandler(
      new ApiError(409, "CONFLICT", "duplicate", { field: "name" }),
      req,
      captured.res,
      next,
    );
    expect(captured.body).toEqual({
      error: { code: "CONFLICT", message: "duplicate", details: { field: "name" } },
    });
  });

  it("never leaks an unknown error's message or stack", () => {
    const captured = makeRes();
    errorHandler(
      new Error(
        'connect ECONNREFUSED 127.0.0.1:5432 at relation "ledger_entries"',
      ),
      req,
      captured.res,
      next,
    );
    expect(captured.statusCode).toBe(500);
    expect(captured.body).toEqual({
      error: { code: "INTERNAL", message: "internal server error" },
    });
    const serialized = JSON.stringify(captured.body);
    expect(serialized).not.toContain("ECONNREFUSED");
    expect(serialized).not.toContain("ledger_entries");
    expect(serialized).not.toContain("at ");
  });
});
