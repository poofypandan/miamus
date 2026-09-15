-- ============================================================================
-- Phase 63 — 'vet' category
-- ============================================================================
-- routine_proposals.category is guarded by a CHECK constraint (verified live:
-- inserting 'vet' failed with 23514), so the enum has to be widened before the
-- new builders can file anything.
--
-- master_schedules needs no change: it has no category column at all. A
-- schedule's category is read back out of its title prefix by
-- categorizeSchedule() in src/lib/schedule-categories.ts, so 'vet' arrives
-- there as the "Vet: " prefix alongside the existing "Medication: " and
-- "Grooming: ".
--
-- RUN THIS BEFORE USING THE FEATURE. Until it is applied, submitting a vet
-- proposal is rejected by Postgres and the staff member sees the generic
-- failure toast.
-- ============================================================================

alter table routine_proposals
  drop constraint if exists routine_proposals_category_check;

alter table routine_proposals
  add constraint routine_proposals_category_check
  check (category in ('meal', 'potty', 'medication', 'grooming', 'temporary', 'vet'));
