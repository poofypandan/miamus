-- Migration 133 checks: the sign-up answer is saved by create_household (and
-- the old one-argument call still works); only owners of the household can
-- change it; turning pets off is refused while a pet isn't archived; staff
-- phones can read it; logged-out callers can run neither function.
-- LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/133_household_has_pets.sql
\set ON_ERROR_STOP on
\pset footer off
begin;

create function pg_temp.ok(cond boolean, label text) returns text language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  return 'ok  ' || label;
end $$;
-- Runs a statement as someone and returns the error it raised ('' if none).
create function pg_temp.err_as(uid uuid, stmt text) returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute stmt;
  exception when others then
    execute 'reset role';
    return sqlerrm;
  end;
  execute 'reset role';
  return '';
end $$;
-- Reads one value as someone (null if RLS hides the row).
create function pg_temp.read_as(uid uuid, q text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute q into v;
  execute 'reset role';
  return v;
end $$;

-- a1 owns f1 (two pets: one live, one archived); a2 owns f2 (no pets);
-- b1 is f1's staff phone; c1, c2 and c3 are approved accounts with no
-- household yet.
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, anon, now(), now()
from (values
  ('00000000-0000-0000-0000-0000000133a1', 'owner133@test.local', false),
  ('00000000-0000-0000-0000-0000000133a2', 'other133@test.local', false),
  ('00000000-0000-0000-0000-0000000133b1', null, true),
  ('00000000-0000-0000-0000-0000000133c1', 'new133a@test.local', false),
  ('00000000-0000-0000-0000-0000000133c2', 'new133b@test.local', false),
  ('00000000-0000-0000-0000-0000000133c3', 'new133c@test.local', false)
) as u(id, email, anon);
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000133f1', 'Rumah Melati', '00000000-0000-0000-0000-0000000133a1'),
  ('00000000-0000-0000-0000-0000000133f2', 'Rumah Kenanga', '00000000-0000-0000-0000-0000000133a2');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000133f1', '00000000-0000-0000-0000-0000000133a1', 'owner'),
  ('00000000-0000-0000-0000-0000000133f2', '00000000-0000-0000-0000-0000000133a2', 'owner');
insert into public.device_sessions (user_id, household_id) values
  ('00000000-0000-0000-0000-0000000133b1', '00000000-0000-0000-0000-0000000133f1');
insert into public.task_entities (id, household_id, name, entity_type, metadata) values
  ('00000000-0000-0000-0000-0000000133e1', '00000000-0000-0000-0000-0000000133f1', 'Mochi', 'pet', '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000133e2', '00000000-0000-0000-0000-0000000133f1', 'Kopi', 'pet', '{"archived": true}'::jsonb);
insert into public.household_access_requests (user_id, status, decided_at) values
  ('00000000-0000-0000-0000-0000000133c1', 'approved', now()),
  ('00000000-0000-0000-0000-0000000133c2', 'approved', now()),
  ('00000000-0000-0000-0000-0000000133c3', 'approved', now());

\set owner '''00000000-0000-0000-0000-0000000133a1'''
\set other '''00000000-0000-0000-0000-0000000133a2'''
\set staff '''00000000-0000-0000-0000-0000000133b1'''

-- ---- The backfill's rule (re-run here on the test rows) ------------------------
update public.households h set has_pets = true
 where h.has_pets is null and h.id in ('00000000-0000-0000-0000-0000000133f1', '00000000-0000-0000-0000-0000000133f2')
   and exists (select 1 from public.task_entities e where e.household_id = h.id and e.entity_type = 'pet');
select pg_temp.ok((select has_pets from public.households where id = '00000000-0000-0000-0000-0000000133f1'),
  'backfill: a household with pets is set to true');
select pg_temp.ok((select has_pets is null from public.households where id = '00000000-0000-0000-0000-0000000133f2'),
  'backfill: a household without pets stays unanswered');

-- ---- create_household -----------------------------------------------------------
select pg_temp.ok(pg_temp.err_as('00000000-0000-0000-0000-0000000133c1',
  $q$ select public.create_household('Rumah Anggrek', false) $q$) = '', 'sign-up with "no pets"');
select pg_temp.ok((select has_pets = false and has_pets_set_at is not null
                      and has_pets_set_by = '00000000-0000-0000-0000-0000000133c1'
                     from public.households where name = 'Rumah Anggrek'),
  'the answer, who and when are saved');
select pg_temp.ok(pg_temp.err_as('00000000-0000-0000-0000-0000000133c2',
  $q$ select public.create_household('Rumah Dahlia', true) $q$) = '', 'sign-up with pets');
select pg_temp.ok((select has_pets from public.households where name = 'Rumah Dahlia'), 'pets saved as true');
select pg_temp.ok(pg_temp.err_as('00000000-0000-0000-0000-0000000133c3',
  $q$ select public.create_household(p_name => 'Rumah Teratai') $q$) = '', 'an old build''s one-argument call still works');
select pg_temp.ok((select has_pets is null and has_pets_set_at is null and has_pets_set_by is null
                     from public.households where name = 'Rumah Teratai'),
  'no answer is saved as unanswered');
select pg_temp.ok(pg_temp.err_as('00000000-0000-0000-0000-0000000133c1',
  $q$ select public.create_household('Rumah kedua', true) $q$) like '%already_has_household%',
  'the one-household rule is unchanged');
select pg_temp.ok((select count(*) = 1 from pg_proc where proname = 'create_household'),
  'no create_household(text) overload is left behind');

-- ---- set_household_has_pets: who -------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:staff,
  $q$ select public.set_household_has_pets('00000000-0000-0000-0000-0000000133f1', true) $q$) like '%not_admin%',
  'a staff phone can''t change it');
