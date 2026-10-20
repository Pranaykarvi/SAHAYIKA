CREATE TYPE "public"."user_role" AS ENUM('social_worker', 'bookkeeper', 'admin');--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"supabase_user_id" uuid PRIMARY KEY NOT NULL,
	"role" "user_role" NOT NULL,
	"federation_id" uuid,
	"group_id" uuid,
	"display_name" text NOT NULL,
	CONSTRAINT "user_profiles_role_shape" CHECK (("user_profiles"."role" = 'social_worker' AND "user_profiles"."federation_id" IS NOT NULL AND "user_profiles"."group_id" IS NULL)
        OR ("user_profiles"."role" = 'bookkeeper' AND "user_profiles"."group_id" IS NOT NULL AND "user_profiles"."federation_id" IS NULL)
        OR ("user_profiles"."role" = 'admin' AND "user_profiles"."federation_id" IS NULL AND "user_profiles"."group_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_group_id_self_help_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."self_help_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ============================================================================
-- Row-level security.
-- The application sets app.current_user_id (transaction-local, via
-- set_config) for every query it runs on behalf of a user; these policies
-- read it. The app connects as the non-owner role sahayika_app, so the
-- policies actually apply. Where an application check and a policy disagree,
-- the policy wins — RLS is the floor under the middleware, not a mirror of it.
-- ============================================================================
CREATE FUNCTION app_current_user_id() RETURNS uuid
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT nullif(current_setting('app.current_user_id', true), '')::uuid
$$;--> statement-breakpoint
-- SECURITY DEFINER so policy evaluation can read user_profiles without
-- recursing into user_profiles' own policies.
CREATE FUNCTION app_role() RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT role FROM user_profiles WHERE supabase_user_id = app_current_user_id()
$$;--> statement-breakpoint
CREATE FUNCTION app_federation_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT federation_id FROM user_profiles WHERE supabase_user_id = app_current_user_id()
$$;--> statement-breakpoint
CREATE FUNCTION app_is_admin() RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(app_role() = 'admin', false)
$$;--> statement-breakpoint
-- The scoping rule of the whole system, in one place: admin sees everything,
-- a bookkeeper sees their own group, a social worker sees groups in their
-- federation. Backs up requireGroupAccess in Express.
CREATE FUNCTION app_can_access_group(gid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce((
    SELECT CASE
      WHEN up.role = 'admin' THEN true
      WHEN up.role = 'bookkeeper' THEN up.group_id = gid
      WHEN up.role = 'social_worker' THEN up.federation_id =
        (SELECT g.federation_id FROM self_help_groups g WHERE g.id = gid)
    END
    FROM user_profiles up
    WHERE up.supabase_user_id = app_current_user_id()
  ), false)
$$;--> statement-breakpoint
CREATE FUNCTION app_can_access_match(mid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(
    (SELECT app_can_access_group(m.group_id) FROM matches m WHERE m.id = mid),
    false)
$$;--> statement-breakpoint
-- The application role. No password here (never a secret in a migration):
-- set it operationally with ALTER ROLE sahayika_app LOGIN PASSWORD '...'.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sahayika_app') THEN
    CREATE ROLE sahayika_app LOGIN;
  END IF;
END
$$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO sahayika_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON self_help_groups, members, capability_profiles, opportunities, matches, verification_records, group_decisions, user_profiles TO sahayika_app;--> statement-breakpoint
-- No UPDATE or DELETE grant on the ledger: append-only at the grant layer
-- too, under the trigger that already rejects both.
GRANT SELECT, INSERT ON ledger_entries TO sahayika_app;--> statement-breakpoint
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE self_help_groups ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE members ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE capability_profiles ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE verification_records ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE group_decisions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Backs up requireAuth's profile load: a user reads exactly their own row.
CREATE POLICY user_profiles_select_own ON user_profiles FOR SELECT
USING (supabase_user_id = app_current_user_id());--> statement-breakpoint
-- Backs up "no sign-up endpoint; an administrator creates accounts":
-- only an admin can create, change, or remove profiles.
CREATE POLICY user_profiles_admin_manage ON user_profiles FOR ALL
USING (app_is_admin()) WITH CHECK (app_is_admin());--> statement-breakpoint
-- Backs up requireGroupAccess('groupId'): a group row is visible only to its
-- own bookkeeper, its federation's social workers, and admins.
CREATE POLICY self_help_groups_select ON self_help_groups FOR SELECT
USING (app_can_access_group(id));--> statement-breakpoint
-- Backs up requireRole('social_worker','admin') on group management routes:
-- a social worker manages only groups of their own federation.
CREATE POLICY self_help_groups_insert ON self_help_groups FOR INSERT
WITH CHECK (app_is_admin() OR (app_role() = 'social_worker' AND federation_id = app_federation_id()));--> statement-breakpoint
CREATE POLICY self_help_groups_update ON self_help_groups FOR UPDATE
USING (app_is_admin() OR (app_role() = 'social_worker' AND federation_id = app_federation_id()))
WITH CHECK (app_is_admin() OR (app_role() = 'social_worker' AND federation_id = app_federation_id()));--> statement-breakpoint
CREATE POLICY self_help_groups_delete ON self_help_groups FOR DELETE
USING (app_is_admin());--> statement-breakpoint
-- Backs up requireGroupAccess on member routes: members are reachable only
-- through their group's scope.
CREATE POLICY members_by_group ON members FOR ALL
USING (app_can_access_group(group_id)) WITH CHECK (app_can_access_group(group_id));--> statement-breakpoint
-- Backs up requireGroupAccess on capability profile routes (and invariant 4:
-- the profile is group-level, so group scope is the only scope there is).
CREATE POLICY capability_profiles_by_group ON capability_profiles FOR ALL
USING (app_can_access_group(group_id)) WITH CHECK (app_can_access_group(group_id));--> statement-breakpoint
-- Backs up requireAuth on opportunity routes: opportunities are not
-- group-scoped; any provisioned account may read them.
CREATE POLICY opportunities_select ON opportunities FOR SELECT
USING (app_role() IS NOT NULL);--> statement-breakpoint
-- Backs up requireRole('social_worker','admin') on opportunity ingestion.
CREATE POLICY opportunities_write ON opportunities FOR INSERT
WITH CHECK (app_is_admin() OR app_role() = 'social_worker');--> statement-breakpoint
CREATE POLICY opportunities_update ON opportunities FOR UPDATE
USING (app_is_admin() OR app_role() = 'social_worker')
WITH CHECK (app_is_admin() OR app_role() = 'social_worker');--> statement-breakpoint
CREATE POLICY opportunities_delete ON opportunities FOR DELETE
USING (app_is_admin());--> statement-breakpoint
-- Backs up requireGroupAccess on match routes AND the service-layer rule for
-- invariant 1: a bookkeeper (the group's surface) can only ever read matches
-- that have passed verification and been presented — an unverified match is
-- invisible to the group even if every application check is bypassed.
CREATE POLICY matches_select ON matches FOR SELECT
USING (
  app_is_admin()
  OR (app_role() = 'social_worker' AND app_can_access_group(group_id))
  OR (app_role() = 'bookkeeper' AND app_can_access_group(group_id)
      AND status IN ('presented', 'accepted', 'declined', 'completed'))
);--> statement-breakpoint
-- Backs up requireRole('social_worker','admin') on match creation and review.
CREATE POLICY matches_insert ON matches FOR INSERT
WITH CHECK (app_is_admin() OR (app_role() = 'social_worker' AND app_can_access_group(group_id)));--> statement-breakpoint
CREATE POLICY matches_update ON matches FOR UPDATE
USING (app_is_admin() OR (app_role() = 'social_worker' AND app_can_access_group(group_id)))
WITH CHECK (app_is_admin() OR (app_role() = 'social_worker' AND app_can_access_group(group_id)));--> statement-breakpoint
CREATE POLICY matches_delete ON matches FOR DELETE
USING (app_is_admin());--> statement-breakpoint
-- Backs up requireGroupAccess (via the match's group) on verification reads.
CREATE POLICY verification_records_select ON verification_records FOR SELECT
USING (app_can_access_match(match_id));--> statement-breakpoint
-- Backs up requireRole('social_worker','admin') on verification writes: only
-- a social worker with access to the match's group records a decision.
CREATE POLICY verification_records_insert ON verification_records FOR INSERT
WITH CHECK (app_is_admin() OR (app_role() = 'social_worker' AND app_can_access_match(match_id)));--> statement-breakpoint
CREATE POLICY verification_records_update ON verification_records FOR UPDATE
USING (app_is_admin() OR (app_role() = 'social_worker' AND app_can_access_match(match_id)))
WITH CHECK (app_is_admin() OR (app_role() = 'social_worker' AND app_can_access_match(match_id)));--> statement-breakpoint
CREATE POLICY verification_records_delete ON verification_records FOR DELETE
USING (app_is_admin());--> statement-breakpoint
-- Backs up requireGroupAccess (via the match's group) on decision reads.
CREATE POLICY group_decisions_select ON group_decisions FOR SELECT
USING (app_can_access_match(match_id));--> statement-breakpoint
-- Backs up requireRole('bookkeeper') on recording the group's decision: the
-- decision belongs to the group, recorded by its bookkeeper (or an admin).
CREATE POLICY group_decisions_insert ON group_decisions FOR INSERT
WITH CHECK (app_is_admin() OR (app_role() = 'bookkeeper' AND app_can_access_match(match_id)));--> statement-breakpoint
CREATE POLICY group_decisions_update ON group_decisions FOR UPDATE
USING (app_is_admin()) WITH CHECK (app_is_admin());--> statement-breakpoint
CREATE POLICY group_decisions_delete ON group_decisions FOR DELETE
USING (app_is_admin());--> statement-breakpoint
-- Backs up requireGroupAccess('groupId') on ledger routes — the acceptance
-- case: a bookkeeper's query against another group's ledger returns nothing,
-- middleware or no middleware. No UPDATE/DELETE policies exist, matching the
-- append-only trigger and the withheld grants.
CREATE POLICY ledger_entries_select ON ledger_entries FOR SELECT
USING (app_can_access_group(group_id));--> statement-breakpoint
CREATE POLICY ledger_entries_insert ON ledger_entries FOR INSERT
WITH CHECK (app_can_access_group(group_id));