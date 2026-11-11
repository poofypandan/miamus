-- Migration 117 checks: archived staff are off the house-code list and fail
-- the PIN check. LOCAL DATABASE ONLY. Runs in one transaction and rolls back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/117_house_code_skips_archived_staff.sql
-- Every line printed starts with "ok"; a failure stops with "FAIL: …".
\set ON_ERROR_STOP on
\pset footer off
begin;

create function pg_temp.ok(cond boolean, label text) returns text language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  return 'ok  ' || label;
end $$;

create function pg_temp.act(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- Admin (Google), two staff phones (anonymous).
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000117a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin117@test.local', false, now(), now()),
  ('00000000-0000-0000-0000-0000000117b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now(), now()),
  ('00000000-0000-0000-0000-0000000117b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now(), now());
insert into public.households (id, name, owner_auth_id)
values ('00000000-0000-0000-0000-0000000117f1', 'Rumah 117', '00000000-0000-0000-0000-0000000117a1');
insert into public.household_members (household_id, user_id, role)
values ('00000000-0000-0000-0000-0000000117f1', '00000000-0000-0000-0000-0000000117a1', 'owner');

-- Sari: active, PIN 1234. Rina: archived but with a PIN (an admin set one
-- after archiving: the backstop case). Dedi: archived the normal way, no PIN.
insert into public.staff_profiles (id, household_id, name, pin, has_pin, archived_at) values
  ('00000000-0000-0000-0000-0000000117e1', '00000000-0000-0000-0000-0000000117f1', 'Sari',
   extensions.crypt('1234', extensions.gen_salt('bf')), true, null),
  ('00000000-0000-0000-0000-0000000117e2', '00000000-0000-0000-0000-0000000117f1', 'Rina',
   extensions.crypt('5678', extensions.gen_salt('bf')), true, now()),
  ('00000000-0000-0000-0000-0000000117e3', '00000000-0000-0000-0000-0000000117f1', 'Dedi',
   null, false, now());

select code as house_code from public.household_join_codes
 where household_id = '00000000-0000-0000-0000-0000000117f1' \gset

set local role authenticated;

-- ---------------------------------------------------------------- the name list
select pg_temp.act('00000000-0000-0000-0000-0000000117b1');
select pg_temp.ok((select array_agg(name order by name) = array['Sari'] from public.house_code_roster(:'house_code')),
  'house-code list shows active staff only');

-- ---------------------------------------------------------------- signing in with the code
select pg_temp.ok(public.sign_in_with_house_code(:'house_code', '00000000-0000-0000-0000-0000000117e2', '5678')->>'status' = 'no_pin',
  'archived person with a PIN can''t sign in with the code');
select pg_temp.ok(not ('00000000-0000-0000-0000-0000000117f1' = any (coalesce(public.get_user_household_ids(), '{}'))),
  'phone not linked by an archived person');
select pg_temp.ok(public.sign_in_with_house_code(:'house_code', '00000000-0000-0000-0000-0000000117e1', '1234')->>'status' = 'ok',
  'active person still signs in');

-- ---------------------------------------------------------------- PIN check on a linked phone
select pg_temp.ok(public.check_staff_pin('00000000-0000-0000-0000-0000000117e2', '5678')->>'status' = 'no_pin',
  'check_staff_pin refuses an archived person');
select pg_temp.ok(public.verify_staff_pin('00000000-0000-0000-0000-0000000117e2', '5678') = false,
  'verify_staff_pin refuses an archived person');
select pg_temp.ok(public.check_staff_pin('00000000-0000-0000-0000-0000000117e1', '1234')->>'status' = 'ok',
  'check_staff_pin still accepts an active person');
reset role;
select pg_temp.ok((select failed_pin_attempts = 0 from public.staff_profiles where id = '00000000-0000-0000-0000-0000000117e2'),
  'refusing an archived person doesn''t count toward a lock');

-- ---------------------------------------------------------------- archive and bring back (109)
set local role authenticated;
select pg_temp.act('00000000-0000-0000-0000-0000000117a1');
select public.archive_staff_profile('00000000-0000-0000-0000-0000000117e1') \g /dev/null
-- Archiving gives the house a new code (146); the rest of this file uses it.
reset role;
select code as house_code from public.household_join_codes
 where household_id = '00000000-0000-0000-0000-0000000117f1' \gset
set local role authenticated;
select pg_temp.act('00000000-0000-0000-0000-0000000117b2');
select pg_temp.ok((select count(*) = 0 from public.house_code_roster(:'house_code')),
  'archived through the app: off the list');
select pg_temp.ok(public.sign_in_with_house_code(:'house_code', '00000000-0000-0000-0000-0000000117e1', '1234')->>'status' = 'no_pin',
  'archived through the app: old PIN no longer works');
select pg_temp.act('00000000-0000-0000-0000-0000000117a1');
select public.restore_staff_profile('00000000-0000-0000-0000-0000000117e1') \g /dev/null
select pg_temp.act('00000000-0000-0000-0000-0000000117b2');
select pg_temp.ok((select array_agg(name) = array['Sari'] from public.house_code_roster(:'house_code')),
  'brought back: on the list again');
select pg_temp.ok((select has_pin = false from public.house_code_roster(:'house_code') where name = 'Sari'),
  'brought back: needs a new PIN');

rollback;
