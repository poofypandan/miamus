-- ============================================================================
-- Phase 71A — staff identity
-- ============================================================================
-- Until now every staff member signed in with one shared household PIN, so the
-- app could show what was done and when but never by whom (see the notice on
-- the owner's Staff tab). This gives each person a row, a PIN they choose
-- themselves on first use, and an id that operational rows can carry.
--
-- ON THE PIN, PLAINLY: it is stored as typed, in a table any visitor can read
-- with the anon key that ships in the public bundle. That is deliberate — the
-- owner's Staff tab exists to read these PINs back — but it means a staff PIN
-- is a "which of us is this?" marker, not a secret. It keeps the household's
-- own members apart on a shared phone; it does not keep a stranger out. The
-- owner's PIN is no stronger: it is a literal in the client bundle.
--
-- Attribution is therefore self-declared, not proven. A row's staff_id says
-- which name was selected on that device, which is what the owner actually
-- wants to know, and is worth no more than that.
-- ============================================================================

-- The table already exists live as a Phase 3 placeholder — id and created_at
-- and nothing else (see supabase/schema.sql) — so this fills it out rather
-- than creating it. The create is kept for a database built from scratch.
create table if not exists staff_profiles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table staff_profiles add column if not exists name text;
-- Null until the person sets one on their first sign-in, and set back to null
-- by the owner's "Reset PIN" — that null is what re-opens the self-setup flow,
-- so it carries meaning rather than being merely absent.
alter table staff_profiles add column if not exists pin text;

-- The placeholder is empty in production, so this names nothing real; it is
-- here so the NOT NULL below cannot fail on a database that did somehow
-- acquire a row.
update staff_profiles set name = 'Staff' where name is null;
alter table staff_profiles alter column name set not null;

-- Dropped first because Postgres has no "add constraint if not exists", and
-- this migration has to survive being replayed.
alter table staff_profiles drop constraint if exists staff_profiles_pin_4_digits;
alter table staff_profiles
  add constraint staff_profiles_pin_4_digits check (pin is null or pin ~ '^[0-9]{4}$');

-- ============================================================================
-- Attribution columns
-- ============================================================================
-- Nullable everywhere and never backfilled: rows written before this migration
-- genuinely have no known author, and inventing one would be worse than the
-- gap. `on delete set null` so removing a staff member keeps their work in the
-- record rather than deleting a day's photos along with them.
-- ============================================================================
alter table task_logs
  add column if not exists staff_id uuid references staff_profiles(id) on delete set null;

alter table routine_proposals
  add column if not exists staff_id uuid references staff_profiles(id) on delete set null;

alter table inventory_alerts
  add column if not exists staff_id uuid references staff_profiles(id) on delete set null;

create index if not exists task_logs_staff_id_idx on task_logs(staff_id);
create index if not exists routine_proposals_staff_id_idx on routine_proposals(staff_id);
create index if not exists inventory_alerts_staff_id_idx on inventory_alerts(staff_id);

-- ============================================================================
-- Seed
-- ============================================================================
-- The two people currently working in the house. Guarded by `not exists` on
-- the name so re-running this migration doesn't create duplicates — the CLI
-- has replayed the whole folder once already (see Phase "Database Sync").
-- ============================================================================
insert into staff_profiles (name, pin)
select 'Ari', null
where not exists (select 1 from staff_profiles where name = 'Ari');

insert into staff_profiles (name, pin)
select 'Syam', null
where not exists (select 1 from staff_profiles where name = 'Syam');

-- ============================================================================
-- RLS
-- ============================================================================
-- Same posture as every other operational table (see rls-policies.sql): staff
-- and owner both arrive as `anon`, so the split between them is enforced in
-- the UI. SELECT is open because the login gate has to list the names and
-- check a PIN before anyone is identified. UPDATE is open because that is how
-- a staff member sets their own PIN and how the owner resets it. INSERT is
-- open for the owner's "Add New Staff". No DELETE policy: the app never
-- removes a staff member, and their rows are referenced by task_logs.
-- ============================================================================
alter table staff_profiles enable row level security;

drop policy if exists "anon_select_staff_profiles" on staff_profiles;
create policy "anon_select_staff_profiles" on staff_profiles
  for select to anon using (true);

drop policy if exists "anon_insert_staff_profiles" on staff_profiles;
create policy "anon_insert_staff_profiles" on staff_profiles
  for insert to anon with check (true);

drop policy if exists "anon_update_staff_profiles" on staff_profiles;
create policy "anon_update_staff_profiles" on staff_profiles
  for update to anon using (true) with check (true);
