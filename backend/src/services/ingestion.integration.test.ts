import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Exercises the real ingestion pipeline against the live database, with the
// deterministic fake provider selected by env — the same selection mechanism
// production uses, so the fail-closed paths are the real ones. Env-dependent
// modules are imported dynamically AFTER the provider env vars are set.
const adminUrl = process.env.ADMIN_DATABASE_URL;
const appUrl = process.env.DATABASE_URL;

const SOCIAL_WORKER = "abababab-0000-4000-8000-000000000001";
const FEDERATION = "abababab-0000-4000-8000-0000000000f1";

const COMPLETE_TENDER = `Page 1
Tender notice 42/2026 — District school board
What is being bought: 500 school uniform sets for government primary schools
Quantity: 500 sets
Deadline: 2026-12-15
Page 2
Quality specification: Cotton blend, stitched to the approved board sample
Eligibility: Registered women's SHG; GST registration
Payment terms: 60% on delivery, 40% within 30 days of inspection
Penalties: 2% deduction per week of delay`;

describe.skipIf(!adminUrl || !appUrl)("opportunity ingestion", () => {
  let admin: postgres.Sql;
  let svc: typeof import("./opportunities");
  let closeDb: () => Promise<void>;

  beforeAll(async () => {
    if (!adminUrl) throw new Error("ADMIN_DATABASE_URL required");
    process.env.AI_EXTRACTION_PROVIDER = "fake";
    process.env.AI_EMBEDDING_PROVIDER = "fake";
    process.env.AI_PROVIDER_TIMEOUT_MS = "200";

    admin = postgres(adminUrl);
    await admin`INSERT INTO user_profiles (supabase_user_id, role, federation_id, display_name)
      VALUES (${SOCIAL_WORKER}, 'social_worker', ${FEDERATION}, 'SW Ingestion Test')
      ON CONFLICT (supabase_user_id) DO NOTHING`;

    svc = await import("./opportunities");
    ({ closeDb } = await import("../db/client"));
  });

  afterAll(async () => {
    if (closeDb) await closeDb();
    if (admin) await admin.end();
  });

  it("a complete document produces a fully cited summary", async () => {
    const created = await svc.ingestOpportunityDocument(SOCIAL_WORKER, {
      documentText: COMPLETE_TENDER,
      metadata: { title: "Tender 42/2026", source: "portal" },
    });

    expect(created.needsManualEntry).toBe(false);
    expect(created.summary).not.toBeNull();
    expect(created.deadline).toBe("2026-12-15");

    // Every non-null summary field carries a citation.
    const summary = created.summary;
    if (!summary) throw new Error("summary missing");
    const cited = new Set(summary.sourceCitations.map((c) => c.field));
    for (const [field, value] of Object.entries(summary)) {
      if (field === "sourceCitations") continue;
      const absent =
        value === null || (Array.isArray(value) && value.length === 0);
      if (!absent) expect(cited, `field ${field}`).toContain(field);
    }

    // And the row was written with summary + embedding.
    const rows =
      await admin`SELECT summary IS NOT NULL AS has_summary, embedding IS NOT NULL AS has_embedding, needs_manual_entry FROM opportunities WHERE id = ${created.id}`;
    expect(rows[0]).toMatchObject({
      has_summary: true,
      has_embedding: true,
      needs_manual_entry: false,
    });
  });

  it("a document missing payment terms produces needs_manual_entry and no summary", async () => {
    const withoutPaymentTerms = COMPLETE_TENDER.split("\n")
      .filter((line) => !line.startsWith("Payment terms:"))
      .join("\n");

    const created = await svc.ingestOpportunityDocument(SOCIAL_WORKER, {
      documentText: withoutPaymentTerms,
      metadata: { title: "Tender missing payment terms" },
    });

    expect(created.needsManualEntry).toBe(true);
    expect(created.summary).toBeNull();

    const rows =
      await admin`SELECT summary, needs_manual_entry FROM opportunities WHERE id = ${created.id}`;
    expect(rows[0]).toMatchObject({ summary: null, needs_manual_entry: true });
  });

  it("a provider timeout produces the same fail-closed row, not a partial write", async () => {
    const before =
      await admin`SELECT count(*)::int AS n FROM opportunities`;

    const created = await svc.ingestOpportunityDocument(SOCIAL_WORKER, {
      documentText: `[[simulate-slow-provider]]\n${COMPLETE_TENDER}`,
      metadata: { title: "Tender behind a slow provider" },
    });

    expect(created.needsManualEntry).toBe(true);
    expect(created.summary).toBeNull();

    // Exactly one row came out of the call, and it has no summary and no
    // embedding — nothing partial was written anywhere.
    const after = await admin`SELECT count(*)::int AS n FROM opportunities`;
    expect(Number(after[0]?.n)).toBe(Number(before[0]?.n) + 1);
    const rows =
      await admin`SELECT summary, embedding, needs_manual_entry FROM opportunities WHERE id = ${created.id}`;
    expect(rows[0]).toMatchObject({
      summary: null,
      embedding: null,
      needs_manual_entry: true,
    });
  });
});
