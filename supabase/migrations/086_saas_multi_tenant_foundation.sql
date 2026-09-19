-- ============================================================================
-- Phase 86A — multi-tenant foundation
-- ============================================================================
-- Introduces `households` as the tenant and stamps every tenant-owned
-- top-level table with a household_id, backfilled to the one household that
-- exists today: Banyuwangi 11.
--
-- WHICH TABLES, AND WHY THESE
--   task_entities     the pets (the spec's "pets" — no table by that name)
--   staff_profiles    people are hired by a household
--   inventory_items   the stock ledger
--   household_tasks   chores
--   inventory_alerts  NOT in the original spec, added deliberately: a general
--                     alert ("Umum") has pet_id null, so unlike every other
--                     child table it has no parent to inherit a tenant from.
-- The spec also named `task_categories`, which does not exist — nothing to do.
--
-- Deliberately NOT stamped: master_schedules, task_logs, medical_records,
-- routine_proposals, inventory_audit_logs. Each has a non-null FK to a pet or
-- an item above, so its tenant is that parent's. Phase 86B's RLS can scope
-- them through the join; denormalising now would only add columns to keep in
-- sync.
--
-- SAFE HARBOR: A TEMPORARY COLUMN DEFAULT
-- Making household_id NOT NULL would break every insert that doesn't send it —
-- including the PWA already installed on the staff phones, which can keep
-- running a cached bundle from before this phase. So each column defaults to
-- the Banyuwangi 11 id for now; the new frontend sends it explicitly anyway.
-- Phase 86B MUST drop these defaults once real tenant resolution exists, or a
-- second household's rows would silently land in Banyuwangi 11.
--
-- Idempotent: re-running finds the existing household by name and skips
-- columns that already exist.
-- ============================================================================

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Nullable until Phase 86B wires Google sign-in; set null rather than
  -- cascade so deleting an auth user never deletes a household's data.
  owner_auth_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table households enable row level security;

do $$
declare
  default_household uuid;
  t text;
begin
  select id into default_household from households where name = 'Banyuwangi 11' limit 1;
  if default_household is null then
    insert into households (name) values ('Banyuwangi 11') returning id into default_household;
  end if;

  foreach t in array array[
    'task_entities', 'staff_profiles', 'inventory_items', 'household_tasks', 'inventory_alerts'
  ] loop
    execute format(
      'alter table public.%I add column if not exists household_id uuid references households(id) on delete cascade',
      t
    );
    execute format('update public.%I set household_id = %L where household_id is null', t, default_household);
    execute format('alter table public.%I alter column household_id set default %L', t, default_household);
    execute format('alter table public.%I alter column household_id set not null', t);
    execute format('create index if not exists %I on public.%I(household_id)', t || '_household_id_idx', t);
  end loop;
end $$;

-- ============================================================================
-- RLS — placeholder only
-- ============================================================================
-- Read-only and open, so the app (still arriving as `anon`, see
-- rls-policies.sql) can resolve its household. No insert/update/delete: a
-- household is created by this migration or, from 86B, by the sign-up flow
-- running as `authenticated`. Child-table policies are untouched on purpose —
-- tightening them before Google sign-in exists would lock out the staff PIN
-- flow, which has no auth identity.
-- ============================================================================
drop policy if exists "read_households_placeholder" on households;
create policy "read_households_placeholder" on households
  for select to anon, authenticated using (true);
