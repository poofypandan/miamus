-- ============================================================================
-- Phase 46 — routine_proposals
-- ============================================================================
-- Staff can propose a care routine (an extra feeding, a temporary medication
-- window); the owner approves or rejects it. An approved proposal is what
-- creates the real master_schedules row — this table is the request, never the
-- schedule itself, so rejecting one leaves no trace in the agenda.
--
-- RUN THIS BEFORE USING THE FEATURE. The app ships with the anon key only, so
-- it cannot create tables itself.
-- ============================================================================

create table if not exists routine_proposals (
  id uuid primary key default gen_random_uuid(),
  -- Named pet_id rather than this file's usual entity_id to match the request
  -- in Phase 46; it still points at task_entities like everything else.
  pet_id uuid not null references task_entities(id) on delete cascade,
  title text not null,
  category text not null check (category in ('meal', 'potty', 'medication', 'grooming', 'temporary')),
  -- "HH:mm" wall-clock time the proposed routine should fire at.
  time time not null,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  -- Free text, not a FK: staff share one household PIN and have no database
  -- identity (see rls-policies.sql), so this is a label, not an auth subject.
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists routine_proposals_status_idx on routine_proposals(status);
create index if not exists routine_proposals_pet_id_idx on routine_proposals(pet_id);

-- ============================================================================
-- RLS — same posture as the Phase 32 policies on the other operational tables.
-- SELECT/INSERT stay open so staff can file proposals and everyone can read
-- the queue. UPDATE is needed for approve/reject. DELETE is scoped to the
-- first five minutes and to proposals still pending — that is the Phase 47
-- undo window. Once the owner has decided, the row is an audit trail.
-- ============================================================================
alter table routine_proposals enable row level security;

drop policy if exists "anon_select_routine_proposals" on routine_proposals;
create policy "anon_select_routine_proposals" on routine_proposals
  for select to anon using (true);

drop policy if exists "anon_insert_routine_proposals" on routine_proposals;
create policy "anon_insert_routine_proposals" on routine_proposals
  for insert to anon with check (true);

drop policy if exists "anon_update_routine_proposals" on routine_proposals;
create policy "anon_update_routine_proposals" on routine_proposals
  for update to anon using (true) with check (true);

drop policy if exists "anon_delete_recent_routine_proposals" on routine_proposals;
create policy "anon_delete_recent_routine_proposals" on routine_proposals
  for delete to anon
  using (status = 'pending' and created_at > now() - interval '5 minutes');
