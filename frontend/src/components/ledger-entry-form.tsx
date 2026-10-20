"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiError, browserApi, unwrap } from "@/lib/api/client";

const KINDS = [
  { value: "thrift", label: "Thrift (savings)" },
  { value: "internal_loan", label: "Loan to a member" },
  { value: "repayment", label: "Loan repayment" },
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
] as const;

type Kind = (typeof KINDS)[number]["value"];

// Append-only by design: this form only ever adds. There is no edit and no
// delete anywhere on this surface — the database refuses both, and a
// correction is its own explicit action (see CorrectionButton).
export function LedgerEntryForm({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("thrift");
  const [amount, setAmount] = useState("");
  const [entryDate, setEntryDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input = "w-full rounded-md border bg-background px-4 py-3 text-base";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!(value > 0)) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      unwrap(
        await browserApi().POST("/groups/{id}/ledger", {
          params: { path: { id: groupId } },
          body: {
            kind,
            amount: value,
            entryDate,
            ...(note.trim() ? { note: note.trim() } : {}),
          },
        }),
      );
      setAmount("");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "The entry was not saved.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border p-4">
      <p className="text-base font-medium">Add an entry</p>
      <label className="block space-y-1.5">
        <span className="text-sm text-muted-foreground">Type</span>
        <select
          className={input}
          value={kind}
          onChange={(e) => setKind(e.target.value as Kind)}
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1.5">
          <span className="text-sm text-muted-foreground">Amount (₹)</span>
          <input
            className={input}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm text-muted-foreground">Date</span>
          <input
            className={input}
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
          />
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className="text-sm text-muted-foreground">Note (optional)</span>
        <input
          className={input}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      {error ? <p className="text-base text-destructive">{error}</p> : null}
      <Button type="submit" className="h-14 w-full text-lg" disabled={pending}>
        {pending ? "Saving… please wait" : "Add to the book"}
      </Button>
    </form>
  );
}
