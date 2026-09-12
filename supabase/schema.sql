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
-- Vaccine / vet visit / medication history per entity (pets for now).
-- ============================================================================
create table if not exists medical_records (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references task_entities(id) on delete cascade,
  record_type text not null check (record_type in ('vaccine', 'vet', 'medication')),
  title text not null,
  administered_at date,
  next_due_date date,
  document_photo_url text,
  notes text,
  created_at timestamptz not null default now()
);

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
  pet_id uuid not null references task_entities(id) on delete cascade,
  item_type text not null check (item_type in ('food', 'medicine', 'treats', 'shampoo')),
  note text,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists inventory_alerts_pet_id_idx on inventory_alerts(pet_id);
create index if not exists inventory_alerts_resolved_idx on inventory_alerts(resolved);

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

-- ============================================================================
-- No seed data: pets are added, edited, and archived/deleted at runtime
-- through the /dashboard/pets management screen. A pet's `metadata` jsonb
-- column holds optional attributes (breed, avatar_url, archived) without
-- requiring schema changes.
-- ============================================================================
