import type { Request, Response } from "express";

import { getAuthContext } from "../lib/auth/context";
import * as groups from "../services/groups";
import { capabilityProfileUpsertRequestSchema } from "../validation/capability-profiles";
import { idParamSchema } from "../validation/params";
import { consentUpdateRequestSchema } from "../validation/self-help-groups";

export async function listGroups(req: Request, res: Response): Promise<void> {
  const auth = getAuthContext(req);
  res.json(await groups.listGroups(auth.userId));
}

export async function getGroup(req: Request, res: Response): Promise<void> {
  const auth = getAuthContext(req);
  const { id } = idParamSchema.parse(req.params);
  res.json(await groups.getGroup(auth.userId, id));
}

export async function updateGroupConsent(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = getAuthContext(req);
  const { id } = idParamSchema.parse(req.params);
  const body = consentUpdateRequestSchema.parse(req.body);
  res.json(await groups.updateGroupConsent(auth.userId, id, body));
}

export async function getCapabilityProfile(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = getAuthContext(req);
  const { id } = idParamSchema.parse(req.params);
  res.json(await groups.getCapabilityProfile(auth.userId, id));
}

export async function upsertCapabilityProfile(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = getAuthContext(req);
  const { id } = idParamSchema.parse(req.params);
  const body = capabilityProfileUpsertRequestSchema.parse(req.body);
  res.json(await groups.upsertCapabilityProfile(auth.userId, id, body));
}
