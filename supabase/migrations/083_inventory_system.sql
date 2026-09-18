-- ============================================================================
-- Phase 83A — inventory system (PRD 02: docs/household_prd_02.md)
-- ============================================================================
-- Turns inventory_items from a bare catalogue (Phase 60: id, name, category,
-- created_at) into a stock ledger: box + loose-unit counts, a reorder
-- threshold and an audit cadence. inventory_audit_logs records each physical
-- stock check a staff member performs.
--
-- inventory_items ALREADY EXISTS in production (migrations/060), so it is
-- extended with `add column if not exists` rather than created — a
-- `create table if not exists` here would silently skip every new column.
-- ============================================================================

create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'other',
  created_at timestamptz not null default now()
);

-- category: PRD 02 uses 'fresh_food' | 'pantry' | 'household_supplies' |
-- 'dog_supplies'. Still unconstrained — Phase 60 catalogue rows carry
-- ItemType values, and a CHECK would reject them.
alter table inventory_items add column if not exists variant text;
alter table inventory_items add column if not exists unit_type text not null default 'unit';
alter table inventory_items add column if not exists boxes_count numeric not null default 0;
alter table inventory_items add column if not exists loose_units_count numeric not null default 0;
alter table inventory_items add column if not exists units_per_box numeric not null default 1;
-- The PRD specifies no default; one is given so the existing Phase 60
-- "add item" path (name + category only) keeps inserting successfully.
alter table inventory_items add column if not exists min_threshold numeric not null default 2;
alter table inventory_items add column if not exists audit_frequency_days integer not null default 30;
alter table inventory_items add column if not exists last_audited_at timestamptz;
alter table inventory_items add column if not exists notes text;

create table if not exists inventory_audit_logs (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references inventory_items(id) on delete cascade,
  audited_by uuid references staff_profiles(id) on delete set null,
  boxes_counted numeric not null default 0,
  loose_units_counted numeric not null default 0,
  photo_url text,
  created_at timestamptz not null default now()
);

create index if not exists inventory_audit_logs_item_id_idx
  on inventory_audit_logs(item_id, created_at desc);

-- ============================================================================
-- RLS — same posture as every other operational table (see rls-policies.sql):
-- everyone arrives as `anon`, so this only removes verbs the app never uses.
-- ============================================================================
alter table inventory_items enable row level security;
alter table inventory_audit_logs enable row level security;

drop policy if exists "anon_select_inventory_items" on inventory_items;
create policy "anon_select_inventory_items" on inventory_items
  for select to anon using (true);

drop policy if exists "anon_insert_inventory_items" on inventory_items;
create policy "anon_insert_inventory_items" on inventory_items
  for insert to anon with check (true);

-- New in 83A: a stock check writes the counted totals and last_audited_at
-- back onto the item.
drop policy if exists "anon_update_inventory_items" on inventory_items;
create policy "anon_update_inventory_items" on inventory_items
  for update to anon using (true) with check (true);

drop policy if exists "anon_delete_inventory_items" on inventory_items;
create policy "anon_delete_inventory_items" on inventory_items
  for delete to anon using (true);

-- Audit logs are append-only, like medical_records: no UPDATE or DELETE
-- policy, so a leaked key cannot rewrite the stock history the run-out
-- forecast is computed from.
drop policy if exists "anon_select_inventory_audit_logs" on inventory_audit_logs;
create policy "anon_select_inventory_audit_logs" on inventory_audit_logs
  for select to anon using (true);

drop policy if exists "anon_insert_inventory_audit_logs" on inventory_audit_logs;
create policy "anon_insert_inventory_audit_logs" on inventory_audit_logs
  for insert to anon with check (true);

-- ============================================================================
-- Seed — PRD 02 starting list. Guarded on (name, variant) so a replay of the
-- migrations folder doesn't duplicate rows.
-- ============================================================================
insert into inventory_items (name, category, variant, unit_type, units_per_box, min_threshold, audit_frequency_days)
select s.name, s.category, s.variant, s.unit_type, 1, 2, s.freq
from (values
  ('Dishwashing Soap',               'household_supplies', null,     'bottle', 30),
  ('Rinso',                          'household_supplies', null,     'pack',   30),
  ('Wood Floor Cleaner',             'household_supplies', null,     'bottle', 30),
  ('Marble Floor Cleaner',           'household_supplies', null,     'bottle', 30),
  ('Alcohol',                        'household_supplies', null,     'bottle', 30),
  ('Enzyme Cleaner',                 'household_supplies', null,     'bottle', 30),
  ('Milk',                           'fresh_food',         null,     'carton', 7),
  ('Egg',                            'fresh_food',         null,     'pcs',    7),
  ('Chicken Thigh',                  'fresh_food',         null,     'pack',   7),
  ('Fish',                           'fresh_food',         null,     'pack',   7),
  ('Beef',                           'fresh_food',         null,     'pack',   7),
  ('Shrimp',                         'fresh_food',         null,     'pack',   7),
  ('Kale',                           'fresh_food',         null,     'bunch',  7),
  ('Spinach',                        'fresh_food',         null,     'bunch',  7),
  ('Red Rice',                       'pantry',             null,     'pack',   14),
  ('White Rice',                     'pantry',             null,     'pack',   14),
  ('Wild Black Rice',                'pantry',             null,     'pack',   14),
  ('Barley',                         'pantry',             null,     'pack',   14),
  ('Yellow Quinoa',                  'pantry',             null,     'pack',   14),
  ('Olive Oil',                      'pantry',             null,     'bottle', 14),
  ('Palm Oil',                       'pantry',             null,     'bottle', 14),
  ('Flour',                          'pantry',             null,     'pack',   14),
  ('Mocha Food (Renal Royal Canin)', 'dog_supplies',       null,     'bag',    7),
  ('Matcha Food (Salmon Bravery)',   'dog_supplies',       null,     'bag',    7),
  ('Millo Zz Food',                  'dog_supplies',       'Beef',   'pack',   7),
  ('Millo Zz Food',                  'dog_supplies',       'Pork',   'pack',   7),
  ('Millo Zz Food',                  'dog_supplies',       'Salmon', 'pack',   7),
  ('Pee Pad',                        'dog_supplies',       null,     'pack',   7),
  ('Kojima Dog Toothpaste',          'dog_supplies',       null,     'tube',   7)
) as s(name, category, variant, unit_type, freq)
where not exists (
  select 1 from inventory_items i
  where i.name = s.name and i.variant is not distinct from s.variant
);
