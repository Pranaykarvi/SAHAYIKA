import type { Request, Response } from "express";

import { getAuthContext } from "../lib/auth/context";
import * as reports from "../services/reports";
import { distributionQuerySchema } from "../validation/reports";

export async function getOverview(req: Request, res: Response): Promise<void> {
  const auth = getAuthContext(req);
  res.json(await reports.getOverview(auth.userId));
}

export async function getMatchDistribution(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = getAuthContext(req);
  const { windowDays } = distributionQuerySchema.parse(req.query);
  res.json(await reports.getMatchDistribution(auth.userId, windowDays));
}
