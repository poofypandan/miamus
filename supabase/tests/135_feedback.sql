-- Migration 135 checks: feedback sent by owners and staff phones, for their
-- own household only; staff phones only as a person on this household's
-- roster (not archived, not an admin's profile, not another household's);
-- server-stamped sender and time; owners read their household's, staff
-- phones read none; logged-out callers refused; the daily limit; the
-- 2-year clean-up; the export; and the new functions' grants.
-- LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/135_feedback.sql
\set ON_ERROR_STOP on
\pset footer off
begin;

create function pg_temp.ok(cond boolean, label text) returns text language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  return 'ok  ' || label;
end $$;
-- Runs a statement as this signed-in user; '' when it worked, else the error.
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
-- How many rows this user sees.
create function pg_temp.count_as(uid uuid, stmt text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute stmt into n;
  execute 'reset role';
  return n;
end $$;
-- Runs a statement with only the public key; '' when it worked, else the error.
create function pg_temp.err_anon(stmt text) returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  begin
    execute stmt;
  exception when others then
    execute 'reset role';
    return sqlerrm;
  end;
  execute 'reset role';
  return '';
end $$;

insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, anon, now(), now()
from (values
  ('00000000-0000-0000-0000-0000000135a1', 'owner135@test.local', false),
  ('00000000-0000-0000-0000-0000000135a2', 'other135@test.local', false),
  ('00000000-0000-0000-0000-0000000135b1', null, true),
  ('00000000-0000-0000-0000-0000000135b2', null, true),
  ('00000000-0000-0000-0000-0000000135b3', null, true)
) as u(id, email, anon);
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000135f1', 'Rumah Melati', '00000000-0000-0000-0000-0000000135a1'),
  ('00000000-0000-0000-0000-0000000135f2', 'Rumah lain', '00000000-0000-0000-0000-0000000135a2');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000135f1', '00000000-0000-0000-0000-0000000135a1', 'owner'),
  ('00000000-0000-0000-0000-0000000135f2', '00000000-0000-0000-0000-0000000135a2', 'owner');
-- Two staff phones of the first household, one of the second.
insert into public.device_sessions (user_id, household_id) values
  ('00000000-0000-0000-0000-0000000135b1', '00000000-0000-0000-0000-0000000135f1'),
  ('00000000-0000-0000-0000-0000000135b2', '00000000-0000-0000-0000-0000000135f1'),
  ('00000000-0000-0000-0000-0000000135b3', '00000000-0000-0000-0000-0000000135f2');
insert into public.staff_profiles (id, household_id, name, archived_at, user_id) values
  ('00000000-0000-0000-0000-0000000135e1', '00000000-0000-0000-0000-0000000135f1', 'Sari', null, null),
  ('00000000-0000-0000-0000-0000000135e2', '00000000-0000-0000-0000-0000000135f1', 'Joko', now(), null),
  ('00000000-0000-0000-0000-0000000135e3', '00000000-0000-0000-0000-0000000135f2', 'Wati', null, null);
-- The owner's own roster row, made when they joined (106).
select id as owner_profile from public.staff_profiles
 where household_id = '00000000-0000-0000-0000-0000000135f1' and user_id = '00000000-0000-0000-0000-0000000135a1' \gset

\set owner '''00000000-0000-0000-0000-0000000135a1'''
\set other '''00000000-0000-0000-0000-0000000135a2'''
\set staff '''00000000-0000-0000-0000-0000000135b1'''
\set staff2 '''00000000-0000-0000-0000-0000000135b2'''
\set otherstaff '''00000000-0000-0000-0000-0000000135b3'''

-- ---- Owners send, as themselves -----------------------------------------------
select pg_temp.ok(pg_temp.err_as(:owner, $q$
  insert into public.feedback (id, household_id, message, category, staff_id, created_by, created_at, app_version, page)
  values ('00000000-0000-0000-0000-0000000135d1', '00000000-0000-0000-0000-0000000135f1',
          '  Would love a dark mode  ', 'idea', '00000000-0000-0000-0000-0000000135e1',
          '00000000-0000-0000-0000-0000000135a2', '2020-01-01', 'build-1', '/dashboard?tab=staff')
$q$) = '', 'an owner sends feedback');
select pg_temp.ok((select message = 'Would love a dark mode' and category = 'idea'
                          and created_by = '00000000-0000-0000-0000-0000000135a1'
                          and staff_id is null and created_at > now() - interval '1 minute'
                          and app_version = 'build-1' and page = '/dashboard?tab=staff'
                     from public.feedback where id = '00000000-0000-0000-0000-0000000135d1'),
  'the server stamps who and when, trims the text, and an owner is never filed under a staff name');

select pg_temp.ok(pg_temp.err_as(:owner, $q$
  insert into public.feedback (household_id, message)
  values ('00000000-0000-0000-0000-0000000135f2', 'Not my house')
$q$) <> '', 'an owner can''t send for another household');
select pg_temp.ok(pg_temp.err_as(:owner, $q$
  insert into public.feedback (household_id, message) values ('00000000-0000-0000-0000-0000000135f1', '   ')
$q$) like '%feedback_message_length%', 'an empty message is refused');
select pg_temp.ok(pg_temp.err_as(:owner, format($q$
  insert into public.feedback (household_id, message) values ('00000000-0000-0000-0000-0000000135f1', %L)
$q$, repeat('a', 1001))) like '%feedback_message_length%', 'a message over 1,000 characters is refused');
select pg_temp.ok(pg_temp.err_as(:owner, $q$
  insert into public.feedback (household_id, message, category) values ('00000000-0000-0000-0000-0000000135f1', 'x', 'rant')
$q$) like '%feedback_category_check%', 'an unknown category is refused');

-- ---- Staff phones send, as a person on this household's roster -----------------
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.feedback (id, household_id, message, category, staff_id)
  values ('00000000-0000-0000-0000-0000000135d2', '00000000-0000-0000-0000-0000000135f1',
          'Tombol foto susah ditekan', 'problem', '00000000-0000-0000-0000-0000000135e1')
$q$) = '', 'a staff phone sends feedback as the person on duty');
select pg_temp.ok((select created_by = '00000000-0000-0000-0000-0000000135b1'
                          and staff_id = '00000000-0000-0000-0000-0000000135e1'
                     from public.feedback where id = '00000000-0000-0000-0000-0000000135d2'),
  'the staff row keeps the person and the phone');

