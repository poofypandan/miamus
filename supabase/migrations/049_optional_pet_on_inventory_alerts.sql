-- ============================================================================
-- Phase 49 — inventory_alerts.pet_id becomes optional
-- ============================================================================
-- Staff report shared household supplies (floor cleaner, a bottle of shampoo
-- every dog uses) as often as they report a specific dog's food. Forcing a pet
-- onto those made staff pick an arbitrary one, which then showed the owner a
-- restock request attached to a dog that had nothing to do with it.
--
-- RUN THIS BEFORE USING THE FEATURE. Until it is applied the app still works,
-- but a report filed without a pet is rejected by Postgres with
-- "null value in column pet_id violates not-null constraint" (verified live,
-- code 23502) and the staff member sees the generic failure toast.
-- ============================================================================

alter table inventory_alerts alter column pet_id drop not null;

-- ============================================================================
-- NOTE on item_type: no migration needed.
--
-- schema.sql declares `check (item_type in ('food','medicine','treats',
-- 'shampoo'))`, but the live table has no such constraint — probed on
-- 2026-09-14 by inserting item_type 'other', which was accepted (201) and then
-- deleted. The Phase 49 "Lainnya" category therefore needs no DDL. schema.sql
-- has been corrected to match what the database actually enforces, so a fresh
-- database built from it behaves the same way as the live one.
-- ============================================================================
