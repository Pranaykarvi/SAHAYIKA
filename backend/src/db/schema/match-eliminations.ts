import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { opportunities } from "./opportunities";
import { selfHelpGroups } from "./self-help-groups";

// What the hard filters removed, and why — persisted so the dashboard can
// show a social worker every candidate that was eliminated, not just the
// survivors. reason_code values are defined in validation/match-eliminations
// (kept as text here so adding a filter does not need an enum migration).
export const matchEliminations = pgTable("match_eliminations", {
  id: uuid("id").primaryKey().defaultRandom(),
  opportunityId: uuid("opportunity_id")
    .notNull()
    .references(() => opportunities.id),
  groupId: uuid("group_id")
    .notNull()
    .references(() => selfHelpGroups.id),
  reasonCode: text("reason_code").notNull(),
  explanation: text("explanation").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
