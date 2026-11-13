-- Migration 165 checks: staff_profiles.hidden_areas (Phase 178, step 1).
-- A staff phone signs in the real way (an anonymous session, the house code
-- and a PIN through sign_in_with_house_code). Then: it can read the column
-- for its household and not another's; it cannot change it on its own row or
-- anyone's (the one thing that must not be wrong); an owner can; an unknown
-- area is refused; existing rows read as nothing hidden.
-- LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/165_staff_hidden_areas.sql
-- (or, before 165 is applied: begin; \i the migration; \i this file.)
\set ON_ERROR_STOP on
\pset footer off
begin;

create function pg_temp.ok(cond boolean, label text) returns text language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  return 'ok  ' || label;
end $$;
-- Runs a statement as a session; returns the error, or ''.
create function pg_temp.err_as(uid uuid, stmt text) returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute stmt;
  exception when others then
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    return sqlerrm;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return '';
end $$;
-- Runs a write as a session; returns the rows it touched (-1 on an error).
-- Read its effect in the NEXT statement (\gset): a check in the same
-- statement still sees the row as it was before the write.
create function pg_temp.n_as(uid uuid, stmt text) returns integer language plpgsql as $$
declare n integer;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute stmt;
    get diagnostics n = row_count;
  exception when others then
    n := -1;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return n;
end $$;
-- Runs a query as a session and returns its one value as jsonb.
create function pg_temp.json_as(uid uuid, stmt text) returns jsonb language plpgsql as $$
declare j jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute stmt into j;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return j;
end $$;

-- ---- Households ----------------------------------------------------------------------
-- f1: owner a1; staff Sari (PIN 1234), Budi (PIN 5678). Phone p1 is Sari's.
-- f2: owner a9; staff Wati.
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, anon, now(), now()
from (values
  ('00000000-0000-0000-0000-0000000165a1', 'one165@test.local', false),
  ('00000000-0000-0000-0000-0000000165a9', 'nine165@test.local', false),
  ('00000000-0000-0000-0000-0000000165b1', null, true)
) as u(id, email, anon);
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000165f1', 'Rumah Melati', '00000000-0000-0000-0000-0000000165a1'),
  ('00000000-0000-0000-0000-0000000165f2', 'Rumah Kenanga', '00000000-0000-0000-0000-0000000165a9');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000165f1', '00000000-0000-0000-0000-0000000165a1', 'owner'),
  ('00000000-0000-0000-0000-0000000165f2', '00000000-0000-0000-0000-0000000165a9', 'owner');
insert into public.staff_profiles (id, household_id, name, pin, has_pin) values
  ('00000000-0000-0000-0000-0000000165c1', '00000000-0000-0000-0000-0000000165f1', 'Sari',
   extensions.crypt('1234', extensions.gen_salt('bf')), true),
  ('00000000-0000-0000-0000-0000000165c2', '00000000-0000-0000-0000-0000000165f1', 'Budi',
   extensions.crypt('5678', extensions.gen_salt('bf')), true),
  ('00000000-0000-0000-0000-0000000165c9', '00000000-0000-0000-0000-0000000165f2', 'Wati', null, false);
create temp table code as
  select c.code from public.household_join_codes c where c.household_id = '00000000-0000-0000-0000-0000000165f1';
grant select on pg_temp.code to authenticated;

\set a1 '''00000000-0000-0000-0000-0000000165a1'''
\set a9 '''00000000-0000-0000-0000-0000000165a9'''
\set p1 '''00000000-0000-0000-0000-0000000165b1'''
\set sari '''00000000-0000-0000-0000-0000000165c1'''
\set budi '''00000000-0000-0000-0000-0000000165c2'''
\set wati '''00000000-0000-0000-0000-0000000165c9'''

-- ---- The column ----------------------------------------------------------------------
select pg_temp.ok((select hidden_areas = '{}'::text[] from public.staff_profiles where id = :sari::uuid)
                  and not exists (select 1 from public.staff_profiles where hidden_areas is null),
  'existing and new rows read as nothing hidden');
select pg_temp.ok(has_column_privilege('authenticated', 'public.staff_profiles', 'hidden_areas', 'select')
                  and has_column_privilege('authenticated', 'public.staff_profiles', 'hidden_areas', 'update')
                  and not has_column_privilege('authenticated', 'public.staff_profiles', 'hidden_areas', 'insert')
                  and not has_column_privilege('anon', 'public.staff_profiles', 'hidden_areas', 'select')
                  and not has_column_privilege('anon', 'public.staff_profiles', 'hidden_areas', 'update')
                  and not has_column_privilege('authenticated', 'public.staff_profiles', 'pin', 'select'),
  'grants: authenticated may read and update the column, anon neither; pin stays hidden');

