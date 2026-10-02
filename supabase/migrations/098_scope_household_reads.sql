-- ============================================================================
-- 098 — Households are readable only by the people in them (Phase 107)
-- ============================================================================
-- 086 opened `households` to everyone, signed in or not, as a placeholder
-- until real identities existed. They have since 088/089, and the placeholder
-- outlived its purpose: anyone holding the public anon key could list every
-- customer's residence name and owner id. Harmless with one household, a
-- privacy leak with two.
--
-- Now a household is visible to:
--   - its members and bound staff devices (get_user_household_ids, which
--     covers household_members and device_sessions), so the header can show
--     the household's own name on both views;
--   - its founder via owner_auth_id, which is what lets onboarding's
--     `insert ... returning` read back the row it just made — the membership
--     that would otherwise grant it is only written in the next statement.
--
-- Nothing in the app reads households as anon: /join resolves invites through
-- security-definer RPCs, and 094's founder check runs as definer too.
-- ============================================================================
drop policy if exists "read_households_placeholder" on households;
drop policy if exists "households_select_own" on households;
create policy "households_select_own" on households
  for select to authenticated
  using (id = any (get_user_household_ids()) or owner_auth_id = auth.uid());
