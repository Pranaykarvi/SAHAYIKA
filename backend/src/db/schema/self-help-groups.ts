import {
  boolean,
  date,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { CONSENT_STATUSES } from "../../validation/self-help-groups";

export const consentStatusEnum = pgEnum("consent_status", CONSENT_STATUSES);

// Location is village/district/state only (invariant 5): no GPS coordinates,
// no address columns. bookkeeper_member_id is a plain uuid, not a foreign
// key, to avoid a circular reference with members.group_id.
export const selfHelpGroups = pgTable("self_help_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  federationId: uuid("federation_id").notNull(),
  village: text("village").notNull(),
  district: text("district").notNull(),
  state: text("state").notNull(),
  formedOn: date("formed_on").notNull(),
  bookkeeperMemberId: uuid("bookkeeper_member_id"),
  consentStatus: consentStatusEnum("consent_status")
    .notNull()
    .default("active"),
  isSynthetic: boolean("is_synthetic").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
