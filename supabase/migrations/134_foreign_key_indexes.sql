-- ============================================================================
-- 134 — Indexes for the foreign keys Supabase's performance advisor flags
-- ============================================================================
-- The production advisor (2026-11-10) listed 7 "unindexed foreign keys". Each
-- one is on a real delete path: Postgres looks up the referencing rows when
-- the referenced row goes, and without a matching index that is a full scan.
--
-- NEW INDEXES (no index served these before)
--   households.has_pets_set_by        -> auth.users, on delete set null
--   household_deletions.requested_by  -> auth.users, on delete set null
--     Every deleted account checks both. Accounts are deleted by hand and
--     every night by prune_unlinked_phone_sign_ins() (121), which removes
--     many old phone sign-ins at once, so households was being scanned once
--     per removed sign-in. Partial: only answered / requested rows are indexed.
--
-- SWAPPED INDEXES (same job, now on both key columns)
--   These keys are composite (id, household_id), and each table already had
--   an index on the id column alone, which the advisor doesn't count. The new
--   index covers both columns and the old one is dropped in the same step, so
--   each table still has one index for the key, not two.
--     household_locations (parent_id, household_id)   was (parent_id)            129
--       a floor's rooms: on delete of the floor, and the two-levels trigger
--     household_tasks     (repair_id, household_id)   was (repair_id)            130
--       a repair's visits: on delete of the repair, and the nightly clean-up join
--     repairs             (location_id, household_id) was (location_id)          130
--       a room's repairs: on delete of the room
--     repair_notes        (repair_id, household_id)   was (repair_id, created_at) 131
--       a repair's notes: on delete of the repair. The app lists notes per
--       household (repair_notes_household_idx), never by repair_id and time,
--       so the created_at column wasn't serving a query.
--
-- SKIPPED
--   repair_costs_repair_fkey (repair_id, household_id). repair_id is the
--   table's primary key, so every lookup by this key already uses the primary
--   key index (one cost row per repair). A second index would only slow
--   writes. The advisor will keep listing this one; it's expected.
--
-- No data changes. Indexes only, safe to re-run.
-- ============================================================================

-- --- New -----------------------------------------------------------------------
create index if not exists households_has_pets_set_by_idx
  on public.households (has_pets_set_by)
  where has_pets_set_by is not null;

create index if not exists household_deletions_requested_by_idx
  on public.household_deletions (requested_by)
  where requested_by is not null;

-- --- Swapped -------------------------------------------------------------------
create index if not exists household_locations_parent_household_idx
  on public.household_locations (parent_id, household_id)
  where parent_id is not null;
drop index if exists public.household_locations_parent_id_idx;

create index if not exists household_tasks_repair_household_idx
  on public.household_tasks (repair_id, household_id)
  where repair_id is not null;
drop index if exists public.household_tasks_repair_id_idx;

create index if not exists repairs_location_household_idx
  on public.repairs (location_id, household_id)
  where location_id is not null;
drop index if exists public.repairs_location_idx;

create index if not exists repair_notes_repair_household_idx
  on public.repair_notes (repair_id, household_id);
drop index if exists public.repair_notes_repair_idx;
