import Link from "next/link";

import { SampleBadge } from "@/components/sample-badge";
import { unwrap } from "@/lib/api/client";
import { serverApi } from "@/lib/api/server";

const WINDOWS = [30, 90, 180, 365];

// This screen exists because matching concentrates when nobody watches: the
// best-documented group wins the first match, accumulates history, ranks
// higher, and wins the next. The chart makes that visible early; the backend
// flags any group holding too large a share of active matches.
export default async function DistributionPage({
  searchParams,
}: {
  searchParams: Promise<{ windowDays?: string }>;
}) {
  const params = await searchParams;
  const windowDays = WINDOWS.includes(Number(params.windowDays))
    ? Number(params.windowDays)
    : 90;

  const api = await serverApi();
  const report = unwrap(
    await api.GET("/reports/distribution", {
      params: { query: { windowDays } },
    }),
  );
  const maxTotal = Math.max(1, ...report.byGroup.map((g) => g.totalMatches));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Match distribution
        </h1>
        <p className="text-sm text-muted-foreground">
          {report.totalMatches} matches across {report.byGroup.length} groups
          in the last {report.windowDays} days · {report.totalActiveMatches}{" "}
          active. A group holding more than{" "}
          {Math.round(report.concentrationThreshold * 100)}% of active matches
          is flagged — concentration is the quiet failure mode of matching.
        </p>
      </div>

      <div className="flex gap-2 text-sm">
        {WINDOWS.map((w) => (
          <Link
            key={w}
            href={`/dashboard/distribution?windowDays=${w}`}
            className={`rounded-md border px-3 py-1.5 ${
              w === windowDays ? "bg-foreground text-background" : "hover:bg-muted/40"
            }`}
          >
            {w} days
          </Link>
        ))}
      </div>

      <ul className="space-y-3">
        {report.byGroup.length === 0 ? (
          <li className="rounded-md border p-4 text-sm text-muted-foreground">
            No matches in this window.
          </li>
        ) : (
          report.byGroup.map((group) => (
            <li key={group.groupId} className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  <Link
                    href={`/dashboard/groups/${group.groupId}`}
                    className="font-medium hover:underline"
                  >
                    {group.groupName}
                  </Link>
                  {group.isSynthetic ? <SampleBadge /> : null}
                  {group.overConcentrated ? (
                    <span className="rounded bg-destructive px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                      {Math.round(group.shareOfActiveMatches * 100)}% of active
                      — over-concentrated
                    </span>
                  ) : null}
                </span>
                <span className="text-muted-foreground">
                  {group.totalMatches} total · {group.activeMatches} active
                </span>
              </div>
              <div className="h-6 w-full rounded bg-muted">
                <div
                  className={`h-6 rounded ${
                    group.overConcentrated ? "bg-destructive" : "bg-foreground/70"
                  }`}
                  style={{
                    width: `${Math.max(2, (group.totalMatches / maxTotal) * 100)}%`,
                  }}
                />
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
