import type { RequestHandler } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

// Fixed-window, in-memory rate limiter — deliberately simple and
// per-process; this deployment runs a single API instance, and the expensive
// endpoints it guards (AI ingestion, matching runs) are human-paced, not
// machine-paced. Keyed by the authenticated user, falling back to IP.
export function rateLimit(options: {
  windowMs: number;
  max: number;
}): RequestHandler {
  const buckets = new Map<string, Bucket>();
  return (req, res, next) => {
    const key = req.auth?.userId ?? req.ip ?? "anonymous";
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > options.max) {
      res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests — wait a moment and try again.",
        },
      });
      return;
    }
    next();
  };
}
