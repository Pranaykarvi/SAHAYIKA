import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../db/schema";
import { embed } from "../lib/ai";
import { logger } from "../lib/logger";
import { renderForEmbedding } from "../lib/opportunities/renderForEmbedding";
import {
  opportunitySummarySchema,
  type OpportunitySummary,
  type SourceCitation,
} from "../validation/opportunities";
import {
  FEDERATION_ID,
  GROUPS,
  groupId,
  OPPORTUNITIES,
  opportunityId,
  profileText,
  SEED_BOOKKEEPER_ID,
  SEED_SOCIAL_WORKER_ID,
  SEED_STATE,
  seedId,
  type OpportunityDef,
} from "./fixtures";
import { buildLedgerRows } from "./ledger";

// Builds the fully cited summary for a synthetic opportunity. Every non-null
// field cites the page and exact quoted line of the (invented) document —
// the same rule the ingestion pipeline enforces applies to seed data.
function buildSummary(def: OpportunityDef, deadline: string): OpportunitySummary {
  const citations: SourceCitation[] = [
    { field: "whatIsBeingBought", page: 1, quotedText: `What is being bought: ${def.what}` },
    { field: "quantity", page: 1, quotedText: `Quantity: ${def.qtyAmount} ${def.qtyUnit}` },
    { field: "deadline", page: 1, quotedText: `Deadline: ${deadline}` },
    { field: "eligibility", page: 2, quotedText: `Eligibility: ${def.eligibility.join("; ")}` },
    { field: "paymentTerms", page: 2, quotedText: `Payment terms: ${def.payment}` },
  ];
  if (def.quality) {
    citations.push({ field: "qualitySpec", page: 2, quotedText: `Quality specification: ${def.quality}` });
  }
  if (def.penalties) {
    citations.push({ field: "penalties", page: 2, quotedText: `Penalties: ${def.penalties}` });
  }
  return opportunitySummarySchema.parse({
    whatIsBeingBought: def.what,
    quantity: { amount: def.qtyAmount, unit: def.qtyUnit },
    qualitySpec: def.quality,
    deadline,
    eligibility: def.eligibility,
    paymentTerms: def.payment,
    penalties: def.penalties,
    sourceCitations: citations,
  });
}

function isoDaysFromNow(days: number, now: Date): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

