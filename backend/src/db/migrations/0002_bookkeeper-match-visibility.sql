-- The bookkeeper surface (GET /groups/:id/matches) returns matches with
-- status 'verified' — the 0001 policy only opened 'presented' and later, so
-- RLS (which wins) would have blanked the endpoint. 'verified' is only ever
-- set after an approved verification exists, and the verification-guard
-- trigger still gates the move to 'presented', so invariant 1 holds: nothing
-- a group can see predates its verification.
-- Backs up listVerifiedMatchesForGroup's pinned status filter.
DROP POLICY "matches_select" ON "matches";--> statement-breakpoint
CREATE POLICY "matches_select" ON "matches" FOR SELECT
USING (
  app_is_admin()
  OR (app_role() = 'social_worker' AND app_can_access_group(group_id))
  OR (app_role() = 'bookkeeper' AND app_can_access_group(group_id)
      AND status IN ('verified', 'presented', 'accepted', 'declined', 'completed'))
);
