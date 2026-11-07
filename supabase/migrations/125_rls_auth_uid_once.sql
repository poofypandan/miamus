-- ============================================================================
-- 125 — Access rules ask "who is signed in?" once per query (Phase 157)
-- ============================================================================
-- Supabase's performance advisor (auth_rls_initplan, staging 2026-11-07):
-- fifteen row-level-security policies called auth.uid() as a plain
-- expression, which Postgres may evaluate again for every row it checks.
-- Wrapped as (select auth.uid()), it is evaluated once per query and reused.
-- Harmless at a few households; slow at thousands. docs/app-review-2026-11-07.md, R5.
--
-- NO BEHAVIOUR CHANGE. ALTER POLICY keeps each policy's name, command, roles
-- and permissive/restrictive setting; only the expressions are restated, each
-- generated from the live definition with auth.uid() wrapped and table and
-- function names schema-qualified. Who can see or change what is identical,
-- which supabase/tests/125_rls_auth_uid_once.sql checks on the tables involved.
-- ============================================================================

alter policy device_sessions_select_own on public.device_sessions
  using ((user_id = (select auth.uid())));
alter policy owner_delete_household_locations on public.household_locations
  using ((EXISTS ( SELECT 1
   FROM public.household_members m
  WHERE ((m.user_id = (select auth.uid())) AND (m.household_id = household_locations.household_id)))));
alter policy owner_insert_household_locations on public.household_locations
  with check ((EXISTS ( SELECT 1
   FROM public.household_members m
  WHERE ((m.user_id = (select auth.uid())) AND (m.household_id = household_locations.household_id)))));
alter policy owner_update_household_locations on public.household_locations
  using ((EXISTS ( SELECT 1
   FROM public.household_members m
  WHERE ((m.user_id = (select auth.uid())) AND (m.household_id = household_locations.household_id)))))
  with check ((EXISTS ( SELECT 1
   FROM public.household_members m
  WHERE ((m.user_id = (select auth.uid())) AND (m.household_id = household_locations.household_id)))));
alter policy members_select_own on public.household_members
  using (((select auth.uid()) = user_id));
alter policy households_select_own on public.households
  using (((id = ANY (public.get_user_household_ids())) OR (owner_auth_id = (select auth.uid()))));
alter policy leave_delete_admin on public.leave_requests
  using ((EXISTS ( SELECT 1
   FROM public.household_members m
  WHERE ((m.household_id = leave_requests.household_id) AND (m.user_id = (select auth.uid()))))));
alter policy leave_update_admin on public.leave_requests
  using ((EXISTS ( SELECT 1
   FROM public.household_members m
  WHERE ((m.household_id = leave_requests.household_id) AND (m.user_id = (select auth.uid()))))))
  with check (((EXISTS ( SELECT 1
   FROM public.household_members m
  WHERE ((m.household_id = leave_requests.household_id) AND (m.user_id = (select auth.uid()))))) AND ((fallback_assignee_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.staff_profiles s
  WHERE ((s.id = leave_requests.fallback_assignee_id) AND (s.household_id = leave_requests.household_id)))))));
alter policy owner_invites_insert_members on public.owner_invites
  with check ((EXISTS ( SELECT 1
   FROM public.household_members m
  WHERE ((m.household_id = owner_invites.household_id) AND (m.user_id = (select auth.uid()))))));
alter policy owner_invites_select_members on public.owner_invites
  using ((EXISTS ( SELECT 1
   FROM public.household_members m
  WHERE ((m.household_id = owner_invites.household_id) AND (m.user_id = (select auth.uid()))))));
alter policy push_subscriptions_delete_own on public.push_subscriptions
  using ((user_id = (select auth.uid())));
alter policy push_subscriptions_insert_own on public.push_subscriptions
  with check (((user_id = (select auth.uid())) AND (household_id = ANY (public.get_user_household_ids()))));
alter policy push_subscriptions_select_own on public.push_subscriptions
  using ((user_id = (select auth.uid())));
alter policy invites_insert_owner on public.staff_invites
  with check ((EXISTS ( SELECT 1
   FROM public.household_members m
  WHERE ((m.household_id = staff_invites.household_id) AND (m.user_id = (select auth.uid()))))));
alter policy invites_select_owner on public.staff_invites
  using ((EXISTS ( SELECT 1
   FROM public.household_members m
  WHERE ((m.household_id = staff_invites.household_id) AND (m.user_id = (select auth.uid()))))));
