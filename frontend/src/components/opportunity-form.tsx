"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiError, browserApi, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

type CreateRequest = components["schemas"]["OpportunityCreateRequest"];
type Citation = components["schemas"]["OpportunityCreateRequest"]["summary"]["sourceCitations"][number];
type CitableField = Citation["field"];

interface CitationDraft {
  page: string;
  quotedText: string;
}

interface Draft {
  title: string;
  sizeClass: "small" | "medium" | "large" | "";
  documentRef: string;
  what: string;
  qtyAmount: string;
  qtyUnit: string;
  quality: string;
  deadline: string;
  eligibility: string; // semicolon-separated
  payment: string;
  penalties: string;
  citations: Partial<Record<CitableField, CitationDraft>>;
}

const EMPTY: Draft = {
  title: "",
  sizeClass: "",
  documentRef: "",
  what: "",
  qtyAmount: "",
  qtyUnit: "",
  quality: "",
  deadline: "",
  eligibility: "",
  payment: "",
  penalties: "",
  citations: {},
};

// Client-side mirror of the backend's rejection rules (required fields, the
// ten-character floor equivalents, and the citation rule: every non-null
// summary field needs a page and verbatim quote). This exists for immediate
// feedback ONLY — the server validates independently and is the authority;
// nothing here is relied upon.
function validate(draft: Draft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.title.trim()) errors.title = "Title is required.";
  if (!draft.sizeClass) errors.sizeClass = "Pick a size class.";
  if (!draft.what.trim()) errors.what = "Say what is being bought.";
  const amount = Number(draft.qtyAmount);
  if (!(amount > 0)) errors.qtyAmount = "Quantity must be a positive number.";
  if (!draft.qtyUnit.trim()) errors.qtyUnit = "Unit is required.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.deadline)) {
    errors.deadline = "Deadline must be an ISO date (YYYY-MM-DD).";
  }
  if (!draft.payment.trim()) errors.payment = "Payment terms are required.";

  const needsCitation: Array<[CitableField, boolean]> = [
    ["whatIsBeingBought", !!draft.what.trim()],
    ["quantity", true],
    ["deadline", true],
    ["paymentTerms", !!draft.payment.trim()],
    ["qualitySpec", !!draft.quality.trim()],
    ["eligibility", !!draft.eligibility.trim()],
    ["penalties", !!draft.penalties.trim()],
  ];
  for (const [field, present] of needsCitation) {
    if (!present) continue;
    const citation = draft.citations[field];
    if (!citation || !citation.quotedText.trim()) {
      errors[`citation.${field}`] =
        "Every stated field needs the exact quoted source text.";
    } else if (!(Number(citation.page) >= 1)) {
      errors[`citation.${field}`] = "Citation page must be 1 or greater.";
    }
  }
  return errors;
}

function buildPayload(draft: Draft): CreateRequest {
  const cite = (field: CitableField): Citation => {
    const c = draft.citations[field];
    return {
      field,
      page: Number(c?.page ?? 0),
      quotedText: c?.quotedText.trim() ?? "",
    };
  };
  const citations: Citation[] = [
    cite("whatIsBeingBought"),
    cite("quantity"),
    cite("deadline"),
    cite("paymentTerms"),
  ];
  if (draft.quality.trim()) citations.push(cite("qualitySpec"));
  if (draft.eligibility.trim()) citations.push(cite("eligibility"));
  if (draft.penalties.trim()) citations.push(cite("penalties"));

  return {
    source: "manual",
    title: draft.title.trim(),
    sizeClass: draft.sizeClass as "small" | "medium" | "large",
    ...(draft.documentRef.trim() ? { documentRef: draft.documentRef.trim() } : {}),
    summary: {
      whatIsBeingBought: draft.what.trim(),
      quantity: { amount: Number(draft.qtyAmount), unit: draft.qtyUnit.trim() },
      qualitySpec: draft.quality.trim() || null,
      deadline: draft.deadline,
      eligibility: draft.eligibility
        .split(";")
        .map((item) => item.trim())
        .filter(Boolean),
      paymentTerms: draft.payment.trim(),
      penalties: draft.penalties.trim() || null,
      sourceCitations: citations,
    },
  };
}

const FIELD_META: Array<{
  field: CitableField;
  label: string;
  appliesWhen: (d: Draft) => boolean;
}> = [
  { field: "whatIsBeingBought", label: "What is being bought", appliesWhen: () => true },
  { field: "quantity", label: "Quantity", appliesWhen: () => true },
  { field: "deadline", label: "Deadline", appliesWhen: () => true },
  { field: "paymentTerms", label: "Payment terms", appliesWhen: () => true },
  { field: "qualitySpec", label: "Quality specification", appliesWhen: (d) => !!d.quality.trim() },
  { field: "eligibility", label: "Eligibility", appliesWhen: (d) => !!d.eligibility.trim() },
  { field: "penalties", label: "Penalties", appliesWhen: (d) => !!d.penalties.trim() },
];