select pg_temp.ok(pg_temp.err_as(:other,
  $q$ select public.set_household_has_pets('00000000-0000-0000-0000-0000000133f1', true) $q$) like '%not_admin%',
  'another household''s owner can''t change it');
select pg_temp.ok(pg_temp.err_as(:other,
  $q$ select public.set_household_has_pets('00000000-0000-0000-0000-0000000133f2', null) $q$) like '%bad_value%',
  'null is refused');

-- ---- set_household_has_pets: D4 ------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:owner,
  $q$ select public.set_household_has_pets('00000000-0000-0000-0000-0000000133f1', false) $q$) like '%has_live_pets%',
  'off is refused while a pet isn''t archived');
select pg_temp.ok((select has_pets from public.households where id = '00000000-0000-0000-0000-0000000133f1'),
  'and nothing changed');
update public.task_entities set metadata = '{"archived": true}'::jsonb where id = '00000000-0000-0000-0000-0000000133e1';
select pg_temp.ok(pg_temp.err_as(:owner,
  $q$ select public.set_household_has_pets('00000000-0000-0000-0000-0000000133f1', false) $q$) = '',
  'off works once every pet is archived');
select pg_temp.ok((select has_pets = false and has_pets_set_by = '00000000-0000-0000-0000-0000000133a1'
                     from public.households where id = '00000000-0000-0000-0000-0000000133f1'),
  'saved as off, with who changed it');
select pg_temp.ok(pg_temp.err_as(:owner,
  $q$ select public.set_household_has_pets('00000000-0000-0000-0000-0000000133f1', true) $q$) = '',
  'on again');
select pg_temp.ok(pg_temp.err_as(:other,
  $q$ select public.set_household_has_pets('00000000-0000-0000-0000-0000000133f2', false) $q$) = '',
  'a household with no pets can answer "no pets"');

-- ---- Reads ----------------------------------------------------------------------------
select pg_temp.ok(pg_temp.read_as(:staff,
  $q$ select has_pets::text from public.households where id = '00000000-0000-0000-0000-0000000133f1' $q$) = 'true',
  'the staff phone reads its household''s answer');
select pg_temp.ok(pg_temp.read_as(:staff,
  $q$ select has_pets::text from public.households where id = '00000000-0000-0000-0000-0000000133f2' $q$) is null,
  'and not another household''s');
select pg_temp.ok(pg_temp.err_as(:owner,
  $q$ update public.households set has_pets = false where id = '00000000-0000-0000-0000-0000000133f1' $q$) <> ''
  or (select has_pets from public.households where id = '00000000-0000-0000-0000-0000000133f1'),
  'no direct update: the function is the only door');

-- ---- Grants ---------------------------------------------------------------------------
select pg_temp.ok(not has_function_privilege('anon', 'public.create_household(text, boolean)', 'execute'),
  'logged-out callers can''t create a household');
select pg_temp.ok(not has_function_privilege('anon', 'public.set_household_has_pets(uuid, boolean)', 'execute'),
  'logged-out callers can''t change the answer');
select pg_temp.ok(has_function_privilege('authenticated', 'public.set_household_has_pets(uuid, boolean)', 'execute'),
  'signed-in callers can (the function checks who)');
select pg_temp.ok((select prosecdef and proconfig = array['search_path=""'] from pg_proc where proname = 'set_household_has_pets'),
  'definer with an empty search_path');

rollback;
select 'all 133 checks passed';
