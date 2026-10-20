import { sql } from "drizzle-orm";
import { check, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { USER_ROLES } from "../../validation/user-profiles";
import { selfHelpGroups } from "./self-help-groups";

export const userRoleEnum = pgEnum("user_role", USER_ROLES);

// The primary key IS the Supabase Auth user id — the backend never issues
// identities, it only attaches a role and a scope to one that Supabase
// verified. The CHECK pins the role/scope shape: a social worker has a
// federation, a bookkeeper has a group, an admin has neither.
export const userProfiles = pgTable(
  "user_profiles",
  {
    supabaseUserId: uuid("supabase_user_id").primaryKey(),
    role: userRoleEnum("role").notNull(),
    federationId: uuid("federation_id"),
    groupId: uuid("group_id").references(() => selfHelpGroups.id),
    displayName: text("display_name").notNull(),
  },
  (table) => [
    check(
      "user_profiles_role_shape",
      sql`(${table.role} = 'social_worker' AND ${table.federationId} IS NOT NULL AND ${table.groupId} IS NULL)
        OR (${table.role} = 'bookkeeper' AND ${table.groupId} IS NOT NULL AND ${table.federationId} IS NULL)
        OR (${table.role} = 'admin' AND ${table.federationId} IS NULL AND ${table.groupId} IS NULL)`,
    ),
  ],
);
