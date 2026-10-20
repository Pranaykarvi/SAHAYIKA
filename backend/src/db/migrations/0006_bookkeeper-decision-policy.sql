-- Backs up the stage-6 group-decision flow: a bookkeeper recording their
-- group's decision moves the match verified -> presented -> accepted/declined.
-- The 0001 policies only let social workers update matches, which would block
-- that flow at the database. This policy admits exactly those transitions for
-- the group's own bookkeeper: the old row must be 'verified' or 'presented'
-- (USING) and the new row 'presented', 'accepted', or 'declined' (WITH
-- CHECK). The invariant-1 trigger still guards the move to 'presented', so a
-- bookkeeper cannot shortcut an unverified match through this policy.
CREATE POLICY matches_update_bookkeeper_decision ON matches FOR UPDATE
USING (
  app_role() = 'bookkeeper'
  AND app_can_access_group(group_id)
  AND status IN ('verified', 'presented')
)
WITH CHECK (
  app_role() = 'bookkeeper'
  AND app_can_access_group(group_id)
  AND status IN ('presented', 'accepted', 'declined')
);
