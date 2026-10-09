-- 000 — The foundation every numbered migration assumes (Phases 1–45)
--
-- The first tables were created by hand from supabase/schema.sql, long before
-- this folder existed. Migration 046 is simply the first change that was ever
-- written down, so it opens by pointing a foreign key at task_entities — and
-- on a fresh database (staging) there is no task_entities to point at:
--
--   ERROR: relation "task_entities" does not exist (SQLSTATE 42P01)
--
-- This recreates those tables as they stood just before 046, and only those:
--
--   task_entities, master_schedules, task_logs, medical_records,
--   inventory_alerts, and the household-logs storage bucket.
--
-- Everything later — routine_proposals (046), inventory_items (060),
-- staff_profiles (071), household_tasks (082), households and tenancy (086+),
-- RLS (084, 090) — is left to the migration that introduced it.
--
-- Pre-046 shape on purpose, not today's schema.sql: inventory_alerts.pet_id is
-- still NOT NULL (049 relaxes it) and has no status/resolved_at (050 adds
-- them). Every later change to these tables is idempotent (`if not exists`,
-- drop-then-add), so either shape would apply, but this one keeps the history
-- honest.
--
-- Idempotent throughout, so it is a no-op on production, where every one of
-- these already exists.

create extension if not exists pgcrypto;

create table if not exists task_entities (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('pet', 'room', 'general')),
  name text not null,
  icon text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

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

-- `value` (kg) and the 'weight' type arrived in Phase 30, before 046.
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

create index if not exists medical_records_entity_id_idx on medical_records(entity_id);

-- `pet_id`, not `entity_id`: the live table predates that convention.
-- item_type is deliberately unconstrained — production never had a CHECK on
-- it; ItemType in src/types/database.ts is the source of truth.
create table if not exists inventory_alerts (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references task_entities(id) on delete cascade,
  item_type text not null,
  note text,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

-- The photo bucket. Nothing numbered ever creates it — 080 and 092 only
-- adjust it — so without this a fresh database has nowhere to upload to.
-- Public, as it was created; 092 makes it private and replaces its policies.
insert into storage.buckets (id, name, public)
values ('household-logs', 'household-logs', true)
on conflict (id) do nothing;
