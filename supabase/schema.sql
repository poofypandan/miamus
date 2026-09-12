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
-- Seed data
-- ============================================================================

insert into task_entities (name, entity_type, icon)
values
  ('Mocha', 'pet', 'dog'),
  ('Matcha', 'pet', 'dog'),
  ('ZZ', 'pet', 'dog'),
  ('Millo', 'pet', 'dog')
on conflict do nothing;

-- Potty schedule: Mocha & Matcha every 2h, ZZ & Millo every 3h, 06:00-21:00.
insert into master_schedules (entity_id, title, module, frequency_type, interval_hours, start_time, end_time)
select id, 'Pipis & Pup', 'pet', 'interval', 2, '06:00', '21:00'
from task_entities
where name in ('Mocha', 'Matcha');

insert into master_schedules (entity_id, title, module, frequency_type, interval_hours, start_time, end_time)
select id, 'Pipis & Pup', 'pet', 'interval', 3, '06:00', '21:00'
from task_entities
where name in ('ZZ', 'Millo');

-- Meals: all 4 dogs, fixed times at lunch (12:00) and dinner (18:00).
insert into master_schedules (entity_id, title, module, frequency_type, fixed_times)
select id, 'Makan Siang', 'pet', 'fixed_time', array['12:00'::time]
from task_entities
where name in ('Mocha', 'Matcha', 'ZZ', 'Millo');

insert into master_schedules (entity_id, title, module, frequency_type, fixed_times)
select id, 'Makan Malam', 'pet', 'fixed_time', array['18:00'::time]
from task_entities
where name in ('Mocha', 'Matcha', 'ZZ', 'Millo');
