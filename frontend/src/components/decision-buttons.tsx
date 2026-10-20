"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiError, browserApi, unwrap } from "@/lib/api/client";

type Decision = "accepted" | "declined";

const CONFIRM_TEXT: Record<Decision, string> = {
  accepted:
    "Accepting records the group's decision. It creates no commitment to any outside party — no contract, no order, nothing owed to anyone.",
  declined:
    "Declining records the group's decision. Nothing further happens, and nothing is owed to anyone.",
};

export function DecisionButtons({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<Decision | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(decision: Decision) {
    setPending(true);
    setError(null);
    try {
      unwrap(
        await browserApi().POST("/matches/{id}/decision", {
          params: { path: { id: matchId } },
          body: { decision },
        }),
      );
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "The decision was not recorded. Try again.",
      );
      setPending(false);
      setConfirming(null);
    }
  }

  if (confirming) {
    return (
      <div className="space-y-3 rounded-md border-2 p-4">
        <p className="text-base">{CONFIRM_TEXT[confirming]}</p>
        <Button
          className="h-14 w-full text-lg"
          variant={confirming === "accepted" ? "default" : "destructive"}
          disabled={pending}
          onClick={() => submit(confirming)}
        >
          {pending
            ? "Recording… please wait"
            : confirming === "accepted"
              ? "Yes, the group accepts"
              : "Yes, the group declines"}
        </Button>
        <Button
          variant="outline"
          className="h-12 w-full text-base"
          disabled={pending}
          onClick={() => setConfirming(null)}
        >
          Go back
        </Button>
        {error ? <p className="text-base text-destructive">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        className="h-14 w-full text-lg"
        onClick={() => setConfirming("accepted")}
      >
        The group accepts
      </Button>
      <Button
        variant="outline"
        className="h-12 w-full text-base"
        onClick={() => setConfirming("declined")}
      >
        The group declines
      </Button>
      {error ? <p className="text-base text-destructive">{error}</p> : null}
    </div>
  );
}
