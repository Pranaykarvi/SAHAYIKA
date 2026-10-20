import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

import type {
  CapacityItem,
  Certification,
} from "../../validation/capability-profiles";
import { EMBEDDING_DIMENSIONS } from "../../validation/embedding";
import { selfHelpGroups } from "./self-help-groups";

// group_id is UNIQUE by design: one capability profile per group, because
// capability is group-level, never individual-level (invariant 4).
// embedding is nullable — a profile exists as soon as it is captured, and the
// embedding pipeline fills it in later (embedding_updated_at says when).
export const capabilityProfiles = pgTable(
  "capability_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .unique()
      .references(() => selfHelpGroups.id),
    skills: text("skills").array().notNull(),
    certifications: jsonb("certifications")
      .$type<Certification[]>()
      .notNull(),
    capacity: jsonb("capacity").$type<CapacityItem[]>().notNull(),
    equipment: text("equipment").array().notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    embeddingUpdatedAt: timestamp("embedding_updated_at", {
      withTimezone: true,
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    isSynthetic: boolean("is_synthetic").notNull().default(false),
  },
  (table) => [
    index("capability_profiles_embedding_hnsw_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);