-- ---- A real staff sign-in: house code, name, PIN -------------------------------------
select pg_temp.ok(pg_temp.json_as(:p1, format($q$ select public.sign_in_with_house_code(
  (select code from pg_temp.code), %L, '1234') $q$, :sari))->>'status' = 'ok',
  'Sari''s phone signs in with the house code and her PIN');

-- ---- Reading -------------------------------------------------------------------------
update public.staff_profiles set hidden_areas = '{kitchen,repairs}' where id = :sari::uuid;
select pg_temp.ok(pg_temp.json_as(:p1, format($q$ select to_jsonb(hidden_areas) from public.staff_profiles where id = %L $q$, :sari))
                  = '["kitchen", "repairs"]'::jsonb,
  'staff: the phone reads its own person''s hidden areas');
select pg_temp.ok(pg_temp.json_as(:p1, format($q$ select to_jsonb(hidden_areas) from public.staff_profiles where id = %L $q$, :budi))
                  = '[]'::jsonb,
  'staff: the phone reads a colleague''s too (shared phones switch names)');
select pg_temp.ok(pg_temp.json_as(:p1, format($q$ select count(*)::int from public.staff_profiles where id = %L $q$, :wati))::int = 0,
  'NEG staff: another household''s roster is not readable');
select pg_temp.ok(pg_temp.json_as(:a9, format($q$ select count(*)::int from public.staff_profiles where id = %L $q$, :sari))::int = 0,
  'NEG another household''s owner cannot read it');
select pg_temp.ok(pg_temp.json_as(:a1, format($q$ select to_jsonb(hidden_areas) from public.staff_profiles where id = %L $q$, :sari))
                  = '["kitchen", "repairs"]'::jsonb,
  'owner: reads it');

-- ---- Writing: staff refused ----------------------------------------------------------
select pg_temp.n_as(:p1, format($q$ update public.staff_profiles set hidden_areas = '{}' where id = %L $q$, :sari)) as n \gset
select pg_temp.ok(:n = 0
                  and (select hidden_areas from public.staff_profiles where id = :sari::uuid) = '{kitchen,repairs}'::text[],
  'NEG staff: switching its own areas back on matches nothing');
select pg_temp.n_as(:p1, format($q$ update public.staff_profiles set hidden_areas = '{home,pets,kitchen,repairs}' where id = %L $q$, :budi)) as n \gset
select pg_temp.ok(:n = 0
                  and (select hidden_areas from public.staff_profiles where id = :budi::uuid) = '{}'::text[],
  'NEG staff: changing a colleague''s areas matches nothing');
select pg_temp.n_as(:p1, $q$ update public.staff_profiles set hidden_areas = '{}' $q$) as n \gset
select pg_temp.ok(:n = 0
                  and (select hidden_areas from public.staff_profiles where id = :sari::uuid) = '{kitchen,repairs}'::text[],
  'NEG staff: a blanket update matches nothing');
select pg_temp.n_as(:a9, format($q$ update public.staff_profiles set hidden_areas = '{}' where id = %L $q$, :sari)) as n \gset
select pg_temp.ok(:n = 0
                  and (select hidden_areas from public.staff_profiles where id = :sari::uuid) = '{kitchen,repairs}'::text[],
  'NEG another household''s owner changes nothing');

-- ---- Writing: owners -----------------------------------------------------------------
select pg_temp.n_as(:a1, format($q$ update public.staff_profiles set hidden_areas = '{pets}' where id = %L $q$, :budi)) as n \gset
select pg_temp.ok(:n = 1
                  and (select hidden_areas from public.staff_profiles where id = :budi::uuid) = '{pets}'::text[],
  'owner: hides an area for a person');
select pg_temp.n_as(:a1, format($q$ update public.staff_profiles set hidden_areas = '{}' where id = %L $q$, :sari)) as n \gset
select pg_temp.ok(:n = 1
                  and (select hidden_areas from public.staff_profiles where id = :sari::uuid) = '{}'::text[],
  'owner: switches everything back on');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ update public.staff_profiles set hidden_areas = '{garden}' where id = %L $q$, :sari))
                  like '%staff_profiles_hidden_areas_check%',
  'NEG an unknown area is refused');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ update public.staff_profiles set hidden_areas = array[null]::text[] where id = %L $q$, :sari))
                  like '%staff_profiles_hidden_areas_check%',
  'NEG a null inside the list is refused');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ update public.staff_profiles set hidden_areas = null where id = %L $q$, :sari))
                  like '%null value%',
  'NEG the list itself cannot be null');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ update public.staff_profiles set pin = 'x' where id = %L $q$, :sari))
                  like '%permission denied%',
  'NEG the new grant does not open other columns (pin stays write-protected)');

rollback;
