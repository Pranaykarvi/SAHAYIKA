import type { Request, Response } from "express";

import { getAuthContext } from "../lib/auth/context";
import * as matches from "../services/matches";
import { groupDecisionRequestSchema } from "../validation/group-decisions";
import { readinessOverrideRequestSchema } from "../validation/matches";
import { idParamSchema } from "../validation/params";
import { verifyMatchRequestSchema } from "../validation/verification-records";

export async function listMatchQueue(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = getAuthContext(req);
  res.json(await matches.listMatchQueue(auth.userId));
}

export async function getMatch(req: Request, res: Response): Promise<void> {
  const auth = getAuthContext(req);
  const { id } = idParamSchema.parse(req.params);
  res.json(await matches.getMatch(auth.userId, id));
}

export async function verifyMatch(req: Request, res: Response): Promise<void> {
  const auth = getAuthContext(req);
  const { id } = idParamSchema.parse(req.params);
  const body = verifyMatchRequestSchema.parse(req.body);
  res.status(201).json(await matches.verifyMatch(auth.userId, id, body));
}

export async function overrideReadiness(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = getAuthContext(req);
  const { id } = idParamSchema.parse(req.params);
  const body = readinessOverrideRequestSchema.parse(req.body);
  res.json(await matches.overrideReadiness(auth.userId, id, body));
}

// The service pins status = 'verified'; this controller passes no status and
// reads none from the request.
export async function listGroupMatches(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = getAuthContext(req);
  const { id } = idParamSchema.parse(req.params);
  res.json(await matches.listVerifiedMatchesForGroup(auth.userId, id));
}

export async function listGroupMatchHistory(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = getAuthContext(req);
  const { id } = idParamSchema.parse(req.params);
  res.json(await matches.listGroupMatchHistory(auth.userId, id));
}

export async function recordGroupDecision(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = getAuthContext(req);
  const { id } = idParamSchema.parse(req.params);
  const body = groupDecisionRequestSchema.parse(req.body);
  res
    .status(201)
    .json(await matches.recordGroupDecision(auth.userId, id, body));
}
