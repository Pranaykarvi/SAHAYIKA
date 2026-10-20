import { sql } from "drizzle-orm";
import {
  check,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import type { MatchReason } from "../../validation/matches";
import { MATCH_STATUSES, READINESS_BANDS } from "../../validation/matches";
import { opportunities } from "./opportunities";
import { selfHelpGroups } from "./self-help-groups";

export const readinessBandEnum = pgEnum("readiness_band", READINESS_BANDS);

export const matchStatusEnum = pgEnum("match_status", MATCH_STATUSES);

// reasons is NOT NULL: a match that cannot explain itself is a bug, not a
// degraded result (invariant 3).
// readiness_override is a separate column from readiness_band so the
// automated band is never destroyed when a social worker disagrees with it,
// and the CHECK below makes an override without a reason impossible
// (invariant 2).
// The guard that blocks status -> 'presented' without an approved
// verification lives in the migration SQL as a trigger (invariant 1).
export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => selfHelpGroups.id),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunities.id),
    score: numeric("score").notNull(),
    reasons: jsonb("reasons").$type<MatchReason[]>().notNull(),
    readinessBand: readinessBandEnum("readiness_band").notNull(),
    readinessOverride: readinessBandEnum("readiness_override"),
    readinessOverrideReason: text("readiness_override_reason"),
    status: matchStatusEnum("status").notNull().default("proposed"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("matches_group_id_opportunity_id_unique").on(
      table.groupId,
      table.opportunityId,
    ),
    check(
      "matches_override_requires_reason",
      sql`${table.readinessOverride} IS NULL OR ${table.readinessOverrideReason} IS NOT NULL`,
    ),
  ],
);
