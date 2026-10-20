import { DecisionButtons } from "@/components/decision-buttons";
import { ListenButton } from "@/components/listen-button";
import { SampleBadge } from "@/components/sample-badge";
import { unwrap } from "@/lib/api/client";
import { serverApi } from "@/lib/api/server";
import type { components } from "@/lib/api/schema";
import { daysUntil, fmtDate } from "@/lib/format";

type Match = components["schemas"]["MatchWithOpportunity"];

function speechText(match: Match): string {
  const s = match.opportunity.summary;
  if (!s) return match.opportunity.title;
  return [
    `Opportunity: ${s.whatIsBeingBought}.`,
    `Quantity: ${s.quantity.amount} ${s.quantity.unit}.`,
    `Deadline: ${s.deadline}.`,
    `Payment: ${s.paymentTerms}.`,
    s.penalties
      ? `Penalties: ${s.penalties}.`
      : "No penalties are stated in the document.",
    `Why this group: ${match.reasons.map((r) => r.explanation).join(" ")}`,
  ].join(" ");
}

// Verified matches ONLY: the backend pins the filter and this page sends no
// status parameter and nothing that could widen the query — the backend
// decides what this group may see.
export default async function GroupOpportunitiesPage() {
  const api = await serverApi();
  const me = unwrap(await api.GET("/me"));
  if (!me.groupId) throw new Error("this account has no group");
  const matchesForGroup = unwrap(
    await api.GET("/groups/{id}/matches", {
      params: { path: { id: me.groupId } },
    }),
  );

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Opportunities for your group
        </h1>
        <p className="text-base text-muted-foreground">
          Each one was checked and approved by your social worker before it
          reached you. The group decides — nobody else.
        </p>
      </div>

      {matchesForGroup.length === 0 ? (
        <p className="rounded-lg border p-4 text-base text-muted-foreground">
          Nothing to decide right now. New opportunities appear here after
          your social worker verifies them.
        </p>
      ) : (
        matchesForGroup.map((match) => {
          const s = match.opportunity.summary;
          return (
            <article key={match.id} className="space-y-4 rounded-lg border p-4">
              <h2 className="text-lg font-semibold leading-snug">
                {match.opportunity.title}{" "}
                {match.opportunity.isSynthetic ? <SampleBadge /> : null}
              </h2>
              {s ? (
                <>
                  <p className="text-base">{s.whatIsBeingBought}</p>
                  {/* The obligations get the SAME visual weight as the
                      opportunity. Loud upside with a quiet penalty clause is
                      the failure mode this screen must not have. */}
                  <div className="space-y-1.5 rounded-md border-2 border-foreground/60 p-4 text-base">
                    <p className="font-semibold">
                      What the group must deliver
                    </p>
                    <p>
                      Quantity:{" "}
                      <strong>
                        {s.quantity.amount} {s.quantity.unit}
                      </strong>
                    </p>
                    <p>
                      Deadline: <strong>{fmtDate(s.deadline)}</strong> (
                      {daysUntil(s.deadline)} days from today)
                    </p>
                    <p>
                      Penalties:{" "}
                      <strong>
                        {s.penalties ?? "None stated in the document"}
                      </strong>
                    </p>
                    <p>
                      Payment: <strong>{s.paymentTerms}</strong>
                    </p>
                  </div>
                </>
              ) : null}
              <ListenButton text={speechText(match)} />
              <div className="rounded-md bg-muted/40 p-4">
                <p className="text-base font-medium">
                  Why your group was matched
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-base">
                  {match.reasons.map((reason) => (
                    <li key={reason.signal}>{reason.explanation}</li>
                  ))}
                </ul>
              </div>
              <DecisionButtons matchId={match.id} />
            </article>
          );
        })
      )}
    </div>
  );
}
