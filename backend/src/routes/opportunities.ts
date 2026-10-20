import { Router } from "express";

import {
  createOpportunity,
  getOpportunity,
  ingestOpportunity,
  listOpportunities,
} from "../controllers/opportunities";
import { requireAuth, requireRole } from "../lib/auth";
import { rateLimit } from "../lib/rate-limit";

export const opportunitiesRouter: Router = Router();

opportunitiesRouter.use(
  "/opportunities",
  requireAuth,
  requireRole("social_worker", "admin"),
);
// Ingestion drives an AI call per request — rate-limited per user.
opportunitiesRouter.post(
  "/opportunities/ingest",
  rateLimit({ windowMs: 60_000, max: 5 }),
  ingestOpportunity,
);
opportunitiesRouter.post("/opportunities", createOpportunity);
opportunitiesRouter.get("/opportunities", listOpportunities);
opportunitiesRouter.get("/opportunities/:id", getOpportunity);
