import { and, asc, eq } from "drizzle-orm";

import { runAsUser, type DbTx } from "../db/client";
import { ledgerEntries, members } from "../db/schema";
import { ApiError, NotFoundError } from "../lib/errors";
import type {
  LedgerEntryCreateRequest,
  LedgerEntryResponse,
  LedgerEntryWithBalance,
  LedgerListQuery,
  LedgerPage,
  LedgerReverseRequest,
} from "../validation/ledger-entries";

type LedgerRow = typeof ledgerEntries.$inferSelect;

// Sign convention for the running balance: money the group holds grows with
// thrift, repayments, and income, and shrinks with internal loans (money out
// to members) and expenses. A reversing entry carries a negated amount, so it
// inverts its kind's effect without any special casing here.
const KIND_SIGN: Record<LedgerRow["kind"], 1 | -1> = {
  thrift: 1,
  repayment: 1,
  income: 1,
  internal_loan: -1,
  expense: -1,
};

function toResponse(row: LedgerRow): LedgerEntryResponse {
  return {
    id: row.id,
    groupId: row.groupId,
    memberId: row.memberId,
    kind: row.kind,
    amount: row.amount,
    entryDate: row.entryDate,
    recordedBy: row.recordedBy,
    reversesEntryId: row.reversesEntryId,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    isSynthetic: row.isSynthetic,
  };
}

// The group's current book position in one line — used by the verification
// screen. Same sign convention as the running balance.
export async function summarizeLedger(
  tx: DbTx,
  groupId: string,
): Promise<{ balance: string; entryCount: number; lastEntryDate: string | null }> {
  const rows = await tx
    .select({
      kind: ledgerEntries.kind,
      amount: ledgerEntries.amount,
      entryDate: ledgerEntries.entryDate,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.groupId, groupId));
  let balance = 0;
  let lastEntryDate: string | null = null;
  for (const row of rows) {
    balance += KIND_SIGN[row.kind] * Number(row.amount);
    if (!lastEntryDate || row.entryDate > lastEntryDate) {
      lastEntryDate = row.entryDate;
    }
  }
  return { balance: balance.toFixed(2), entryCount: rows.length, lastEntryDate };
}

// Entries with a running balance, newest first, paginated. The balance is
// computed over the full book oldest-to-newest (it is meaningless otherwise)
// and then the page is cut; group books are small enough that this stays
// simple rather than clever. Scoping beyond the WHERE clause is RLS's job.
export async function listLedgerEntries(
  requestingUserId: string,
  groupId: string,
  page: LedgerListQuery = { limit: 50, offset: 0 },
): Promise<LedgerPage> {
  const rows = await runAsUser(requestingUserId, (tx) =>
    tx
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.groupId, groupId))
      .orderBy(asc(ledgerEntries.entryDate), asc(ledgerEntries.createdAt)),
  );

  let balance = 0;
  const withBalance: LedgerEntryWithBalance[] = rows.map((row) => {
    balance += KIND_SIGN[row.kind] * Number(row.amount);
    return { ...toResponse(row), runningBalance: balance.toFixed(2) };
  });

  withBalance.reverse(); // newest first
  return {
    entries: withBalance.slice(page.offset, page.offset + page.limit),
    total: rows.length,
    limit: page.limit,
    offset: page.offset,
  };
}

export async function appendLedgerEntry(
  requestingUserId: string,
  groupId: string,
  input: LedgerEntryCreateRequest,
): Promise<LedgerEntryResponse> {
  return runAsUser(requestingUserId, async (tx) => {
    if (input.memberId) {
      const memberRows = await tx
        .select({ id: members.id })
        .from(members)
        .where(
          and(eq(members.id, input.memberId), eq(members.groupId, groupId)),
        )
        .limit(1);
      if (!memberRows[0]) {
        throw new ApiError(
          422,
          "MEMBER_NOT_IN_GROUP",
          "the member does not belong to this group",
        );
      }
    }

    const rows = await tx
      .insert(ledgerEntries)
      .values({
        groupId,
        memberId: input.memberId ?? null,
        kind: input.kind,
        amount: input.amount.toFixed(2),
        entryDate: input.entryDate,
        recordedBy: requestingUserId,
        note: input.note ?? null,
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error("ledger insert returned no row");
    return toResponse(row);
  });
}

// Corrections never edit: this inserts a reversing entry with the sign
// inverted and reverses_entry_id pointing at the original. The append-only
// trigger makes update/delete impossible at the database, and no such
// endpoint exists at the API.
export async function reverseLedgerEntry(
  requestingUserId: string,
  groupId: string,
  input: LedgerReverseRequest,
): Promise<LedgerEntryResponse> {
  return runAsUser(requestingUserId, async (tx) => {
    const originals = await tx
      .select()
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.id, input.entryId),
          eq(ledgerEntries.groupId, groupId),
        ),
      )
      .limit(1);
    const original = originals[0];
    if (!original) throw new NotFoundError("ledger entry not found in this group");

    const existingReversals = await tx
      .select({ id: ledgerEntries.id })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.reversesEntryId, input.entryId))
      .limit(1);
    if (existingReversals[0]) {
      throw new ApiError(
        409,
        "ALREADY_REVERSED",
        "this entry has already been reversed",
      );
    }

    const rows = await tx
      .insert(ledgerEntries)
      .values({
        groupId,
        memberId: original.memberId,
        kind: original.kind,
        amount: (-Number(original.amount)).toFixed(2),
        entryDate: new Date().toISOString().slice(0, 10),
        recordedBy: requestingUserId,
        reversesEntryId: original.id,
        note: input.reason,
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error("reversal insert returned no row");
    return toResponse(row);
  });
}
