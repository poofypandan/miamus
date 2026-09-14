-- Maimus household management app
-- Phase 1: Pet Care
--
-- Schema is intentionally polymorphic: task_entities/master_schedules/task_logs
-- are not pet-specific so Phase 2 (rooms/cleaning/laundry) and Phase 3 (staff)
-- can reuse them without a rewrite. See src/config/modules.ts for the
-- feature flags that gate UI for those later phases.

create extension if not exists pgcrypto;

-- ============================================================================
-- task_entities
-- Anything a schedule/log can be attached to: a pet today, a room or a
-- general household entity later.
-- ============================================================================
create table if not exists task_entities (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('pet', 'room', 'general')),
  name text not null,
  icon text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- master_schedules
-- The recurring "definition" of a task for an entity (e.g. potty breaks,
-- meals). module distinguishes pet care from future cleaning/laundry modules.
-- ============================================================================
create table if not exists master_schedules (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references task_entities(id) on delete cascade,
  title text not null,
  module text not null check (module in ('pet', 'cleaning', 'laundry')),
  frequency_type text not null check (frequency_type in ('interval', 'fixed_time', 'weekly')),
  interval_hours int,
  fixed_times time[],
  start_time time,
  end_time time,
  is_active boolean not null default true,
  expires_at date,
  created_at timestamptz not null default now()
);

create index if not exists master_schedules_entity_id_idx on master_schedules(entity_id);

-- ============================================================================
-- task_logs
-- Each completed occurrence of a scheduled (or ad-hoc) task.
-- ============================================================================
create table if not exists task_logs (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references master_schedules(id) on delete set null,
  entity_id uuid not null references task_entities(id) on delete cascade,
  module text not null check (module in ('pet', 'cleaning', 'laundry')),
  photo_url text,
  notes text,
  completed_at timestamptz not null default now()
);

create index if not exists task_logs_entity_id_idx on task_logs(entity_id);
create index if not exists task_logs_schedule_id_idx on task_logs(schedule_id);
create index if not exists task_logs_completed_at_idx on task_logs(completed_at);

-- ============================================================================
-- medical_records
-- Vaccine / vet visit / medication / weight history per entity (pets for
-- now). `value` (kg) is set only for record_type = 'weight' — every other
-- type leaves it null. Added by the Phase 30 migration below; a fresh
-- database gets it inline instead of needing a separate ALTER.
-- ============================================================================
create table if not exists medical_records (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references task_entities(id) on delete cascade,
  record_type text not null check (record_type in ('vaccine', 'vet', 'medication', 'weight')),
  title text not null,
  administered_at date,
  next_due_date date,
  document_photo_url text,
  notes text,
  value numeric,
  created_at timestamptz not null default now()
);

-- Phase 30 migration — run this against a database created before this
-- column/constraint existed (a fresh `create table` above already has it):
--   alter table medical_records add column value numeric;
--   alter table medical_records
--     drop constraint medical_records_record_type_check,
--     add constraint medical_records_record_type_check
--       check (record_type in ('vaccine', 'vet', 'medication', 'weight'));

create index if not exists medical_records_entity_id_idx on medical_records(entity_id);

-- ============================================================================
-- inventory_alerts
-- Staff-raised "we're running low on X" flags. Owners see them as a banner
-- and mark them resolved once restocked.
--
-- Uses `pet_id` rather than this file's usual `entity_id` convention — this
-- table already existed in the live database with that column name before
-- this migration was written, so the app code matches it as-is instead of
-- the other way around.
-- ============================================================================
create table if not exists inventory_alerts (
  id uuid primary key default gen_random_uuid(),
  -- Nullable since Phase 49: a shared household item belongs to no one dog.
  pet_id uuid references task_entities(id) on delete cascade,
  -- Deliberately unconstrained. The live table never had a CHECK here (probed
  -- 2026-09-14), and declaring one in this file only would mean a fresh
  -- database rejected values production accepts. ItemType in
  -- src/types/database.ts is the source of truth for the allowed values.
  item_type text not null,
  note text,
  -- `resolved` predates `status` (Phase 50) and is kept in sync with it rather
  -- than dropped, so rows written by either generation of the app read back
  -- correctly. See src/lib/inventory-status.ts.
  resolved boolean not null default false,
  status text not null default 'pending',
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists inventory_alerts_pet_id_idx on inventory_alerts(pet_id);
create index if not exists inventory_alerts_status_idx on inventory_alerts(status);
create index if not exists inventory_alerts_resolved_idx on inventory_alerts(resolved);

-- ============================================================================
-- routine_proposals
-- Staff-submitted requests for a new routine, awaiting the owner's decision.
-- Approving one is what creates the real master_schedules row; this table is
-- never read by the agenda. Created in migrations/046, batch_id added in 052.
-- ============================================================================
create table if not exists routine_proposals (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references task_entities(id) on delete cascade,
  title text not null,
  category text not null check (category in ('meal', 'potty', 'medication', 'grooming', 'temporary')),
  time time not null,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_by text,
  -- Ties the rows of one multi-dose submission together so the owner approves
  -- the course as a unit. Null for anything filed before Phase 52.
  batch_id text,
  created_at timestamptz not null default now()
);

create index if not exists routine_proposals_status_idx on routine_proposals(status);
create index if not exists routine_proposals_pet_id_idx on routine_proposals(pet_id);
create index if not exists routine_proposals_batch_id_idx on routine_proposals(batch_id);

-- ============================================================================
-- staff_profiles
-- Placeholder for Phase 3 (staff attendance/tasks). Intentionally empty
-- beyond an id/timestamp until that phase is built.
-- ============================================================================
create table if not exists staff_profiles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Storage
-- Bucket for task/health photo uploads. Public + open policies match the
-- no-auth state of Phase 1; tighten these once staff accounts exist.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('household-logs', 'household-logs', true)
on conflict (id) do nothing;

drop policy if exists "Public read access for household-logs" on storage.objects;
create policy "Public read access for household-logs"
on storage.objects for select
using (bucket_id = 'household-logs');

drop policy if exists "Public insert access for household-logs" on storage.objects;
create policy "Public insert access for household-logs"
on storage.objects for insert
with check (bucket_id = 'household-logs');

-- Without this, deletePhoto() in supabase-provider.ts 403s and every photo
-- the owner "deletes" stays in the bucket forever (the caller swallows the
-- error by design). Added by the Phase 32 audit — see rls-policies.sql.
drop policy if exists "Public delete access for household-logs" on storage.objects;
create policy "Public delete access for household-logs"
on storage.objects for delete
using (bucket_id = 'household-logs');

-- ============================================================================
-- Row Level Security
-- Table policies live in supabase/rls-policies.sql — audited and rewritten in
-- Phase 32. Apply that file after this one.
-- ============================================================================

-- ============================================================================
-- No seed data: pets are added, edited, and archived/deleted at runtime
-- through the /dashboard/pets management screen. A pet's `metadata` jsonb
-- column holds optional attributes (breed, avatar_url, archived) without
-- requiring schema changes.
-- ============================================================================
