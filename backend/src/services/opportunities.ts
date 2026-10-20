import { and, desc, eq, gte, lte } from "drizzle-orm";

import { embed, extractStructured } from "../lib/ai";
import { runAsUser } from "../db/client";
import { opportunities } from "../db/schema";
import { NotFoundError } from "../lib/errors";
import { logger } from "../lib/logger";
import { renderForEmbedding } from "../lib/opportunities/renderForEmbedding";
import {
  opportunitySummarySchema,
  type OpportunityCreateRequest,
  type OpportunityIngestRequest,
  type OpportunityListQuery,
  type OpportunityResponse,
  type OpportunitySummary,
} from "../validation/opportunities";

const EXTRACTION_INSTRUCTION = `You are extracting a procurement opportunity (tender, purchase order, training offer) from a document, for review by a professional social worker supporting rural Self-Help Groups.

Rules, all of them strict:
- Extract only what the document states. Never infer, improve, or soften anything — a misread penalty clause or an invented lenient deadline creates real contractual exposure for people with no legal support.
- Every non-null field must have an entry in sourceCitations giving the page number and the exact text it came from, quoted verbatim from the document.
- qualitySpec and penalties may be null ONLY when the document genuinely does not state them; null fields need no citation.
- deadline must be an ISO date (YYYY-MM-DD) stated in the document.
- If a required fact (what is being bought, quantity, deadline, payment terms) cannot be found verbatim, do not guess — leave the output non-conforming so it is rejected and routed to manual entry.`;

type OpportunityRow = typeof opportunities.$inferSelect;

function toResponse(row: OpportunityRow): OpportunityResponse {
  return {
    id: row.id,
    source: row.source,
    title: row.title,
    summary: row.summary,
    documentRef: row.documentRef,
    deadline: row.deadline,
    sizeClass: row.sizeClass,
    needsManualEntry: row.needsManualEntry,
    isSynthetic: row.isSynthetic,
    createdAt: row.createdAt.toISOString(),
  };
}

// The embedding is a nullable pipeline field: if the provider fails here the
// row is still written complete-and-consistent with embedding = null, to be
// retried later. This is unlike the summary, which is never written partial.
async function embedSummaryOrNull(
  summary: OpportunitySummary,
): Promise<number[] | null> {
  try {
    const [vector] = await embed([renderForEmbedding(summary)]);
    return vector ?? null;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : err },
      "embedding failed; storing opportunity without embedding",
    );
    return null;
  }
}

export async function ingestOpportunityDocument(
  requestingUserId: string,
  input: OpportunityIngestRequest,
): Promise<OpportunityResponse> {
  let summary: OpportunitySummary | null = null;
  try {
    summary = await extractStructured(
      input.documentText,
      opportunitySummarySchema,
      EXTRACTION_INSTRUCTION,
    );
  } catch (err) {
    // Fail closed. A provider timeout, a malformed response, and a summary
    // with an uncited field all land here, and all get the same treatment:
    // needs_manual_entry = true and NO summary. A partial summary is worse
    // than none — see the citation rule in validation/opportunities.ts.
    logger.warn(
      { err: err instanceof Error ? err.message : err },
      "extraction failed closed; writing needs_manual_entry row",
    );
  }

  const embedding = summary ? await embedSummaryOrNull(summary) : null;
  const rows = await runAsUser(requestingUserId, (tx) =>
    tx
      .insert(opportunities)
      .values({
        source: input.metadata?.source ?? "manual",
        title:
          input.metadata?.title ??
          summary?.whatIsBeingBought ??
          "Ingested document awaiting manual entry",
        summary,
        documentRef: input.metadata?.documentRef ?? null,
        deadline: summary?.deadline ?? input.metadata?.deadline ?? null,
        sizeClass: null,
        embedding,
        needsManualEntry: summary === null,
      })
      .returning(),
  );
  const row = rows[0];
  if (!row) throw new Error("opportunity insert returned no row");
  return toResponse(row);
}

export async function createOpportunity(
  requestingUserId: string,
  input: OpportunityCreateRequest,
): Promise<OpportunityResponse> {
  const embedding = await embedSummaryOrNull(input.summary);
  const rows = await runAsUser(requestingUserId, (tx) =>
    tx
      .insert(opportunities)
      .values({
        source: input.source,
        title: input.title,
        summary: input.summary,
        documentRef: input.documentRef ?? null,
        // Single source of truth: the row deadline IS the summary deadline.
        deadline: input.summary.deadline,
        sizeClass: input.sizeClass,
        embedding,
        needsManualEntry: false,
      })
      .returning(),
  );
  const row = rows[0];
  if (!row) throw new Error("opportunity insert returned no row");
  return toResponse(row);
}

export async function listOpportunities(
  requestingUserId: string,
  filter: OpportunityListQuery,
): Promise<OpportunityResponse[]> {
  const rows = await runAsUser(requestingUserId, (tx) => {
    const conditions = [];
    if (filter.deadlineBefore) {
      conditions.push(lte(opportunities.deadline, filter.deadlineBefore));
    }
    if (filter.deadlineAfter) {
      conditions.push(gte(opportunities.deadline, filter.deadlineAfter));
    }
    return tx
      .select()
      .from(opportunities)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(opportunities.createdAt));
  });
  return rows.map(toResponse);
}

export async function getOpportunity(
  requestingUserId: string,
  opportunityId: string,
): Promise<OpportunityResponse> {
  const rows = await runAsUser(requestingUserId, (tx) =>
    tx
      .select()
      .from(opportunities)
      .where(eq(opportunities.id, opportunityId))
      .limit(1),
  );
  const row = rows[0];
  if (!row) throw new NotFoundError("opportunity not found");
  return toResponse(row);
}
