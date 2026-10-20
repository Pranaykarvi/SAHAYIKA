import {
  groupId,
  SEED_BOOKKEEPER_ID,
  seedId,
  type GroupDef,
} from "./fixtures";

export interface LedgerRowSeed {
  id: string;
  groupId: string;
  memberId: null;
  kind: "thrift" | "internal_loan" | "repayment" | "expense" | "income";
  amount: string;
  entryDate: string;
  recordedBy: string;
  note: string | null;
  isSynthetic: true;
}

// Deterministic ledger generation — no randomness, so ids and shapes are
// stable across runs. Discipline patterns (month index m counts upward,
// the last index being the current month):
//   regular    — thrift every month, one loan repaid at 90%
//   irregular  — thrift every third month (≈2 of the last 6), loan repaid ~47%
//   poor_thrift_with_deliveries — thrift every sixth month (1 of the last 6),
//     but loans repaid in full and delivery income on record. Readiness must
//     read this as more than a savings threshold.
export function buildLedgerRows(group: GroupDef, now: Date): LedgerRowSeed[] {
  // 12 to 18 months of history, varying by group.
  const monthsCount = 12 + (group.index % 7);
  const monthDates: string[] = [];
  for (let back = monthsCount - 1; back >= 0; back--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    monthDates.push(d.toISOString().slice(0, 10));
  }

  const rows: LedgerRowSeed[] = [];
  let entryIndex = 0;
  const push = (
    kind: LedgerRowSeed["kind"],
    amount: number,
    entryDate: string,
    note: string | null = null,
  ) => {
    rows.push({
      id: seedId(0x100 + group.index, entryIndex++),
      groupId: groupId(group.index),
      memberId: null,
      kind,
      amount: amount.toFixed(2),
      entryDate,
      recordedBy: SEED_BOOKKEEPER_ID,
      note,
      isSynthetic: true,
    });
  };

  const thriftAmount = 400 + group.index * 25;
  for (let m = 0; m < monthsCount; m++) {
    const date = monthDates[m];
    if (!date) continue;

    const savesThisMonth =
      group.discipline === "regular"
        ? true
        : group.discipline === "irregular"
          ? m % 3 === 0
          : m % 6 === 0;
    if (savesThisMonth) push("thrift", thriftAmount, date);

    if (m % 5 === 2) push("expense", 150, date, "meeting and stationery costs");

    if (group.discipline === "regular") {
      if (m === 2) push("internal_loan", 2000, date, "loan to a member");
      if (m >= 4 && m <= 7) push("repayment", 450, date);
      if (m % 6 === 1) push("income", 300, date, "small sales income");
    } else if (group.discipline === "irregular") {
      if (m === 1) push("internal_loan", 1500, date, "loan to a member");
      if (m === 3) push("repayment", 700, date);
    } else {
      // poor thrift, strong delivery record
      if (m === 2) push("internal_loan", 2000, date, "loan to a member");
      if (m === 4 || m === 5) push("repayment", 1000, date);
      if (m === monthsCount - 7 || m === monthsCount - 3) {
        push("income", 8000, date, "payment received for a delivered synthetic order");
      }
    }
  }
  return rows;
}
