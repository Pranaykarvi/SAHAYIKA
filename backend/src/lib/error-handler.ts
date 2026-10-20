import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

import { ApiError } from "./errors";
import { logger } from "./logger";

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: `no route for ${req.method} ${req.path}` },
  });
}

// The only place errors become HTTP responses, and the only shape they take:
// { error: { code, message, details? } }. Anything unrecognised is logged in
// full and answered with a generic 500 — a stack trace or a database error
// string never reaches the client.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION",
        message: "request validation failed",
        details: err.flatten().fieldErrors,
      },
    });
    return;
  }

  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  // Stage stubs throw `new Error("not implemented: stage N")` (a process
  // rule, so a plain Error, not an ApiError). The message is written by us
  // and safe to return.
  if (err instanceof Error && err.message.startsWith("not implemented:")) {
    res.status(501).json({
      error: { code: "NOT_IMPLEMENTED", message: err.message },
    });
    return;
  }

  logger.error({ err }, "unhandled error");
  res.status(500).json({
    error: { code: "INTERNAL", message: "internal server error" },
  });
}