export function OpportunityForm() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const setCitation = (field: CitableField, patch: Partial<CitationDraft>) =>
    setDraft((d) => ({
      ...d,
      citations: {
        ...d.citations,
        [field]: { page: "", quotedText: "", ...d.citations[field], ...patch },
      },
    }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const found = validate(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setPending(true);
    setServerError(null);
    try {
      const created = unwrap(
        await browserApi().POST("/opportunities", { body: buildPayload(draft) }),
      );
      router.push(`/dashboard/opportunities/${created.id}`);
      router.refresh();
    } catch (err) {
      setServerError(
        err instanceof ApiError
          ? `${err.message} (the server validates independently)`
          : "The opportunity was not saved.",
      );
      setPending(false);
    }
  }

  const input = "w-full rounded-md border bg-background px-3 py-2 text-sm";
  const err = (key: string) =>
    errors[key] ? <p className="text-xs text-destructive">{errors[key]}</p> : null;

  return (
    <form onSubmit={submit} className="max-w-3xl space-y-6">
      <section className="space-y-3">
        <h2 className="font-medium">Opportunity</h2>
        <label className="block space-y-1 text-sm">
          <span>Title</span>
          <input className={input} value={draft.title} onChange={(e) => set({ title: e.target.value })} />
          {err("title")}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1 text-sm">
            <span>Size class</span>
            <select className={input} value={draft.sizeClass} onChange={(e) => set({ sizeClass: e.target.value as Draft["sizeClass"] })}>
              <option value="">Choose…</option>
              <option value="small">small</option>
              <option value="medium">medium</option>
              <option value="large">large</option>
            </select>
            {err("sizeClass")}
          </label>
          <label className="block space-y-1 text-sm">
            <span>Document reference (optional)</span>
            <input className={input} value={draft.documentRef} onChange={(e) => set({ documentRef: e.target.value })} />
          </label>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Summary — every stated field must cite its source</h2>
        <label className="block space-y-1 text-sm">
          <span>What is being bought</span>
          <input className={input} value={draft.what} onChange={(e) => set({ what: e.target.value })} />
          {err("what")}
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block space-y-1 text-sm">
            <span>Quantity</span>
            <input className={input} inputMode="numeric" value={draft.qtyAmount} onChange={(e) => set({ qtyAmount: e.target.value })} />
            {err("qtyAmount")}
          </label>
          <label className="block space-y-1 text-sm">
            <span>Unit</span>
            <input className={input} value={draft.qtyUnit} onChange={(e) => set({ qtyUnit: e.target.value })} />
            {err("qtyUnit")}
          </label>
          <label className="block space-y-1 text-sm">
            <span>Deadline (YYYY-MM-DD)</span>
            <input className={input} value={draft.deadline} onChange={(e) => set({ deadline: e.target.value })} />
            {err("deadline")}
          </label>
        </div>
        <label className="block space-y-1 text-sm">
          <span>Quality specification (leave empty if the document states none)</span>
          <input className={input} value={draft.quality} onChange={(e) => set({ quality: e.target.value })} />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Eligibility (separate items with “;”, empty if not stated)</span>
          <input className={input} value={draft.eligibility} onChange={(e) => set({ eligibility: e.target.value })} />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Payment terms</span>
          <input className={input} value={draft.payment} onChange={(e) => set({ payment: e.target.value })} />
          {err("payment")}
        </label>
        <label className="block space-y-1 text-sm">
          <span>Penalties (leave empty if the document states none)</span>
          <input className={input} value={draft.penalties} onChange={(e) => set({ penalties: e.target.value })} />
        </label>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Citations</h2>
        <p className="text-sm text-muted-foreground">
          For each stated field: the page number and the exact text from the
          source document. A summary with an uncited field is rejected — a
          dropped penalty clause or an invented deadline is contractual
          exposure for a group with no legal support.
        </p>
        {FIELD_META.filter((meta) => meta.appliesWhen(draft)).map((meta) => (
          <div key={meta.field} className="grid grid-cols-[6rem_1fr] gap-3 rounded-md border p-3">
            <label className="block space-y-1 text-sm">
              <span>Page</span>
              <input
                className={input}
                inputMode="numeric"
                value={draft.citations[meta.field]?.page ?? ""}
                onChange={(e) => setCitation(meta.field, { page: e.target.value })}
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span>Quoted source text — {meta.label}</span>
              <input
                className={input}
                value={draft.citations[meta.field]?.quotedText ?? ""}
                onChange={(e) => setCitation(meta.field, { quotedText: e.target.value })}
              />
              {err(`citation.${meta.field}`)}
            </label>
          </div>
        ))}
      </section>

      {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Create opportunity"}
      </Button>
    </form>
  );
}