select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.feedback (household_id, message) values ('00000000-0000-0000-0000-0000000135f1', 'Siapa saya?')
$q$) like '%feedback_staff_required%', 'a staff phone must name who is sending');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.feedback (household_id, message, staff_id)
  values ('00000000-0000-0000-0000-0000000135f1', 'Saya Joko', '00000000-0000-0000-0000-0000000135e2')
$q$) like '%feedback_not_this_staff%', 'a staff phone can''t send as someone removed from the household');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.feedback (household_id, message, staff_id)
  values ('00000000-0000-0000-0000-0000000135f1', 'Saya Ibu', '$q$ || :'owner_profile' || $q$')
$q$) like '%feedback_not_this_staff%', 'a staff phone can''t send as the owner''s own profile');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.feedback (household_id, message, staff_id)
  values ('00000000-0000-0000-0000-0000000135f1', 'Saya Wati', '00000000-0000-0000-0000-0000000135e3')
$q$) like '%feedback_not_this_staff%', 'a staff phone can''t send as another household''s staff');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.feedback (household_id, message, staff_id)
  values ('00000000-0000-0000-0000-0000000135f2', 'Rumah lain', '00000000-0000-0000-0000-0000000135e3')
$q$) like '%row-level security%', 'a staff phone can''t send for another household');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.feedback (household_id, message, staff_id, created_by)
  values ('00000000-0000-0000-0000-0000000135f1', 'Atas nama HP lain', '00000000-0000-0000-0000-0000000135e1',
          '00000000-0000-0000-0000-0000000135b2')
