import { z } from "zod";

export const LEDGER_KINDS = [
  "thrift",
  "internal_loan",
  "repayment",
  "expense",
  "income",
] as const;

export const ledgerEntryInsertSchema = z.object({
  groupId: z.string().uuid(),
  memberId: z.string().uuid().nullable().optional(),
  kind: z.enum(LEDGER_KINDS),
  amount: z.number().positive(),
  entryDate: z.string().date(),
  recordedBy: z.string().uuid(),
  reversesEntryId: z.string().uuid().nullable().optional(),
  note: z.string().nullable().optional(),
  isSynthetic: z.boolean().default(false),
});

// There is deliberately no update schema: the ledger is append-only (a
// database trigger rejects UPDATE and DELETE). A correction is a new entry
// pointing at the original via reversesEntryId.

// POST /groups/:id/ledger body — groupId from the path, recordedBy from the
// token; reversals go through their own endpoint.
export const ledgerEntryCreateRequestSchema = ledgerEntryInsertSchema.omit({
  groupId: true,
  recordedBy: true,
  isSynthetic: true,
  reversesEntryId: true,
});

// A correction never edits: it appends a reversing entry pointing at the
// original, with the sign inverted and the reason stored on the entry's
// note. There is deliberately no edit and no delete endpoint — the database
// trigger prevents both, and the API must not imply otherwise.
export const ledgerReverseRequestSchema = z.object({
  entryId: z.string().uuid(),
  reason: z.string().min(1),
});

// amount is a decimal string to preserve precision — money never travels as
// a float. Reversing entries carry a negative amount.
export const ledgerEntryResponseSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  memberId: z.string().uuid().nullable(),
  kind: z.enum(LEDGER_KINDS),
  amount: z.string(),
  entryDate: z.string().date(),
  recordedBy: z.string().uuid(),
  reversesEntryId: z.string().uuid().nullable(),
  note: z.string().nullable(),
  createdAt: z.string().datetime(),
  isSynthetic: z.boolean(),
});

export const ledgerEntryWithBalanceSchema = ledgerEntryResponseSchema.extend({
  // Balance of the group's book after this entry, oldest-to-newest, even
  // though the page itself is served newest-first.
  runningBalance: z.string(),
});

export const ledgerListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const ledgerPageSchema = z.object({
  entries: z.array(ledgerEntryWithBalanceSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int(),
  offset: z.number().int(),
});

export type LedgerEntryInsert = z.infer<typeof ledgerEntryInsertSchema>;
export type LedgerEntryCreateRequest = z.infer<
  typeof ledgerEntryCreateRequestSchema
>;
export type LedgerReverseRequest = z.infer<typeof ledgerReverseRequestSchema>;
export type LedgerEntryResponse = z.infer<typeof ledgerEntryResponseSchema>;
export type LedgerEntryWithBalance = z.infer<
  typeof ledgerEntryWithBalanceSchema
>;
export type LedgerListQuery = z.infer<typeof ledgerListQuerySchema>;
export type LedgerPage = z.infer<typeof ledgerPageSchema>;
