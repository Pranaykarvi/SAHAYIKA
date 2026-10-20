"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiError, browserApi, unwrap } from "@/lib/api/client";
import { fmtBand } from "@/lib/format";

type Band = "ready" | "stretch" | "not_ready";

// The human override of the automated readiness band. The original band is
// never replaced: both render side by side, permanently, so the disagreement
// stays visible. An override always carries its own reason.
export function OverridePanel({
  matchId,
  band,
  override,
  overrideReason,
}: {
  matchId: string;
  band: Band;
  override: Band | null;
  overrideReason: string | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Band | "">("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!selected || reason.trim().length === 0) return;
    setPending(true);
    setError(null);
    try {
      unwrap(
        await browserApi().PATCH("/matches/{id}/readiness", {
          params: { path: { id: matchId } },
          body: { band: selected, reason: reason.trim() },
        }),
      );
      setSelected("");
      setReason("");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "The override was not saved.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full border px-3 py-1">
          Automated band: <strong>{fmtBand(band)}</strong>
        </span>
        {override ? (
          <span className="rounded-full border border-amber-500 bg-amber-50 px-3 py-1 dark:bg-amber-950">
            Override: <strong>{fmtBand(override)}</strong>
          </span>
        ) : null}
      </div>
      {override && overrideReason ? (
        <p className="text-sm text-muted-foreground">
          Override reason: {overrideReason}
        </p>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm">
          <span className="block">Override band</span>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value as Band | "")}
            className="rounded-md border bg-background px-3 py-2"
          >
            <option value="">Choose…</option>
            <option value="ready">ready</option>
            <option value="stretch">stretch</option>
            <option value="not_ready">not ready</option>
          </select>
        </label>
        <label className="flex-1 space-y-1 text-sm">
          <span className="block">Reason (required)</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2"
            placeholder="Why does the band not fit this group?"
          />
        </label>
        <Button
          variant="outline"
          disabled={!selected || reason.trim().length === 0 || pending}
          onClick={submit}
        >
          Record override
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
