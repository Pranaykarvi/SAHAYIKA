import { Router } from "express";

import {
  getMatch,
  listGroupMatches,
  listGroupMatchHistory,
  listMatchQueue,
  overrideReadiness,
  recordGroupDecision,
  verifyMatch,
} from "../controllers/matches";
import { requireAuth, requireGroupAccess, requireRole } from "../lib/auth";

export const matchesRouter: Router = Router();

// /matches/queue must be registered before /matches/:id.
matchesRouter.get(
  "/matches/queue",
  requireAuth,
  requireRole("social_worker", "admin"),
  listMatchQueue,
);
matchesRouter.get(
  "/matches/:id",
  requireAuth,
  requireRole("social_worker", "admin"),
  getMatch,
);
matchesRouter.post(
  "/matches/:id/verify",
  requireAuth,
  requireRole("social_worker", "admin"),
  verifyMatch,
);
matchesRouter.patch(
  "/matches/:id/readiness",
  requireAuth,
  requireRole("social_worker", "admin"),
  overrideReadiness,
);
// The bookkeeper surface: the service pins status = 'verified' (invariant 1).
matchesRouter.get(
  "/groups/:id/matches",
  requireAuth,
  requireRole("bookkeeper", "admin"),
  requireGroupAccess("id"),
  listGroupMatches,
);
// Full history with outcomes; RLS keeps a bookkeeper's view at
// verified-and-later even here.
matchesRouter.get(
  "/groups/:id/match-history",
  requireAuth,
  requireRole("social_worker", "bookkeeper", "admin"),
  requireGroupAccess("id"),
  listGroupMatchHistory,
);
// Ownership of the match's group is enforced by RLS (and the stage-6
// service); the match id alone is not enough for requireGroupAccess here.
matchesRouter.post(
  "/matches/:id/decision",
  requireAuth,
  requireRole("bookkeeper", "admin"),
  recordGroupDecision,
);