$q$) = '' and (select count(*) = 0 from public.feedback where created_by = '00000000-0000-0000-0000-0000000135b2'),
  'a staff phone can''t file a row under another phone''s session');
-- The other household's staff phone sends one of its own, for the read checks.
select pg_temp.ok(pg_temp.err_as(:otherstaff, $q$
  insert into public.feedback (id, household_id, message, staff_id)
  values ('00000000-0000-0000-0000-0000000135d3', '00000000-0000-0000-0000-0000000135f2', 'Halo',
          '00000000-0000-0000-0000-0000000135e3')
$q$) = '', 'another household''s staff phone sends its own');

-- ---- Who reads what -------------------------------------------------------------
select pg_temp.ok(pg_temp.count_as(:owner, 'select count(*) from public.feedback') = 3,
  'an owner reads their household''s feedback, owners'' and staff''s');
select pg_temp.ok(pg_temp.count_as(:other, 'select count(*) from public.feedback') = 1,
  'another household''s owner reads only their own household''s');
select pg_temp.ok(pg_temp.count_as(:staff, 'select count(*) from public.feedback') = 0,
  'a staff phone reads no feedback, not even what it sent');
select pg_temp.ok(pg_temp.count_as(:staff2, 'select count(*) from public.feedback') = 0,
  'another phone of the household reads none either');

-- ---- Nobody changes or deletes it through the API --------------------------------
select pg_temp.ok(pg_temp.err_as(:owner, $q$
  update public.feedback set message = 'edited' where id = '00000000-0000-0000-0000-0000000135d2'
$q$) like '%permission denied%', 'an owner can''t edit feedback');
select pg_temp.ok(pg_temp.err_as(:owner, $q$
  delete from public.feedback where id = '00000000-0000-0000-0000-0000000135d2'
$q$) like '%permission denied%', 'an owner can''t delete feedback');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  delete from public.feedback where id = '00000000-0000-0000-0000-0000000135d2'
$q$) like '%permission denied%', 'a staff phone can''t delete feedback');

-- ---- Logged-out callers -----------------------------------------------------------
select pg_temp.ok(pg_temp.err_anon($q$ select count(*) from public.feedback $q$) like '%permission denied%',
  'logged-out callers can''t read feedback');
select pg_temp.ok(pg_temp.err_anon($q$
  insert into public.feedback (household_id, message) values ('00000000-0000-0000-0000-0000000135f1', 'anon')
$q$) like '%permission denied%', 'logged-out callers can''t send feedback');
select pg_temp.ok(not has_table_privilege('anon', 'public.feedback', 'select')
                  and not has_table_privilege('anon', 'public.feedback', 'insert'),
  'logged-out callers hold no grant on the table');

-- ---- The daily limit --------------------------------------------------------------
do $$
begin
  for i in 1..18 loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', '00000000-0000-0000-0000-0000000135b2', 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into public.feedback (household_id, message, staff_id)
    values ('00000000-0000-0000-0000-0000000135f1', 'Pesan ' || i, '00000000-0000-0000-0000-0000000135e1');
    reset role;
  end loop;
