import Link from "next/link";

import { OverridePanel } from "@/components/override-panel";
import { SampleBadge } from "@/components/sample-badge";
import { SummaryCitations } from "@/components/summary-citations";
import { VerifyPanel } from "@/components/verify-panel";
import { unwrap } from "@/lib/api/client";
import { serverApi } from "@/lib/api/server";
import { fmtDate, fmtMoney } from "@/lib/format";

// The verification screen. Side by side: the cited summary (the point of the
// screen), the group's profile and ledger position, readiness with factors
// and the override, the ranking reasons, and the eliminated candidates.
export default async function VerifyMatchPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  const api = await serverApi();
  const detail = unwrap(
    await api.GET("/matches/{id}", { params: { path: { id: matchId } } }),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          {detail.group.name} ← {detail.opportunity.title}
          {detail.group.isSynthetic || detail.opportunity.isSynthetic ? (
            <SampleBadge />
          ) : null}
        </h1>
        <p className="text-sm text-muted-foreground">
          status {detail.status} · score {detail.score.toFixed(3)} · proposed{" "}
          {fmtDate(detail.createdAt)}
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="space-y-3">
          <h2 className="font-medium">
            Opportunity summary, verified against its source
          </h2>
          {detail.opportunity.summary ? (
            <SummaryCitations summary={detail.opportunity.summary} />
          ) : (
            <p className="rounded-md border border-amber-500 p-3 text-sm">
              No summary — this opportunity awaits manual entry and should not
              have matches.
            </p>
          )}
        </section>

        <div className="space-y-6">
          <section className="rounded-md border p-4 text-sm">
            <h2 className="font-medium">Group</h2>
            <p className="mt-1">
              <Link href={`/dashboard/groups/${detail.group.id}`} className="hover:underline">
                {detail.group.name}
              </Link>{" "}
              — {detail.group.village}, {detail.group.district},{" "}
              {detail.group.state} · consent {detail.group.consentStatus}
            </p>
            {detail.capabilityProfile ? (
              <dl className="mt-3 space-y-2">
                <div>
                  <dt className="text-muted-foreground">Skills</dt>
                  <dd>{detail.capabilityProfile.skills.join(", ")}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Capacity</dt>
                  <dd>
                    {detail.capabilityProfile.capacity
                      .map(
                        (c) =>
                          `${c.product}: ${c.unitsPerMonth}/month, min lead ${c.minLeadTimeDays} days`,
                      )
                      .join(" · ")}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Equipment</dt>
                  <dd>{detail.capabilityProfile.equipment.join(", ") || "—"}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-muted-foreground">No capability profile.</p>
            )}
            <p className="mt-3 border-t pt-3">
              Ledger position: <strong>{fmtMoney(detail.ledgerSummary.balance)}</strong>{" "}
              over {detail.ledgerSummary.entryCount} entries · last entry{" "}
              {fmtDate(detail.ledgerSummary.lastEntryDate)}
            </p>
          </section>

          <section className="space-y-3 rounded-md border p-4">
            <h2 className="font-medium">Readiness</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {detail.readiness.factors.map((factor) => (
                <li key={factor}>{factor}</li>
              ))}
            </ul>
            <OverridePanel
              matchId={detail.id}
              band={detail.readinessBand}
              override={detail.readinessOverride}
              overrideReason={detail.readinessOverrideReason}
            />
          </section>

          <section className="rounded-md border p-4">
            <h2 className="font-medium">Why this match was proposed</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {detail.reasons.map((reason) => (
                <li key={reason.signal}>
                  {reason.explanation}{" "}
                  <span className="text-muted-foreground">
                    ({reason.signal}, {reason.contribution >= 0 ? "+" : ""}
                    {reason.contribution.toFixed(3)})
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <details className="rounded-md border p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Candidates eliminated by the hard filters (
              {detail.eliminations.length}) — review if you disagree
            </summary>
            <ul className="mt-3 space-y-2 text-sm">
              {detail.eliminations.length === 0 ? (
                <li className="text-muted-foreground">
                  Nothing was eliminated for this opportunity.
                </li>
              ) : (
                detail.eliminations.map((e) => (
                  <li key={e.groupId} className="rounded-md bg-muted/40 p-2">
                    <span className="font-medium">{e.groupName}</span> —{" "}
                    {e.explanation}{" "}
                    <span className="text-muted-foreground">({e.reasonCode})</span>
                  </li>
                ))
              )}
            </ul>
          </details>
        </div>
      </div>

      <VerifyPanel matchId={detail.id} />
    </div>
  );
}
