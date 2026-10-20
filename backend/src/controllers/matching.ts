import type { Request, Response } from "express";

import { getAuthContext } from "../lib/auth/context";
import * as matching from "../services/matching";
import { matchingRunRequestSchema } from "../validation/matches";

export async function runMatching(req: Request, res: Response): Promise<void> {
  const auth = getAuthContext(req);
  const body = matchingRunRequestSchema.parse(req.body);
  const proposed = await matching.runMatching(auth.userId, body.opportunityId);
  res.status(201).json(proposed);
}
