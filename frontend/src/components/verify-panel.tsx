"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiError, browserApi, unwrap } from "@/lib/api/client";

const MIN_RATIONALE = 10;

// The three verification actions. Each requires a rationale of at least ten
// characters before its button enables — a decision without a reason is not
// a decision. The backend enforces the same rule independently.
export function VerifyPanel({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [rationale, setRationale] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = rationale.trim().length < MIN_RATIONALE;

  async function decide(
    decision: "approved" | "rejected" | "needs_information",
  ) {
    setPending(true);
    setError(null);
    try {
      unwrap(
        await browserApi().POST("/matches/{id}/verify", {
          params: { path: { id: matchId } },
          body: { decision, rationale: rationale.trim() },
        }),
      );
      router.push("/dashboard/queue");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "The decision was not saved.",
      );
      setPending(false);
    }
  }

  return (
    <section className="space-y-3 rounded-md border p-4">
      <h2 className="font-medium">Verification decision</h2>
      <label className="block space-y-1 text-sm">
        <span>
          Rationale <span className="text-muted-foreground">(at least {MIN_RATIONALE} characters — it is recorded and audited)</span>
        </span>
        <textarea
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          rows={3}
          className="w-full rounded-md border bg-background px-3 py-2"
          placeholder="What did you check, and what did you conclude?"
        />
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={tooShort || pending} onClick={() => decide("approved")}>
          Approve
        </Button>
        <Button
          variant="secondary"
          disabled={tooShort || pending}
          onClick={() => decide("needs_information")}
        >
          Needs more information
        </Button>
        <Button
          variant="destructive"
          disabled={tooShort || pending}
          onClick={() => decide("rejected")}
        >
          Reject
        </Button>
      </div>
    </section>
  );
}
