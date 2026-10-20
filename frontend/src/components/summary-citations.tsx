import type { components } from "@/lib/api/schema";

type Summary = components["schemas"]["OpportunitySummary"];

const FIELD_LABELS: Array<{ key: keyof Summary & string; label: string }> = [
  { key: "whatIsBeingBought", label: "What is being bought" },
  { key: "quantity", label: "Quantity" },
  { key: "qualitySpec", label: "Quality specification" },
  { key: "deadline", label: "Deadline" },
  { key: "eligibility", label: "Eligibility" },
  { key: "paymentTerms", label: "Payment terms" },
  { key: "penalties", label: "Penalties" },
];

function renderValue(summary: Summary, key: string): string | null {
  switch (key) {
    case "whatIsBeingBought":
      return summary.whatIsBeingBought;
    case "quantity":
      return `${summary.quantity.amount} ${summary.quantity.unit}`;
    case "qualitySpec":
      return summary.qualitySpec;
    case "deadline":
      return summary.deadline;
    case "eligibility":
      return summary.eligibility.length > 0
        ? summary.eligibility.join("; ")
        : null;
    case "paymentTerms":
      return summary.paymentTerms;
    case "penalties":
      return summary.penalties;
    default:
      return null;
  }
}

// The verification screen's core: every summary field next to the citation
// that backs it, with the quoted source text at EQUAL visual weight — the
// social worker verifies against the source, not the summary. A field
// without a value states so instead of disappearing.
export function SummaryCitations({ summary }: { summary: Summary }) {
  const citationFor = (field: string) =>
    summary.sourceCitations.find((c) => c.field === field) ?? null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-x-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span>Summary</span>
        <span>Source citation</span>
      </div>
      {FIELD_LABELS.map(({ key, label }) => {
        const value = renderValue(summary, key);
        const citation = citationFor(key);
        return (
          <div key={key} className="grid grid-cols-2 gap-x-4">
            <div className="rounded-md border p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
              <p className="mt-1 text-sm">
                {value ?? (
                  <span className="text-muted-foreground">
                    Not stated in the source document
                  </span>
                )}
              </p>
            </div>
            <div className="rounded-md border bg-muted/40 p-3">
              {citation ? (
                <>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Page {citation.page}, quoted verbatim
                  </p>
                  <p className="mt-1 text-sm">“{citation.quotedText}”</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {value
                    ? "No citation — this should not happen; treat the field as unverified."
                    : "Nothing to cite."}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