async function seedAll(db: ReturnType<typeof drizzle<typeof schema>>): Promise<Record<string, number>> {
  const now = new Date();
  const summaries = OPPORTUNITIES.map((def) =>
    buildSummary(
      def,
      def.pastDeadline ?? isoDaysFromNow(def.deadlineDaysFromNow ?? 60, now),
    ),
  );

  // Embeddings via the configured provider (vendor-neutral slot; "fake" works
  // offline). Profiles embed their capability text, opportunities embed the
  // one canonical rendering.
  const profileVectors = await embed(GROUPS.map(profileText));
  const opportunityVectors = await embed(summaries.map(renderForEmbedding));

  const inserted: Record<string, number> = {};
  const count = (key: string, rows: unknown[]) => {
    inserted[key] = (inserted[key] ?? 0) + rows.length;
  };

  // Groups first: the demo bookkeeper's profile references group 1.
  count(
    "self_help_groups",
    await db
      .insert(schema.selfHelpGroups)
      .values(
        GROUPS.map((group) => ({
          id: groupId(group.index),
          name: `[SYNTHETIC] ${group.name}`,
          federationId: FEDERATION_ID,
          village: group.village,
          district: group.district,
          state: SEED_STATE,
          formedOn: group.formedOn,
          consentStatus: "active" as const,
          isSynthetic: true,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: schema.selfHelpGroups.id }),
  );

  // user_profiles has no is_synthetic column; the display names carry the
  // marker instead so no synthetic account can read as a real person.
  count(
    "user_profiles",
    await db
      .insert(schema.userProfiles)
      .values([
        {
          supabaseUserId: SEED_SOCIAL_WORKER_ID,
          role: "social_worker",
          federationId: FEDERATION_ID,
          displayName: "[SYNTHETIC] Demo Social Worker",
        },
        {
          supabaseUserId: SEED_BOOKKEEPER_ID,
          role: "bookkeeper",
          groupId: groupId(1),
          displayName: "[SYNTHETIC] Demo Bookkeeper (Asha Tailoring)",
        },
      ])
      .onConflictDoNothing()
      .returning({ id: schema.userProfiles.supabaseUserId }),
  );

  count(
    "capability_profiles",
    await db
      .insert(schema.capabilityProfiles)
      .values(
        GROUPS.map((group, i) => ({
          id: seedId(2, group.index),
          groupId: groupId(group.index),
          skills: group.skills,
          certifications: [],
          capacity: [
            {
              product: group.product,
              unitsPerMonth: group.unitsPerMonth,
              minLeadTimeDays: group.minLeadTimeDays,
            },
          ],
          equipment: group.equipment,
          embedding: profileVectors[i] ?? null,
          embeddingUpdatedAt: now,
          isSynthetic: true,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: schema.capabilityProfiles.id }),
  );

  count(
    "opportunities",
    await db
      .insert(schema.opportunities)
      .values(
        OPPORTUNITIES.map((def, i) => {
          const summary = summaries[i];
          if (!summary) throw new Error("summary missing");
          return {
            id: opportunityId(def.index),
            source: "seed" as const,
            title: def.title,
            summary,
            documentRef: `synthetic://demo/opportunity/${def.index}`,
            deadline: summary.deadline,
            sizeClass: def.sizeClass,
            embedding: opportunityVectors[i] ?? null,
            needsManualEntry: false,
            isSynthetic: true,
          };
        }),
      )
      .onConflictDoNothing()
      .returning({ id: schema.opportunities.id }),
  );

  count(
    "ledger_entries",
    await db
      .insert(schema.ledgerEntries)
      .values(GROUPS.flatMap((group) => buildLedgerRows(group, now)))
      .onConflictDoNothing()
      .returning({ id: schema.ledgerEntries.id }),
  );

  // Historical delivered matches (track record), each with its approved
  // verification and the group's recorded decision — invariants hold even
  // for synthetic history.
  const delivered = OPPORTUNITIES.filter((def) => def.completedBy !== undefined);
  count(
    "matches_completed",
    await db
      .insert(schema.matches)
      .values(
        delivered.map((def) => ({
          id: seedId(4, def.index),
          groupId: groupId(def.completedBy ?? 0),
          opportunityId: opportunityId(def.index),
          score: "0.6500",
          reasons: [
            {
              signal: "similarity",
              contribution: 0.3,
              explanation:
                "Synthetic historical match seeded to give this group a delivery track record.",
            },
          ],
          readinessBand: "ready" as const,
          status: "completed" as const,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: schema.matches.id }),
  );
  count(
    "verification_records",
    await db
      .insert(schema.verificationRecords)
      .values(
        delivered.map((def) => ({
          id: seedId(5, def.index),
          matchId: seedId(4, def.index),
          socialWorkerId: SEED_SOCIAL_WORKER_ID,
          decision: "approved" as const,
          rationale:
            "Synthetic historical verification seeded for demonstration data.",
        })),
      )
      .onConflictDoNothing()
      .returning({ id: schema.verificationRecords.id }),
  );
  count(
    "group_decisions",
    await db
      .insert(schema.groupDecisions)
      .values(
        delivered.map((def) => ({
          id: seedId(6, def.index),
          matchId: seedId(4, def.index),
          decision: "accepted" as const,
          recordedBy: SEED_BOOKKEEPER_ID,
          note: "Synthetic historical decision seeded for demonstration data.",
        })),
      )
      .onConflictDoNothing()
      .returning({ id: schema.groupDecisions.id }),
  );

  return inserted;
}

async function main(): Promise<void> {
  // Seeding writes as the table owner: it creates cross-federation fixtures,
  // which is an administrative act, not a user action.
  const url = process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("ADMIN_DATABASE_URL (or DATABASE_URL) must be set to seed");
  }
  const client = postgres(url);
  try {
    const inserted = await seedAll(drizzle(client, { schema }));
    logger.info({ inserted }, "seed complete (zero counts mean already seeded)");
  } finally {
    // Always release the connection, or a failed seed hangs the process.
    await client.end();
  }
}

main().catch((err) => {
  const cause = err instanceof Error ? err.cause : undefined;
  logger.error(
    {
      err: err instanceof Error ? err.message : err,
      cause: cause instanceof Error ? cause.message : cause,
    },
    "seed failed",
  );
  process.exitCode = 1;
});
