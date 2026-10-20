import type { Request, Response } from "express";

import { getAuthContext } from "../lib/auth/context";
import * as opportunities from "../services/opportunities";
import {
  opportunityCreateRequestSchema,
  opportunityIngestRequestSchema,
  opportunityListQuerySchema,
} from "../validation/opportunities";
import { idParamSchema } from "../validation/params";

export async function ingestOpportunity(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = getAuthContext(req);
  const body = opportunityIngestRequestSchema.parse(req.body);
  const created = await opportunities.ingestOpportunityDocument(
    auth.userId,
    body,
  );
  res.status(201).json(created);
}

export async function createOpportunity(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = getAuthContext(req);
  const body = opportunityCreateRequestSchema.parse(req.body);
  const created = await opportunities.createOpportunity(auth.userId, body);
  res.status(201).json(created);
}

export async function listOpportunities(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = getAuthContext(req);
  const query = opportunityListQuerySchema.parse(req.query);
  res.json(await opportunities.listOpportunities(auth.userId, query));
}

export async function getOpportunity(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = getAuthContext(req);
  const { id } = idParamSchema.parse(req.params);
  res.json(await opportunities.getOpportunity(auth.userId, id));
}
