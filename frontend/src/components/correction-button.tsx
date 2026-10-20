"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiError, browserApi, unwrap } from "@/lib/api/client";

// The ONLY way to fix an entry: an explicit correction that appends a
// reversing entry with a reason. The original stays in the book; both are
// shown. Editing or deleting does not exist here because the database
// refuses both.
export function CorrectionButton({
  groupId,
  entryId,
}: {
  groupId: string;
  entryId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!reason.trim()) return;
    setPending(true);
    setError(null);
    try {
      unwrap(
        await browserApi().POST("/groups/{id}/ledger/reverse", {
          params: { path: { id: groupId } },
          body: { entryId, reason: reason.trim() },
        }),
      );
      setOpen(false);
      setReason("");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "The correction was not recorded.",
      );
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-10 text-sm"
        onClick={() => setOpen(true)}
      >
        Record a correction
      </Button>
    );
  }

  return (
    <div className="mt-2 w-full space-y-2 rounded-md border p-3">
      <p className="text-sm">
        This adds a reversing entry. The original stays in the book, and both
        will be visible.
      </p>
      <input
        className="w-full rounded-md border bg-background px-4 py-3 text-base"
        placeholder="Why is this entry wrong?"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex gap-2">
        <Button
          className="h-12 flex-1 text-base"
          disabled={pending || !reason.trim()}
          onClick={submit}
        >
          {pending ? "Recording…" : "Record correction"}
        </Button>
        <Button
          variant="outline"
          className="h-12 text-base"
          disabled={pending}
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
