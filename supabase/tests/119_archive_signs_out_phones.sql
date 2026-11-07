-- Migration 119 checks: removing someone unlinks the phones they were last
-- signed in on, and phones can no longer record work in their name.
-- LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/119_archive_signs_out_phones.sql
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

-- Admin; phone 1 (Sari's), phone 2 (shared, Wati last), phone 3 (Sari, then Wati).
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000119a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin119@test.local', false, now(), now()),
  ('00000000-0000-0000-0000-0000000119b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now(), now()),
  ('00000000-0000-0000-0000-0000000119b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now(), now()),
  ('00000000-0000-0000-0000-0000000119b3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now(), now());
insert into public.households (id, name, owner_auth_id)
values ('00000000-0000-0000-0000-0000000119f1', 'Rumah 119', '00000000-0000-0000-0000-0000000119a1');
insert into public.household_members (household_id, user_id, role)
values ('00000000-0000-0000-0000-0000000119f1', '00000000-0000-0000-0000-0000000119a1', 'owner');
insert into public.staff_profiles (id, household_id, name, pin, has_pin) values
  ('00000000-0000-0000-0000-0000000119e1', '00000000-0000-0000-0000-0000000119f1', 'Sari', extensions.crypt('1234', extensions.gen_salt('bf')), true),
  ('00000000-0000-0000-0000-0000000119e2', '00000000-0000-0000-0000-0000000119f1', 'Wati', extensions.crypt('5678', extensions.gen_salt('bf')), true);
insert into public.task_entities (id, household_id, name, entity_type)
values ('00000000-0000-0000-0000-0000000119d1', '00000000-0000-0000-0000-0000000119f1', 'Mochi', 'pet');

select code as house_code from public.household_join_codes
 where household_id = '00000000-0000-0000-0000-0000000119f1' \gset

set local role authenticated;
-- Phone 1: Sari. Phone 2: Wati. Phone 3: Sari, then Wati.
select pg_temp.act('00000000-0000-0000-0000-0000000119b1');
select public.sign_in_with_house_code(:'house_code', '00000000-0000-0000-0000-0000000119e1', '1234') \g /dev/null
select pg_temp.act('00000000-0000-0000-0000-0000000119b2');
select public.sign_in_with_house_code(:'house_code', '00000000-0000-0000-0000-0000000119e2', '5678') \g /dev/null
select pg_temp.act('00000000-0000-0000-0000-0000000119b3');
select public.sign_in_with_house_code(:'house_code', '00000000-0000-0000-0000-0000000119e1', '1234') \g /dev/null
select pg_sleep(0.01) \g /dev/null
select public.check_staff_pin('00000000-0000-0000-0000-0000000119e2', '5678') \g /dev/null

-- Phone 1, still as Sari, records work: fine while she is on the roster.
select pg_temp.act('00000000-0000-0000-0000-0000000119b1');
insert into public.task_logs (entity_id, module, staff_id)
values ('00000000-0000-0000-0000-0000000119d1', 'pet', '00000000-0000-0000-0000-0000000119e1');
select pg_temp.ok(true, 'before removal: a phone records work in her name');

-- ---------------------------------------------------------------- removal
select pg_temp.act('00000000-0000-0000-0000-0000000119a1');
select public.archive_staff_profile('00000000-0000-0000-0000-0000000119e1') \g /dev/null
reset role;
select pg_temp.ok(not exists (select 1 from public.device_sessions where user_id = '00000000-0000-0000-0000-0000000119b1'),
  'her phone (last signed in as her) is unlinked');
select pg_temp.ok(exists (select 1 from public.device_sessions where user_id = '00000000-0000-0000-0000-0000000119b2'),
  'a phone someone else signed in on stays linked');
select pg_temp.ok(exists (select 1 from public.device_sessions where user_id = '00000000-0000-0000-0000-0000000119b3'),
  'a phone she used before someone else stays linked');

-- ---------------------------------------------------------------- no new work in her name
set local role authenticated;
select pg_temp.act('00000000-0000-0000-0000-0000000119b2');
do $$ begin
  insert into public.task_logs (entity_id, module, staff_id)
  values ('00000000-0000-0000-0000-0000000119d1', 'pet', '00000000-0000-0000-0000-0000000119e1');
  raise exception 'FAIL: logged under a removed person';
exception when insufficient_privilege then null; end $$;
select pg_temp.ok(true, 'a phone can''t log a meal under a removed person');
do $$ begin
  insert into public.household_tasks (household_id, title, due_date, status, assigned_to)
  values ('00000000-0000-0000-0000-0000000119f1', 'Pel', current_date, 'pending', '00000000-0000-0000-0000-0000000119e1');
  raise exception 'FAIL: chore assigned to a removed person';
exception when insufficient_privilege then null; end $$;
select pg_temp.ok(true, 'a chore can''t be assigned to a removed person');
insert into public.task_logs (entity_id, module, staff_id)
values ('00000000-0000-0000-0000-0000000119d1', 'pet', '00000000-0000-0000-0000-0000000119e2');
select pg_temp.ok(true, 'others still record work as usual');
reset role;
select pg_temp.ok((select count(*) = 1 from public.task_logs where staff_id = '00000000-0000-0000-0000-0000000119e1'),
  'her earlier work keeps her name');

rollback;
