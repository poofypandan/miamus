-- Migration 115 checks: house code, PIN limit, admin functions, grants.
-- LOCAL DATABASE ONLY. Runs in one transaction and rolls back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/115_staff_house_code.sql
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

-- People: admin (Google), staff phone (anonymous), second phone (anonymous), Google stranger.
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at) values
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@test.local', false, now(), now()),
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now(), now()),
  ('00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now(), now()),
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stranger@test.local', false, now(), now());

insert into public.households (id, name, owner_auth_id)
values ('00000000-0000-0000-0000-0000000000f1', 'Rumah Tes', '00000000-0000-0000-0000-00000000a001');
insert into public.household_members (household_id, user_id, role)
values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000a001', 'owner');
insert into public.staff_profiles (id, household_id, name, pin, has_pin)
values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1', 'Sari',
        extensions.crypt('1234', extensions.gen_salt('bf')), true);

select pg_temp.ok((select count(*) = 1 from public.household_join_codes where household_id = '00000000-0000-0000-0000-0000000000f1'), 'new household gets a code (trigger)');
select pg_temp.ok((select code ~ '^[A-HJKMNP-Z2-9]{6}$' from public.household_join_codes where household_id = '00000000-0000-0000-0000-0000000000f1'), 'code is 6 chars, no look-alikes');
select code as house_code from public.household_join_codes where household_id = '00000000-0000-0000-0000-0000000000f1' \gset

-- ---------------------------------------------------------------- client roles can't touch the tables
set local role authenticated;
select pg_temp.act('00000000-0000-0000-0000-00000000a001');
do $$ begin
  perform 1 from public.household_join_codes; raise exception 'FAIL: admin read household_join_codes directly';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform 1 from public.staff_sign_in_attempts; raise exception 'FAIL: read staff_sign_in_attempts directly';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform failed_pin_attempts from public.staff_profiles; raise exception 'FAIL: read failed_pin_attempts';
exception when insufficient_privilege then null; end $$;
select pg_temp.ok(true, 'tables and new columns closed to clients');

-- ---------------------------------------------------------------- admin functions
select pg_temp.ok(public.my_house_code('00000000-0000-0000-0000-0000000000f1') = :'house_code', 'admin sees the code');
select pg_temp.act('00000000-0000-0000-0000-00000000c001');
do $$ begin
  perform public.my_house_code('00000000-0000-0000-0000-0000000000f1'); raise exception 'FAIL: stranger saw the code';
exception when insufficient_privilege then null; end $$;
select pg_temp.ok(true, 'non-admin refused my_house_code');

-- ---------------------------------------------------------------- staff phone: code sign-in
select pg_temp.act('00000000-0000-0000-0000-00000000b001');
do $$ begin
  perform public.my_house_code('00000000-0000-0000-0000-0000000000f1'); raise exception 'FAIL: staff phone saw the code via admin fn';
exception when insufficient_privilege then null; end $$;
select pg_temp.ok((select count(*) = 0 from public.house_code_roster('ZZZZZZ')), 'wrong code → no names');
select pg_temp.ok((select count(*) = 1 from public.house_code_roster(lower(substr(:'house_code',1,3)) || '-' || substr(:'house_code',4))), 'right code (lower case, dash) → names');
select pg_temp.ok((select name = 'Sari' from public.house_code_roster(:'house_code') limit 1), 'roster shows PIN people');
select pg_temp.ok(public.sign_in_with_house_code(:'house_code', '00000000-0000-0000-0000-0000000000e1', '0000')->>'status' = 'wrong_pin', 'wrong PIN → wrong_pin');
select pg_temp.ok(public.sign_in_with_house_code(:'house_code', '00000000-0000-0000-0000-0000000000e1', '0000')->>'attempts_left' = '3', 'attempts_left counts down');
select pg_temp.ok(not ('00000000-0000-0000-0000-0000000000f1' = any (coalesce(public.get_user_household_ids(), '{}'))), 'not linked after wrong PINs');
select pg_temp.ok(public.sign_in_with_house_code(:'house_code', '00000000-0000-0000-0000-0000000000e1', '1234')->>'status' = 'ok', 'right PIN → ok');
select pg_temp.ok((select '00000000-0000-0000-0000-0000000000f1' = any (public.get_user_household_ids())), 'phone linked after right PIN');

