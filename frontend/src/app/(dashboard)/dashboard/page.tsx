import Link from "next/link";

import { SampleBadge } from "@/components/sample-badge";
import { unwrap } from "@/lib/api/client";
import { serverApi } from "@/lib/api/server";
import { daysUntil, fmtDate } from "@/lib/format";

export default async function DashboardPage() {
  const api = await serverApi();
  const [overview, groups] = await Promise.all([
    api.GET("/reports/overview").then(unwrap),
    api.GET("/groups").then(unwrap),
  ]);

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/dashboard/queue"
          className="rounded-md border p-4 hover:bg-muted/40"
        >
          <p className="text-3xl font-semibold">
            {overview.pendingVerifications}
          </p>
          <p className="text-sm text-muted-foreground">
            matches awaiting your verification
          </p>
        </Link>
        <div className="rounded-md border p-4">
          <p className="text-3xl font-semibold">{overview.groupCount}</p>
          <p className="text-sm text-muted-foreground">
            groups in your federation
          </p>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="font-medium">Opportunities approaching deadline</h2>
        <ul className="divide-y rounded-md border">
          {overview.upcomingDeadlines.length === 0 ? (
            <li className="p-3 text-sm text-muted-foreground">None open.</li>
          ) : (
            overview.upcomingDeadlines.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                <span className="flex items-center gap-2">
                  <Link href={`/dashboard/opportunities/${o.id}`} className="hover:underline">
                    {o.title}
                  </Link>
                  {o.isSynthetic ? <SampleBadge /> : null}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {fmtDate(o.deadline)} · {daysUntil(o.deadline)} days
                </span>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Recent verification decisions</h2>
        <ul className="divide-y rounded-md border">
          {overview.recentDecisions.length === 0 ? (
            <li className="p-3 text-sm text-muted-foreground">
              No decisions yet.
            </li>
          ) : (
            overview.recentDecisions.map((d) => (
              <li key={`${d.matchId}-${d.decidedAt}`} className="p-3 text-sm">
                <span className="font-medium">{d.decision.replace("_", " ")}</span>{" "}
                — {d.groupName} · {d.opportunityTitle}{" "}
                {d.isSynthetic ? <SampleBadge /> : null}{" "}
                <span className="text-muted-foreground">
                  ({fmtDate(d.decidedAt)})
                </span>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Groups in your federation</h2>
        <ul className="divide-y rounded-md border">
          {groups.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-2 p-3 text-sm">
              <span className="flex items-center gap-2">
                <Link href={`/dashboard/groups/${g.id}`} className="hover:underline">
                  {g.name}
                </Link>
                {g.isSynthetic ? <SampleBadge /> : null}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {g.district} · consent {g.consentStatus}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
