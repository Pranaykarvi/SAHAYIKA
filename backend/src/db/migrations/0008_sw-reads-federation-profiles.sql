-- Backs up decision attribution in the dashboard's match history: a social
-- worker may read the profiles (display names) of bookkeepers whose group is
-- in their federation — and nothing else. Writes stay admin-only; the own-row
-- and admin policies from 0001 are unchanged.
CREATE POLICY user_profiles_select_federation ON user_profiles FOR SELECT
USING (
  app_role() = 'social_worker'
  AND group_id IS NOT NULL
  AND app_can_access_group(group_id)
);
