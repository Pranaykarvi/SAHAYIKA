import { boolean, date, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { selfHelpGroups } from "./self-help-groups";

// No address column (invariant 5 — location lives on the group at village
// granularity). No government ID number and no biometric columns (invariant
// 6). These are not omissions to fix later; do not add them.
export const members = pgTable("members", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => selfHelpGroups.id),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  preferredLanguage: text("preferred_language").notNull(),
  joinedOn: date("joined_on").notNull(),
  isSynthetic: boolean("is_synthetic").notNull().default(false),
});
