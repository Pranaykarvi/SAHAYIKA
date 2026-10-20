import { RunMatchingButton } from "@/components/run-matching-button";
import { SampleBadge } from "@/components/sample-badge";
import { SummaryCitations } from "@/components/summary-citations";
import { unwrap } from "@/lib/api/client";
import { serverApi } from "@/lib/api/server";
import { fmtDate } from "@/lib/format";

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const api = await serverApi();
  const opportunity = unwrap(
    await api.GET("/opportunities/{id}", { params: { path: { id } } }),
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          {opportunity.title}
          {opportunity.isSynthetic ? <SampleBadge /> : null}
        </h1>
        <p className="text-sm text-muted-foreground">
          {opportunity.sizeClass ?? "unclassified"} · deadline{" "}
          {fmtDate(opportunity.deadline)} · source {opportunity.source}
          {opportunity.documentRef ? ` · ${opportunity.documentRef}` : ""}
        </p>
      </div>
      <RunMatchingButton opportunityId={opportunity.id} />
      {opportunity.summary ? (
        <SummaryCitations summary={opportunity.summary} />
      ) : (
        <p className="rounded-md border border-amber-500 p-3 text-sm">
          This opportunity has no summary yet — ingestion could not extract a
          fully cited one, so it awaits manual entry. Nothing partial is shown.
        </p>
      )}
    </div>
  );
}
