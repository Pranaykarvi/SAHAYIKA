import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { GROUP_DECISIONS } from "../../validation/group-decisions";
import { matches } from "./matches";

export const groupDecisionEnum = pgEnum(
  "group_decision",
  GROUP_DECISIONS,
);

// match_id is UNIQUE: the group decides once per match. The decision is
// always the group's own (invariant: AI proposes, humans decide).
export const groupDecisions = pgTable("group_decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  matchId: uuid("match_id")
    .notNull()
    .unique()
    .references(() => matches.id),
  decision: groupDecisionEnum("decision").notNull(),
  recordedBy: uuid("recorded_by").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  note: text("note"),
});