end $$;
select pg_temp.ok(pg_temp.err_as(:staff2, $q$
  insert into public.feedback (household_id, message, staff_id)
  values ('00000000-0000-0000-0000-0000000135f1', 'Ke-19', '00000000-0000-0000-0000-0000000135e1')
$q$) = '', '19 in a day is fine');
select pg_temp.ok(pg_temp.err_as(:staff2, $q$
  insert into public.feedback (household_id, message, staff_id)
  values ('00000000-0000-0000-0000-0000000135f1', 'Ke-20', '00000000-0000-0000-0000-0000000135e1')
$q$) = '', '20 in a day is fine');
select pg_temp.ok(pg_temp.err_as(:staff2, $q$
  insert into public.feedback (household_id, message, staff_id)
  values ('00000000-0000-0000-0000-0000000135f1', 'Ke-21', '00000000-0000-0000-0000-0000000135e1')
$q$) like '%feedback_daily_limit%', 'the 21st from one session in a day is refused');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.feedback (household_id, message, staff_id)
  values ('00000000-0000-0000-0000-0000000135f1', 'HP lain', '00000000-0000-0000-0000-0000000135e1')
$q$) = '', 'the limit is per session: another phone still sends');

-- ---- Kept 2 years ------------------------------------------------------------------
-- No session from here on: maintenance, as the nightly job runs.
select set_config('request.jwt.claims', '', true) \g /dev/null
insert into public.feedback (id, household_id, message) values
  ('00000000-0000-0000-0000-0000000135d8', '00000000-0000-0000-0000-0000000135f1', 'old'),
  ('00000000-0000-0000-0000-0000000135d9', '00000000-0000-0000-0000-0000000135f1', 'not so old');
update public.feedback set created_at = now() - interval '2 years 1 day' where id = '00000000-0000-0000-0000-0000000135d8';
update public.feedback set created_at = now() - interval '1 year 11 months' where id = '00000000-0000-0000-0000-0000000135d9';
select pg_temp.ok(public.prune_old_feedback() = 1, 'the clean-up deletes one row');
select pg_temp.ok(not exists (select 1 from public.feedback where id = '00000000-0000-0000-0000-0000000135d8'),
  'feedback older than 2 years is deleted');
select pg_temp.ok(exists (select 1 from public.feedback where id = '00000000-0000-0000-0000-0000000135d9'),
  'feedback younger than 2 years stays');
select pg_temp.ok((select count(*) = 1 from cron.job
                    where jobname = 'prune-old-feedback' and command like '%prune_old_feedback%'),
  'the nightly job is scheduled');

-- ---- The export includes feedback -----------------------------------------------------
create temp table exported (data jsonb);
grant insert on exported to authenticated;
select pg_temp.ok(pg_temp.err_as(:owner, $q$ insert into exported select public.export_household_data() $q$) = '',
  'an owner exports the household');
select pg_temp.ok((select jsonb_array_length(data -> 'feedback') >= 2
                          and (data -> 'feedback') @> '[{"staff": "Sari", "from_admin": false}]'
                          and (data -> 'feedback') @> '[{"message": "Would love a dark mode", "from_admin": true}]'
                          and not (data::text like '%Halo%')
                     from exported),
  'the export lists the household''s feedback, and no other household''s');
select pg_temp.ok(pg_temp.err_as(:staff, $q$ select public.export_household_data() $q$) like '%admins_only%',
  'a staff phone still can''t export');

-- ---- Deleting the household takes its feedback ------------------------------------------
delete from public.households where id = '00000000-0000-0000-0000-0000000135f2';
select pg_temp.ok(not exists (select 1 from public.feedback where id = '00000000-0000-0000-0000-0000000135d3'),
  'a deleted household''s feedback goes with it');

-- ---- Grants -------------------------------------------------------------------------------
select pg_temp.ok(
  not exists (
    select 1 from unnest(array['public.feedback_guard()', 'public.prune_old_feedback()']) f
    where has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute')
  ), 'no new function is callable from the API');
select pg_temp.ok(has_function_privilege('authenticated', 'public.export_household_data()', 'execute')
                  and not has_function_privilege('anon', 'public.export_household_data()', 'execute'),
  'the export stays for signed-in owners only');
select pg_temp.ok(
  (select bool_and(proconfig = array['search_path=""']) from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('feedback_guard', 'prune_old_feedback', 'export_household_data')),
  'every new or replaced function has an empty search_path');

rollback;
