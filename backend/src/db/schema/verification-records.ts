import { sql } from "drizzle-orm";
import {
  check,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { VERIFICATION_DECISIONS } from "../../validation/verification-records";
import { matches } from "./matches";

export const verificationDecisionEnum = pgEnum(
  "verification_decision",
  VERIFICATION_DECISIONS,
);

// match_id is UNIQUE: one verification per match. rationale is NOT NULL and
// CHECKed to be substantive — a decision without a reason is not a decision
// (invariant 2).
export const verificationRecords = pgTable(
  "verification_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .notNull()
      .unique()
      .references(() => matches.id),
    socialWorkerId: uuid("social_worker_id").notNull(),
    decision: verificationDecisionEnum("decision").notNull(),
    rationale: text("rationale").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "verification_records_rationale_min_length",
      sql`char_length(${table.rationale}) >= 10`,
    ),
  ],
);
