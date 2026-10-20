"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiError, browserApi, unwrap } from "@/lib/api/client";

// Runs the matching pipeline for this opportunity. Everything it creates is
// status 'proposed' — nothing reaches any group until it passes verification.
export function RunMatchingButton({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const proposed = unwrap(
        await browserApi().POST("/matching/run", {
          body: { opportunityId },
        }),
      );
      setResult(
        proposed.length === 0
          ? "No candidates survived the hard filters — see eliminations on any existing match, or re-run after profiles change."
          : `${proposed.length} proposed ${proposed.length === 1 ? "match" : "matches"} created — they are now in the verification queue.`,
      );
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "The matching run failed.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={run} disabled={pending}>
        {pending ? "Running matching…" : "Run matching"}
      </Button>
      {result ? <p className="text-sm">{result}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
