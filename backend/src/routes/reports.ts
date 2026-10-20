import { Router } from "express";

import { getMatchDistribution, getOverview } from "../controllers/reports";
import { requireAuth, requireRole } from "../lib/auth";

export const reportsRouter: Router = Router();

reportsRouter.get(
  "/reports/overview",
  requireAuth,
  requireRole("social_worker", "admin"),
  getOverview,
);
reportsRouter.get(
  "/reports/distribution",
  requireAuth,
  requireRole("social_worker", "admin"),
  getMatchDistribution,
);
