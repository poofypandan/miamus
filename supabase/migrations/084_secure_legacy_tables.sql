-- ============================================================================
-- Phase 83A — apply the Phase 32 RLS hardening to the four legacy tables
-- ============================================================================
-- The Supabase security advisor flagged task_entities, master_schedules,
-- task_logs and medical_records as public tables with RLS disabled. The fix
-- was written in supabase/rls-policies.sql (part B) but never applied. This is
-- that part, scoped to those four tables only: the file's part A also drops
-- every policy on staff_profiles and inventory_alerts, which would now delete
-- the Phase 71 staff insert/update policies, and its part C storage policy
-- already shipped in migrations/080. See rls-policies.sql for the reasoning
-- behind each verb.
-- ============================================================================

alter table public.task_entities    enable row level security;
alter table public.master_schedules enable row level security;
alter table public.task_logs        enable row level security;
alter table public.medical_records  enable row level security;

-- task_entities: full CRUD.
drop policy if exists "anon_select_task_entities" on public.task_entities;
create policy "anon_select_task_entities" on public.task_entities
  for select to anon using (true);
drop policy if exists "anon_insert_task_entities" on public.task_entities;
create policy "anon_insert_task_entities" on public.task_entities
  for insert to anon with check (true);
drop policy if exists "anon_update_task_entities" on public.task_entities;
create policy "anon_update_task_entities" on public.task_entities
  for update to anon using (true) with check (true);
drop policy if exists "anon_delete_task_entities" on public.task_entities;
create policy "anon_delete_task_entities" on public.task_entities
  for delete to anon using (true);

-- master_schedules: full CRUD.
drop policy if exists "anon_select_master_schedules" on public.master_schedules;
create policy "anon_select_master_schedules" on public.master_schedules
  for select to anon using (true);
drop policy if exists "anon_insert_master_schedules" on public.master_schedules;
create policy "anon_insert_master_schedules" on public.master_schedules
  for insert to anon with check (true);
drop policy if exists "anon_update_master_schedules" on public.master_schedules;
create policy "anon_update_master_schedules" on public.master_schedules
  for update to anon using (true) with check (true);
drop policy if exists "anon_delete_master_schedules" on public.master_schedules;
create policy "anon_delete_master_schedules" on public.master_schedules
  for delete to anon using (true);

-- task_logs: select, insert, delete — no update (append-only completions).
drop policy if exists "anon_select_task_logs" on public.task_logs;
create policy "anon_select_task_logs" on public.task_logs
  for select to anon using (true);
drop policy if exists "anon_insert_task_logs" on public.task_logs;
create policy "anon_insert_task_logs" on public.task_logs
  for insert to anon with check (true);
drop policy if exists "anon_delete_task_logs" on public.task_logs;
create policy "anon_delete_task_logs" on public.task_logs
  for delete to anon using (true);

-- medical_records: select, insert only — the health passport is append-only.
drop policy if exists "anon_select_medical_records" on public.medical_records;
create policy "anon_select_medical_records" on public.medical_records
  for select to anon using (true);
drop policy if exists "anon_insert_medical_records" on public.medical_records;
create policy "anon_insert_medical_records" on public.medical_records
  for insert to anon with check (true);
