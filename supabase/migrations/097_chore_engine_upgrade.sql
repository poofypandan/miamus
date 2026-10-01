-- ============================================================================
-- Phase 100 — the chores engine: recurrence, supervision, before/after proof
-- ============================================================================
-- migrations/082 created household_tasks as one row per chore per day, and
-- said so deliberately: "no recurrence: the owner files a repeat again".
-- That call has not held up. The live table proves it — the only two chores in
-- it are dated 2026-09-29, still pending, and have been invisible to the staff
-- member they are assigned to ever since, because every view filters on
-- due_date and nobody browses backwards. A chore that silently disappears the
-- next morning is worse than no chore.
--
-- RECURRENCE WITHOUT ROW BLOAT
-- A repeating chore stays ONE row. `recurrence` turns that row into a template
-- which the client expands for whichever date is on screen (see
-- lib/chore-recurrence.ts) — there is no job materialising a year of Tuesdays.
-- A row is only ever written when work actually happens: completing or
-- claiming an occurrence that has no row yet inserts one, pointing at its
-- template through parent_task_id. So the table grows with work done, not with
-- time passing, and "is this done?" stays a fact about a row rather than a
-- calculation.
--
-- The template's own due_date is its first occurrence, and its own status
-- belongs to that date alone. Later occurrences are virtual until materialised.
-- ============================================================================

-- 'none' | 'daily' | 'weekly' | 'monthly'. Unconstrained for the same reason
-- category and status are (see migrations/082): the app owns the vocabulary,
-- and a CHECK declared only here means a fresh database rejecting a value
-- production already writes. The client tolerates an unknown value by treating
-- it as 'none', so a future cadence degrades to a one-off rather than an error.
alter table household_tasks add column if not exists recurrence text not null default 'none';

-- Optional last day of a repeat. Null is "keep going", which is what a weekly
-- bathroom clean actually is.
alter table household_tasks add column if not exists recurrence_until date;

-- Set on a materialised occurrence, pointing at the template it came from.
-- Null on templates and on ordinary one-off chores.
--
-- `on delete cascade`, which is the one place in this schema that deletes
-- history on purpose: an occurrence of a repeat has no meaning once the repeat
-- is gone, and leaving orphans behind would show the owner chores belonging to
-- a routine they deleted. One-off chores are unaffected — they have no parent.
alter table household_tasks add column if not exists parent_task_id uuid
  references household_tasks(id) on delete cascade;

-- "The owner must be there for this one." Rendered as a flag on both phones so
-- staff know to wait rather than to improvise.
alter table household_tasks add column if not exists requires_supervision boolean not null default false;

-- Proof, now in two halves. `photo_url` stays exactly as it was: it is the
-- single proof photo every chore completed before today carries, and the UI
-- falls back to it when after_photo_url is null, so no history is lost or
-- rewritten.
alter table household_tasks add column if not exists before_photo_url text;
alter table household_tasks add column if not exists after_photo_url text;

-- Two phones completing the same occurrence of the same template on the same
-- day must not produce two rows. This makes the race a constraint violation
-- rather than a duplicate, which the provider turns back into a plain update.
create unique index if not exists household_tasks_occurrence_uniq
  on household_tasks(parent_task_id, due_date)
  where parent_task_id is not null;

-- Templates are read on every date change, so they get their own small index
-- rather than riding the due_date one.
create index if not exists household_tasks_recurrence_idx
  on household_tasks(household_id, recurrence)
  where recurrence <> 'none';

-- ============================================================================
-- RLS
-- ============================================================================
-- SELECT/INSERT/UPDATE already allow exactly what this phase needs, and are
-- left alone. Worth stating plainly, because the brief for this phase assumed
-- otherwise: staff could always read these rows. A bound staff phone holds an
-- anonymous auth session, which is the `authenticated` role, and
-- get_user_household_ids() resolves it through device_sessions (migrations/089)
-- exactly as it does an owner's membership. The chores were invisible because
-- of the due_date filter described at the top of this file, not because of a
-- policy. Verified against the live database before writing this.
--
-- What is genuinely missing is DELETE. migrations/082 and /090 both omitted it
-- on the reasoning that a chore is cancelled rather than erased — but there is
-- now an explicit Delete control in the owner's chore editor, and without a
-- policy it would silently affect zero rows and report success. Restricted to
-- the caller's own household like every other verb.
-- ============================================================================
drop policy if exists "tenant_delete_household_tasks" on household_tasks;
create policy "tenant_delete_household_tasks" on household_tasks
  for delete to authenticated using (household_id = any (get_user_household_ids()));
