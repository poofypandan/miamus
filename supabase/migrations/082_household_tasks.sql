-- ============================================================================
-- Phase 82 — household_tasks (chore delegation)
-- ============================================================================
-- Everything this app tracks so far hangs off a dog: master_schedules needs an
-- entity_id and the agenda engine renders per-pet. Chores don't fit that shape
-- — "mop the terrace" belongs to the house, not to Mocha — so they get their
-- own table rather than a synthetic entity row to hang off.
--
-- One row is one chore on one day. Deliberately no recurrence: the owner files
-- a repeat again, which is the same call already made for ad-hoc pet routines
-- and cheaper than a second scheduling engine. See docs/household_prd_01.md.
--
-- RUN THIS BEFORE USING THE FEATURE. Until it is applied both views show an
-- empty chore list and the dashboard keeps working — the app degrades rather
-- than breaking (see listHouseholdTasks in lib/data/supabase-provider.ts and
-- the catch in HouseholdContext).
-- ============================================================================

create table if not exists household_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  -- Mirrors HouseholdTaskCategory in src/types/database.ts: 'cleaning',
  -- 'maintenance', 'errand', 'groceries'. Deliberately unconstrained, as with
  -- inventory_items.category (see migrations/060): the app owns the vocabulary,
  -- and a CHECK declared only here would mean a fresh database rejecting a
  -- value production had already started writing.
  category text not null default 'cleaning',
  -- Null means "anyone" — the chore shows to every staff member as
  -- "Semua Petugas" until one of them claims it. `on delete set null` so
  -- removing a staff member keeps the chore in the record rather than deleting
  -- a month of history along with them, matching the attribution columns added
  -- in migrations/071.
  assigned_to uuid references staff_profiles(id) on delete set null,
  -- The day this chore belongs to. Both views filter on it, and it is what
  -- keeps a growing table from ever being read in bulk.
  due_date date not null default current_date,
  -- "HH:mm", or null for "sometime today". Text rather than `time` so the
  -- optional-and-absent case stays one representation on both sides of the
  -- wire; nothing does time arithmetic on it.
  due_time text,
  -- 'pending' | 'completed' | 'cancelled'. 'cancelled' is written by nothing
  -- yet — it is here so retiring a chore later needs no migration.
  status text not null default 'pending',
  -- Who actually did it, which is not necessarily who it was assigned to.
  -- Nullable and never backfilled, same posture as assigned_to above.
  completed_by uuid references staff_profiles(id) on delete set null,
  completed_at timestamptz,
  -- Proof photo, in the same `household-logs` bucket as task photos.
  photo_url text,
  created_at timestamptz not null default now()
);

-- Every read is "this day's chores", and the staff feed additionally narrows by
-- assignee, so both views are served by these.
create index if not exists household_tasks_due_date_idx on household_tasks(due_date);
create index if not exists household_tasks_assigned_to_idx on household_tasks(assigned_to);
create index if not exists household_tasks_status_idx on household_tasks(status);

-- ============================================================================
-- RLS
-- ============================================================================
-- Same posture as every other operational table (see rls-policies.sql, and the
-- notes on task_logs and task_entities in particular): staff and owner both
-- arrive as `anon` with a key that ships in the public bundle, so "owner
-- delegates / staff executes" is enforced in the UI — the chore panel is
-- owner-gated by userRole — not here. What RLS does is drop the verbs the app
-- never issues.
--
-- SELECT is open because both views read the list. INSERT is open because the
-- owner creates chores. UPDATE is open because that is how a staff member
-- claims one and how completion is recorded. No DELETE policy: nothing in the
-- app deletes a chore — a retired one becomes 'cancelled' instead, so the day's
-- record stays intact.
-- ============================================================================
alter table household_tasks enable row level security;

drop policy if exists "anon_select_household_tasks" on household_tasks;
create policy "anon_select_household_tasks" on household_tasks
  for select to anon using (true);

drop policy if exists "anon_insert_household_tasks" on household_tasks;
create policy "anon_insert_household_tasks" on household_tasks
  for insert to anon with check (true);

drop policy if exists "anon_update_household_tasks" on household_tasks;
create policy "anon_update_household_tasks" on household_tasks
  for update to anon using (true) with check (true);
