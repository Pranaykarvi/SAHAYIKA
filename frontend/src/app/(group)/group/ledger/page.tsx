import { CorrectionButton } from "@/components/correction-button";
import { LedgerEntryForm } from "@/components/ledger-entry-form";
import { SampleBadge } from "@/components/sample-badge";
import { unwrap } from "@/lib/api/client";
import { serverApi } from "@/lib/api/server";
import { fmtDate, fmtMoney } from "@/lib/format";

const KIND_LABELS: Record<string, string> = {
  thrift: "Thrift (savings)",
  internal_loan: "Loan to a member",
  repayment: "Loan repayment",
  expense: "Expense",
  income: "Income",
};

export default async function GroupLedgerPage() {
  const api = await serverApi();
  const me = unwrap(await api.GET("/me"));
  if (!me.groupId) throw new Error("this account has no group");
  const page = unwrap(
    await api.GET("/groups/{id}/ledger", {
      params: { path: { id: me.groupId }, query: { limit: 25, offset: 0 } },
    }),
  );

  const balance = page.entries[0]?.runningBalance ?? "0.00";
  const correctedIds = new Set(
    page.entries
      .map((entry) => entry.reversesEntryId)
      .filter((id): id is string => id !== null),
  );

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="rounded-lg border-2 p-4 text-center">
        <p className="text-base text-muted-foreground">The group holds</p>
        <p className="text-4xl font-semibold">{fmtMoney(balance)}</p>
        <p className="text-sm text-muted-foreground">
          across {page.total} entries
        </p>
      </div>

      <LedgerEntryForm groupId={me.groupId} />

      <ul className="space-y-2">
        {page.entries.map((entry) => {
          const isCorrection = entry.reversesEntryId !== null;
          const wasCorrected = correctedIds.has(entry.id);
          return (
            <li key={entry.id} className="rounded-lg border p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-base font-medium">
                  {KIND_LABELS[entry.kind] ?? entry.kind}{" "}
                  {entry.isSynthetic ? <SampleBadge /> : null}
                </span>
                <span className="text-base font-semibold">
                  {fmtMoney(entry.amount)}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {fmtDate(entry.entryDate)} · balance after:{" "}
                {fmtMoney(entry.runningBalance)}
              </p>
              {isCorrection ? (
                <p className="mt-1 rounded bg-amber-100 px-2 py-1 text-sm dark:bg-amber-950">
                  Correction of an earlier entry
                  {entry.note ? ` — ${entry.note}` : ""}
                </p>
              ) : null}
              {wasCorrected ? (
                <p className="mt-1 rounded bg-muted px-2 py-1 text-sm">
                  This entry was corrected — see its reversing entry above.
                </p>
              ) : null}
              {entry.note && !isCorrection ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {entry.note}
                </p>
              ) : null}
              {!isCorrection && !wasCorrected ? (
                <div className="mt-2">
                  <CorrectionButton groupId={me.groupId ?? ""} entryId={entry.id} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
