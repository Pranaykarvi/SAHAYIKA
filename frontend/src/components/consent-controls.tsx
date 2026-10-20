"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiError, browserApi, unwrap } from "@/lib/api/client";

type Action = "suspended" | "revoked";

const CONFIRM_TEXT: Record<Action, string> = {
  suspended:
    "Suspending pauses this group: it will not appear in matching runs until consent is restored by an administrator. Its profile is kept.",
  revoked:
    "Revoking honours the group's withdrawal of consent: matching stops, the group will not appear in any future matching run, and its profile embedding is removed.",
};

export function ConsentControls({
  groupId,
  consentStatus,
}: {
  groupId: string;
  consentStatus: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(action: Action) {
    setPending(true);
    setError(null);
    try {
      unwrap(
        await browserApi().PATCH("/groups/{id}/consent", {
          params: { path: { id: groupId } },
          body: {
            consentStatus: action,
            ...(reason.trim() ? { reason: reason.trim() } : {}),
          },
        }),
      );
      setConfirming(null);
      setReason("");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "The change was not saved.",
      );
    } finally {
      setPending(false);
    }
  }

  if (consentStatus !== "active") {
    return (
      <p className="text-sm text-muted-foreground">
        Consent is <strong>{consentStatus}</strong>. Restoring it is an
        administrative action, not a dashboard control.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {confirming === null ? (
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setConfirming("suspended")}>
            Suspend consent
          </Button>
          <Button
            variant="destructive"
            onClick={() => setConfirming("revoked")}
          >
            Revoke consent
          </Button>
        </div>
      ) : (
        <div className="space-y-3 rounded-md border border-destructive/50 p-4">
          <p className="text-sm">{CONFIRM_TEXT[confirming]}</p>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="Reason (recorded in the audit log)"
          />
          <div className="flex gap-2">
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => submit(confirming)}
            >
              {confirming === "revoked" ? "Yes, revoke consent" : "Yes, suspend"}
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setConfirming(null)}
            >
              Cancel
            </Button>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      )}
    </div>
  );
}
