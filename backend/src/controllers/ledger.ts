import type { Request, Response } from "express";

import { getAuthContext } from "../lib/auth/context";
import * as ledger from "../services/ledger";
import {
  ledgerEntryCreateRequestSchema,
  ledgerListQuerySchema,
  ledgerReverseRequestSchema,
} from "../validation/ledger-entries";
import { idParamSchema } from "../validation/params";

export async function getGroupLedger(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = getAuthContext(req);
  const { id } = idParamSchema.parse(req.params);
  const page = ledgerListQuerySchema.parse(req.query);
  res.json(await ledger.listLedgerEntries(auth.userId, id, page));
}

export async function appendLedgerEntry(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = getAuthContext(req);
  const { id } = idParamSchema.parse(req.params);
  const body = ledgerEntryCreateRequestSchema.parse(req.body);
  res.status(201).json(await ledger.appendLedgerEntry(auth.userId, id, body));
}

export async function reverseLedgerEntry(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = getAuthContext(req);
  const { id } = idParamSchema.parse(req.params);
  const body = ledgerReverseRequestSchema.parse(req.body);
  res.status(201).json(await ledger.reverseLedgerEntry(auth.userId, id, body));
}
