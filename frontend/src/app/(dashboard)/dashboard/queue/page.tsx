import Link from "next/link";

import { SampleBadge } from "@/components/sample-badge";
import { unwrap } from "@/lib/api/client";
import { serverApi } from "@/lib/api/server";
import { fmtBand, fmtDate } from "@/lib/format";

export default async function QueuePage() {
  const api = await serverApi();
  const queue = unwrap(await api.GET("/matches/queue"));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        Verification queue
      </h1>
      <p className="text-sm text-muted-foreground">
        Proposed matches, newest first. Nothing reaches a group until you
        approve it here.
      </p>
      <ul className="divide-y rounded-md border">
        {queue.length === 0 ? (
          <li className="p-3 text-sm text-muted-foreground">
            The queue is empty.
          </li>
        ) : (
          queue.map((m) => (
            <li key={m.id} className="p-3 text-sm">
              <Link
                href={`/dashboard/queue/${m.id}`}
                className="font-medium hover:underline"
              >
                {m.groupName} ← {m.opportunityTitle}
              </Link>{" "}
              {m.isSynthetic ? <SampleBadge /> : null}
              <p className="text-muted-foreground">
                score {m.score.toFixed(3)} · band {fmtBand(m.readinessBand)} ·
                proposed {fmtDate(m.createdAt)}
              </p>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
