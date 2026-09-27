-- ============================================================================
-- Phase 97 (step 2 of 2) — hide the PIN column from clients
-- ============================================================================
-- Apply only once the build from migrations/095's sibling commit is deployed:
-- it removes table-wide SELECT, so any client still issuing `select *` on
-- staff_profiles starts erroring on the staff list.
--
-- RLS decides which *rows* a caller sees; it cannot hide a column. Postgres
-- column privileges can, but only if the table-level grant goes first — a
-- table-wide SELECT covers every column, including ones granted afterwards.
--
-- After this, `pin` is reachable only through verify_staff_pin and
-- set_staff_pin (migrations/095), which are SECURITY DEFINER.
-- ============================================================================

revoke select, insert, update on staff_profiles from anon, authenticated;

grant select (id, household_id, name, created_at, has_pin) on staff_profiles to authenticated;
grant insert (household_id, name) on staff_profiles to authenticated;
grant update (name) on staff_profiles to authenticated;

