-- ============================================================================
-- 165 — What each staff member sees (Phase 178, step 1, PR V1)
-- ============================================================================
-- docs/phase-178-staff-areas-plan.md, section 6. Additive only. Numbered 165:
-- reserved by the manager (157–164 are reserved by earlier specs; 166 is
-- step 2, the server enforcing Kitchen and Repairs).
--
-- NEW
--   staff_profiles.hidden_areas  text[], not null, default '{}': the parts of
--        the staff app an owner has switched off for this person, out of
--        home (chores for anyone), pets (pet routines for nobody in
--        particular), kitchen (Dapur) and repairs (Perbaikan). Stored as
--        what is HIDDEN, so the default changes nothing for anyone, and an
--        area added later is visible until an owner hides it. The staff app
--        hides what is listed (src/lib/staff-areas.ts); it does not lock the
--        data: the rows still reach the phone, as today (step 2 closes that
--        for Kitchen and Repairs).
--
-- WHO MAY WRITE IT: owners only. staff_profiles has column grants (096): a
-- new column is unreadable and unwritable until it is granted, so the
-- update grant below only lets the existing policy be reached. That policy
-- is admin-only (admin_update_staff_profiles, 146: is_household_admin on
-- both using and with check), so a staff phone's update matches no row and
-- a person cannot switch their own areas back on. supabase/tests/165 proves
-- it.
--
-- WHO MAY READ IT: every session of the household, as the other granted
-- columns (the existing select policy, unchanged). A staff phone needs its
-- own row to know what to hide.
--
-- No new function, no SECURITY DEFINER, no policy change. An older app
-- build never asks for the column and shows everything, as today.
-- ============================================================================

alter table public.staff_profiles
  add column if not exists hidden_areas text[] not null default '{}';

alter table public.staff_profiles drop constraint if exists staff_profiles_hidden_areas_check;
alter table public.staff_profiles add constraint staff_profiles_hidden_areas_check
  check (hidden_areas <@ array['home', 'pets', 'kitchen', 'repairs']::text[]);

comment on column public.staff_profiles.hidden_areas is
  'Phase 178: parts of the staff app an owner switched off for this person (home, pets, kitchen, repairs). Empty: sees everything. Owners write it (admin_update_staff_profiles); the app hides, it does not lock.';

grant select (hidden_areas) on public.staff_profiles to authenticated;
grant update (hidden_areas) on public.staff_profiles to authenticated;
