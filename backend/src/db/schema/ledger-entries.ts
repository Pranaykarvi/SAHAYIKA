import {
  boolean,
  date,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { LEDGER_KINDS } from "../../validation/ledger-entries";
import { members } from "./members";
import { selfHelpGroups } from "./self-help-groups";

export const ledgerKindEnum = pgEnum("ledger_kind", LEDGER_KINDS);

// Append-only: a trigger in the migration SQL rejects UPDATE and DELETE.
// Corrections insert a reversing entry pointing at the original via
// reverses_entry_id (a self-reference), so the book never lies about what
// was once recorded.
export const ledgerEntries = pgTable("ledger_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => selfHelpGroups.id),
  memberId: uuid("member_id").references(() => members.id),
  kind: ledgerKindEnum("kind").notNull(),
  amount: numeric("amount").notNull(),
  entryDate: date("entry_date").notNull(),
  recordedBy: uuid("recorded_by").notNull(),
  reversesEntryId: uuid("reverses_entry_id").references(
    (): AnyPgColumn => ledgerEntries.id,
  ),
  // Free-text context; a reversal records its reason here.
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  isSynthetic: boolean("is_synthetic").notNull().default(false),
});
