import {
  boolean,
  date,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

import { EMBEDDING_DIMENSIONS } from "../../validation/embedding";
import type { OpportunitySummary } from "../../validation/opportunities";
import {
  OPPORTUNITY_SOURCES,
  SIZE_CLASSES,
} from "../../validation/opportunities";

export const opportunitySourceEnum = pgEnum(
  "opportunity_source",
  OPPORTUNITY_SOURCES,
);

export const sizeClassEnum = pgEnum("size_class", SIZE_CLASSES);

// embedding is nullable for the same reason as capability_profiles: rows
// ingested with needs_manual_entry (or awaiting the embedding pipeline) exist
// before their vector does. summary, deadline, and size_class are nullable
// for the same lifecycle reason: when extraction fails closed, the row is
// written with needs_manual_entry = true and NO summary — never a partial
// one — and a human completes it later.
export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: opportunitySourceEnum("source").notNull(),
    title: text("title").notNull(),
    summary: jsonb("summary").$type<OpportunitySummary>(),
    documentRef: text("document_ref"),
    deadline: date("deadline"),
    sizeClass: sizeClassEnum("size_class"),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    needsManualEntry: boolean("needs_manual_entry").notNull().default(false),
    isSynthetic: boolean("is_synthetic").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("opportunities_embedding_hnsw_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);
