import { ConsentControls } from "@/components/consent-controls";
import { SampleBadge } from "@/components/sample-badge";
import { ApiError, unwrap, type ApiClient } from "@/lib/api/client";
import { serverApi } from "@/lib/api/server";
import { fmtBand, fmtDate, fmtMoney } from "@/lib/format";

async function profileOrNull(api: ApiClient, id: string) {
  try {
    return unwrap(
      await api.GET("/groups/{id}/profile", { params: { path: { id } } }),
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const api = await serverApi();
  const [group, profile, ledger, history] = await Promise.all([
    api.GET("/groups/{id}", { params: { path: { id } } }).then(unwrap),
    profileOrNull(api, id),
    api
      .GET("/groups/{id}/ledger", {
        params: { path: { id }, query: { limit: 6, offset: 0 } },
      })
      .then(unwrap),
    api
      .GET("/groups/{id}/match-history", { params: { path: { id } } })
      .then(unwrap),
  ]);
  const balance = ledger.entries[0]?.runningBalance ?? "0.00";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          {group.name}
          {group.isSynthetic ? <SampleBadge /> : null}
        </h1>
        <p className="text-sm text-muted-foreground">
          {group.village}, {group.district}, {group.state} · formed{" "}
          {fmtDate(group.formedOn)} · consent <strong>{group.consentStatus}</strong>
        </p>
      </div>

      <section className="rounded-md border p-4 text-sm">
        <h2 className="font-medium">Capability profile</h2>
        {profile ? (
          <dl className="mt-2 space-y-2">
            <div>
              <dt className="text-muted-foreground">Skills</dt>
              <dd>{profile.skills.join(", ")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Capacity</dt>
              <dd>
                {profile.capacity
                  .map(
                    (c) =>
                      `${c.product}: ${c.unitsPerMonth}/month, min lead ${c.minLeadTimeDays} days`,
                  )
                  .join(" · ")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Embedding</dt>
              <dd>
                {profile.embeddingUpdatedAt
                  ? `updated ${fmtDate(profile.embeddingUpdatedAt)}`
                  : "none (removed on revocation, or not yet computed)"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-muted-foreground">No profile captured yet.</p>
        )}
      </section>

      <section className="rounded-md border p-4 text-sm">
        <h2 className="font-medium">Ledger</h2>
        <p className="mt-1">
          Balance <strong>{fmtMoney(balance)}</strong> over {ledger.total}{" "}
          entries. Latest:
        </p>
        <ul className="mt-2 divide-y">
          {ledger.entries.map((entry) => (
            <li key={entry.id} className="flex justify-between py-1.5">
              <span>
                {fmtDate(entry.entryDate)} · {entry.kind.replace("_", " ")}
                {entry.reversesEntryId ? " (reversal)" : ""}
              </span>
              <span>
                {fmtMoney(entry.amount)}{" "}
                <span className="text-muted-foreground">
                  → {fmtMoney(entry.runningBalance)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-md border p-4 text-sm">
        <h2 className="font-medium">Match history</h2>
        <ul className="mt-2 divide-y">
          {history.length === 0 ? (
            <li className="py-1.5 text-muted-foreground">No matches yet.</li>
          ) : (
            history.map((m) => (
              <li key={m.id} className="py-1.5">
                <span className="font-medium">{m.opportunityTitle}</span>{" "}
                {m.isSynthetic ? <SampleBadge /> : null} — {m.status}
                {m.groupDecision ? ` · group ${m.groupDecision}` : ""}
                {m.decisionRecordedBy
                  ? ` · recorded by ${m.decisionRecordedBy}${
                      m.decisionRecordedAt
                        ? ` on ${fmtDate(m.decisionRecordedAt)}`
                        : ""
                    }`
                  : ""}{" "}
                · band {fmtBand(m.readinessBand)}
                {m.readinessOverride
                  ? ` (override: ${fmtBand(m.readinessOverride)})`
                  : ""}{" "}
                <span className="text-muted-foreground">
                  · {fmtDate(m.createdAt)}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-md border p-4">
        <h2 className="text-sm font-medium">Consent</h2>
        <div className="mt-2">
          <ConsentControls groupId={group.id} consentStatus={group.consentStatus} />
        </div>
      </section>
    </div>
  );
}