-- ---------------------------------------------------------------- lockout on a second phone
select pg_temp.act('00000000-0000-0000-0000-00000000b002');
select public.sign_in_with_house_code(:'house_code', '00000000-0000-0000-0000-0000000000e1', '1111') \g /dev/null
select public.sign_in_with_house_code(:'house_code', '00000000-0000-0000-0000-0000000000e1', '1111') \g /dev/null
select public.sign_in_with_house_code(:'house_code', '00000000-0000-0000-0000-0000000000e1', '1111') \g /dev/null
select public.sign_in_with_house_code(:'house_code', '00000000-0000-0000-0000-0000000000e1', '1111') \g /dev/null
select pg_temp.ok(public.sign_in_with_house_code(:'house_code', '00000000-0000-0000-0000-0000000000e1', '1111')->>'status' = 'locked', '5th wrong PIN → locked');
select pg_temp.ok(public.sign_in_with_house_code(:'house_code', '00000000-0000-0000-0000-0000000000e1', '1234')->>'status' = 'locked', 'locked even with the right PIN');
select pg_temp.ok(not ('00000000-0000-0000-0000-0000000000f1' = any (coalesce(public.get_user_household_ids(), '{}'))), 'locked phone not linked');

-- the linked phone's own PIN check is locked too (verify_staff_pin)
select pg_temp.act('00000000-0000-0000-0000-00000000b001');
select pg_temp.ok(public.verify_staff_pin('00000000-0000-0000-0000-0000000000e1', '1234') = false, 'verify_staff_pin respects the lock');

-- lock expires
reset role;
update public.staff_profiles set pin_locked_until = now() - interval '1 second' where id = '00000000-0000-0000-0000-0000000000e1';
set local role authenticated;
select pg_temp.act('00000000-0000-0000-0000-00000000b001');
select pg_temp.ok(public.check_staff_pin('00000000-0000-0000-0000-0000000000e1', '1234')->>'status' = 'ok', 'after the lock ends, right PIN works');

-- ---------------------------------------------------------------- Google sessions can't use a code
select pg_temp.act('00000000-0000-0000-0000-00000000c001');
do $$ begin
  perform public.house_code_roster('ZZZZZZ'); raise exception 'FAIL: Google session used house_code_roster';
exception when insufficient_privilege then null; end $$;
select pg_temp.ok(true, 'Google session refused');

-- ---------------------------------------------------------------- wrong-code limit
reset role;
insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at)
values ('00000000-0000-0000-0000-00000000b003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now());
set local role authenticated;
select pg_temp.act('00000000-0000-0000-0000-00000000b003');
do $$ begin for i in 1..10 loop perform * from public.house_code_roster('ZZZZZZ'); end loop; end $$;
do $$ begin
  perform public.house_code_roster('ZZZZZZ'); raise exception 'FAIL: 11th code try allowed';
exception when raise_exception then
  if sqlerrm <> 'too_many_attempts' then raise; end if;
end $$;
select pg_temp.ok(public.sign_in_with_house_code(:'house_code', '00000000-0000-0000-0000-0000000000e1', '1234')->>'status' = 'too_many_attempts', 'after 10 wrong codes, even the right one waits');

-- ---------------------------------------------------------------- admin: rotate, list, remove
select pg_temp.act('00000000-0000-0000-0000-00000000a001');
select public.rotate_house_code('00000000-0000-0000-0000-0000000000f1') as new_code \gset
select pg_temp.ok(:'new_code' <> :'house_code', 'rotate gives a new code');
select pg_temp.ok((select count(*) = 1 from public.list_linked_phones('00000000-0000-0000-0000-0000000000f1')), 'admin lists 1 linked phone');
select id as phone_id from public.list_linked_phones('00000000-0000-0000-0000-0000000000f1') limit 1 \gset
select pg_temp.act('00000000-0000-0000-0000-00000000b001');
select pg_temp.ok((select '00000000-0000-0000-0000-0000000000f1' = any (public.get_user_household_ids())), 'linked phone still linked after code change');
select pg_temp.ok((select count(*) = 0 from public.house_code_roster(:'house_code')), 'old code stops working');
select pg_temp.act('00000000-0000-0000-0000-00000000a001');
select pg_temp.ok(public.remove_linked_phone('00000000-0000-0000-0000-0000000000f1', :'phone_id'), 'admin removes the phone');
select pg_temp.act('00000000-0000-0000-0000-00000000b001');
select pg_temp.ok(not ('00000000-0000-0000-0000-0000000000f1' = any (coalesce(public.get_user_household_ids(), '{}'))), 'removed phone loses the household');

-- ---------------------------------------------------------------- logged-out callers (anon) reach nothing
reset role;
set local role anon;
do $$
declare fn text;
begin
  foreach fn in array array['house_code_roster(''X'')', 'sign_in_with_house_code(''X'', null, null)', 'check_staff_pin(null, null)',
                            'my_house_code(null)', 'rotate_house_code(null)', 'list_linked_phones(null)', 'remove_linked_phone(null, null)']
  loop
    begin
      execute 'select public.' || fn;
      raise exception 'FAIL: anon could call %', fn;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;
select pg_temp.ok(true, 'anon refused on every new function');
reset role;

select pg_temp.ok((select count(*) > 0 from public.staff_sign_in_attempts), 'attempts recorded');
select pg_temp.ok(public.prune_staff_sign_in_attempts() = 0, 'prune leaves recent attempts');

rollback;
