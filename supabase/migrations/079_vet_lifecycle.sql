-- ============================================================================
-- Phase 79A — vet visit lifecycle
-- ============================================================================
-- A vet visit is not one moment. The dog is taken in, and then either comes
-- home the same day or stays overnight — and while it is staying, the meals
-- and potty breaks on its schedule are not merely undone, they are somebody
-- else's job. This adds the two columns that let the app tell those states
-- apart.
--
-- NOTE ON THE TABLE NAME: there is no `pets` table. Pets are rows in
-- `task_entities` with entity_type = 'pet' — the app's polymorphic entity
-- model, which also carries the (currently unused) non-pet modules. `status`
-- therefore lands on task_entities; a person is never "admitted", so the
-- column simply stays 'home' for anything that is not a dog.
-- ============================================================================

-- 'home' or 'admitted'. Deliberately not a CHECK constraint, matching the rest
-- of this schema (see the note in migrations/060): the app is the source of
-- truth for the vocabulary, and a constraint declared only here would mean a
-- fresh database rejecting a value production had started writing.
alter table task_entities
  add column if not exists status text not null default 'home';

-- Which part of a task this log records. 'complete' for every ordinary task —
-- the default, so every existing row keeps its current meaning without a
-- backfill. Vet tasks additionally use 'check_in', 'check_out' and 'admitted',
-- which is what turns a single vet task into a two-part visit with a photo at
-- each end.
alter table task_logs
  add column if not exists sub_type text not null default 'complete';

-- The staff card asks "what has happened to this task today?" on every render,
-- which is a filter on schedule_id + sub_type.
create index if not exists task_logs_sub_type_idx on task_logs(sub_type);

-- Admitted dogs are looked up on every feed render to decide what to grey out.
create index if not exists task_entities_status_idx on task_entities(status);
