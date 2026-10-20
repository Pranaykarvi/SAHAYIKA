import { Router } from "express";

import { runMatching } from "../controllers/matching";
import { requireAuth, requireRole } from "../lib/auth";
import { rateLimit } from "../lib/rate-limit";

export const matchingRouter: Router = Router();

// A matching run embeds and retrieves — rate-limited per user.
matchingRouter.post(
  "/matching/run",
  requireAuth,
  requireRole("social_worker", "admin"),
  rateLimit({ windowMs: 60_000, max: 5 }),
  runMatching,
);
