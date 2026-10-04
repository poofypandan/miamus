-- ============================================================================
-- 105 — Rooms for chores (Phase 135)
-- ============================================================================
-- Chores named their room in the title ("LT2 Master Lounge - Lap ambalan meja
-- TV dan rak2"), so the room could not be shown, filtered or reused on its
-- own. Each household now keeps a list of its places, and a chore can point
-- at one.
--
--   household_locations       id · household_id · name — one row per room.
--   household_tasks.location_id  nullable; most chores have none, and every
--                                chore before this phase keeps working.
--
-- TENANCY, three ways:
--   - RLS: a household reads only its own rooms; only its owners (members,
--     not bound staff devices) add, rename or remove them.
--   - The chore → room key is composite, (location_id, household_id), so a
--     chore can only ever point at a room of its own household — the
--     database refuses anything else, whatever a client sends.
--   - Deleting a room clears it from its chores (SET NULL on location_id
--     alone, Postgres 15+), never the chores themselves.
--
-- Additive only: one table, one nullable column, one index each way.
-- ============================================================================

create table if not exists public.household_locations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  -- The target of the composite key below.
  unique (id, household_id)
);

-- One "Kitchen" per household, however it is typed.
create unique index if not exists household_locations_name_unique
  on public.household_locations (household_id, lower(btrim(name)));

alter table public.household_locations enable row level security;

drop policy if exists "tenant_select_household_locations" on public.household_locations;
create policy "tenant_select_household_locations" on public.household_locations
  for select to authenticated
  using (household_id = any (public.get_user_household_ids()));

-- Writes are the owner's: a household_members row, which a bound staff
-- device does not have (the same test as migrations/099's inventory guard).
drop policy if exists "owner_insert_household_locations" on public.household_locations;
create policy "owner_insert_household_locations" on public.household_locations
  for insert to authenticated
  with check (exists (
    select 1 from public.household_members m
     where m.user_id = auth.uid() and m.household_id = household_locations.household_id));

drop policy if exists "owner_update_household_locations" on public.household_locations;
create policy "owner_update_household_locations" on public.household_locations
  for update to authenticated
  using (exists (
    select 1 from public.household_members m
     where m.user_id = auth.uid() and m.household_id = household_locations.household_id))
  with check (exists (
    select 1 from public.household_members m
     where m.user_id = auth.uid() and m.household_id = household_locations.household_id));

drop policy if exists "owner_delete_household_locations" on public.household_locations;
create policy "owner_delete_household_locations" on public.household_locations
  for delete to authenticated
  using (exists (
    select 1 from public.household_members m
     where m.user_id = auth.uid() and m.household_id = household_locations.household_id));

grant select, insert, update, delete on public.household_locations to authenticated;

-- --- The chore's room ---------------------------------------------------------

alter table public.household_tasks
  add column if not exists location_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'household_tasks_location_fkey'
  ) then
    alter table public.household_tasks
      add constraint household_tasks_location_fkey
      foreign key (location_id, household_id)
      references public.household_locations (id, household_id)
      on delete set null (location_id);
  end if;
end $$;

create index if not exists household_tasks_location_id_idx
  on public.household_tasks (location_id)
  where location_id is not null;
