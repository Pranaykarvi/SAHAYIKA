import { sql } from "drizzle-orm";

import type { DbTx } from "../../db/client";
import type { CapacityItem } from "../../validation/capability-profiles";

export interface RetrievedCandidate {
  groupId: string;
  groupName: string;
  village: string;
  district: string;
  state: string;
  formedOn: string;
  capacity: CapacityItem[];
  // Raw cosine similarity in [-1, 1]; downstream stages clamp as needed.
  similarity: number;
}

export const DEFAULT_RETRIEVAL_LIMIT = 20;

// The ONE raw SQL query outside migrations (CLAUDE.md allows exactly this
// function). Drizzle's query builder has no first-class pgvector operators:
// the `<=>` cosine-distance expression must appear verbatim in ORDER BY for
// Postgres to walk the HNSW index instead of scanning every profile, and the
// same expression yields the similarity we return. Rather than scatter sql``
// fragments through builder calls, the whole statement lives here, named and
// commented.
//
// Guards built into the query itself:
// - consent: a group whose consent_status is not 'active' is never retrieved,
//   no matter how similar (suspension/revocation means exactly that).
// - profiles without an embedding are skipped (the pipeline has not reached
//   them; they are not silently zero-similarity).
// - groups already matched to this opportunity are skipped — a re-run must
//   not produce duplicate proposals.
// Row-level security still applies on top: this runs as the requesting
// user's RLS context, so a social worker only ever retrieves groups of
// their own federation.
export async function retrieveCandidatesBySimilarity(
  tx: DbTx,
  queryEmbedding: number[],
  opportunityId: string,
  limit: number = DEFAULT_RETRIEVAL_LIMIT,
): Promise<RetrievedCandidate[]> {
  const vector = `[${queryEmbedding.join(",")}]`;
  const rows = (await tx.execute(sql`
    SELECT
      g.id          AS group_id,
      g.name        AS group_name,
      g.village     AS village,
      g.district    AS district,
      g.state       AS state,
      g.formed_on   AS formed_on,
      cp.capacity   AS capacity,
      1 - (cp.embedding <=> ${vector}::vector) AS similarity
    FROM capability_profiles cp
    JOIN self_help_groups g ON g.id = cp.group_id
    WHERE cp.embedding IS NOT NULL
      AND g.consent_status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM matches m
        WHERE m.group_id = g.id AND m.opportunity_id = ${opportunityId}
      )
    ORDER BY cp.embedding <=> ${vector}::vector
    LIMIT ${limit}
  `)) as unknown as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    groupId: String(row.group_id),
    groupName: String(row.group_name),
    village: String(row.village),
    district: String(row.district),
    state: String(row.state),
    formedOn: String(row.formed_on),
    // Raw execute() bypasses the query builder's column parsers, so jsonb
    // arrives as a JSON string here.
    capacity: (typeof row.capacity === "string"
      ? JSON.parse(row.capacity)
      : (row.capacity ?? [])) as CapacityItem[],
    similarity: Number(row.similarity),
  }));
}
