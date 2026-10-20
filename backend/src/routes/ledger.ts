import { Router } from "express";

import {
  appendLedgerEntry,
  getGroupLedger,
  reverseLedgerEntry,
} from "../controllers/ledger";
import { requireAuth, requireGroupAccess, requireRole } from "../lib/auth";

export const ledgerRouter: Router = Router();

ledgerRouter.get(
  "/groups/:id/ledger",
  requireAuth,
  requireRole("bookkeeper", "social_worker", "admin"),
  requireGroupAccess("id"),
  getGroupLedger,
);
// Writes are the bookkeeper's: append only, corrections via reversal.
ledgerRouter.post(
  "/groups/:id/ledger",
  requireAuth,
  requireRole("bookkeeper", "admin"),
  requireGroupAccess("id"),
  appendLedgerEntry,
);
ledgerRouter.post(
  "/groups/:id/ledger/reverse",
  requireAuth,
  requireRole("bookkeeper", "admin"),
  requireGroupAccess("id"),
  reverseLedgerEntry,
);
