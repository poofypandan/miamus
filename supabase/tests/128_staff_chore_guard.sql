-- Migration 128 checks: a staff phone can claim, finish (with its photos) and
-- materialise one day of a repeat, exactly as the staff screens do; it can't
-- rename, move, reschedule, re-repeat, create or delete chores. Owners keep
-- every power; the service role passes; grants are locked down.
-- LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/128_staff_chore_guard.sql
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

-- An owner (a1) and a staff phone (b1) in household f1; another household f2
-- with its own owner (a2) and staff phone (b2).
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, anon, now(), now()
from (values
  ('00000000-0000-0000-0000-0000000128a1', 'owner128@test.local', false),
  ('00000000-0000-0000-0000-0000000128a2', 'other128@test.local', false),
  ('00000000-0000-0000-0000-0000000128b1', null, true),
  ('00000000-0000-0000-0000-0000000128b2', null, true)
) as u(id, email, anon);
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000128f1', 'Rumah Melati', '00000000-0000-0000-0000-0000000128a1'),
  ('00000000-0000-0000-0000-0000000128f2', 'Rumah lain', '00000000-0000-0000-0000-0000000128a2');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000128f1', '00000000-0000-0000-0000-0000000128a1', 'owner'),
  ('00000000-0000-0000-0000-0000000128f2', '00000000-0000-0000-0000-0000000128a2', 'owner');
insert into public.device_sessions (user_id, household_id) values
  ('00000000-0000-0000-0000-0000000128b1', '00000000-0000-0000-0000-0000000128f1'),
  ('00000000-0000-0000-0000-0000000128b2', '00000000-0000-0000-0000-0000000128f2');
insert into public.staff_profiles (id, household_id, name) values
  ('00000000-0000-0000-0000-0000000128e1', '00000000-0000-0000-0000-0000000128f1', 'Sari');
insert into public.household_locations (id, household_id, name) values
  ('00000000-0000-0000-0000-0000000128c1', '00000000-0000-0000-0000-0000000128f1', 'Teras'),
  ('00000000-0000-0000-0000-0000000128c2', '00000000-0000-0000-0000-0000000128f1', 'Dapur');
-- A weekly template, a one-off, and a weekly template in the other household.
insert into public.household_tasks (id, household_id, title, notes, category, due_date, due_time, recurrence, location_id) values
  ('00000000-0000-0000-0000-0000000128d1', '00000000-0000-0000-0000-0000000128f1', 'Pel teras', 'Pakai lap hijau', 'cleaning', '2026-11-16', '09:00', 'weekly', '00000000-0000-0000-0000-0000000128c1'),
  ('00000000-0000-0000-0000-0000000128d2', '00000000-0000-0000-0000-0000000128f1', 'Cuci mobil', null, 'cleaning', '2026-11-12', null, 'none', null),
  ('00000000-0000-0000-0000-0000000128d3', '00000000-0000-0000-0000-0000000128f2', 'Sapu halaman', null, 'cleaning', '2026-11-16', null, 'weekly', null);

\set owner '''00000000-0000-0000-0000-0000000128a1'''
\set staff '''00000000-0000-0000-0000-0000000128b1'''
\set staff2 '''00000000-0000-0000-0000-0000000128b2'''

-- ---- What staff screens do: still allowed ------------------------------------
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  update public.household_tasks set assigned_to = '00000000-0000-0000-0000-0000000128e1'
   where id = '00000000-0000-0000-0000-0000000128d2' $q$) = '', 'staff claims a chore');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  update public.household_tasks
     set status = 'completed', completed_at = now(), completed_by = '00000000-0000-0000-0000-0000000128e1',
         before_photo_url = 'b.jpg', after_photo_url = 'a.jpg'
   where id = '00000000-0000-0000-0000-0000000128d2' $q$) = '', 'staff finishes it with both photos');
select pg_temp.ok(
  (select status = 'completed' and after_photo_url = 'a.jpg' from public.household_tasks where id = '00000000-0000-0000-0000-0000000128d2'),
  'the finish was saved');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  update public.household_tasks set status = 'pending', completed_at = null, completed_by = null,
         photo_url = null, before_photo_url = null, after_photo_url = null
   where id = '00000000-0000-0000-0000-0000000128d2' $q$) = '', 'staff reopens it (Undo)');
-- Materialising one day of the repeat, exactly as FinishChoreSheet does.
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.household_tasks (household_id, parent_task_id, title, notes, category, assigned_to,
    due_date, due_time, requires_supervision, location_id, recurrence, status)
  values ('00000000-0000-0000-0000-0000000128f1', '00000000-0000-0000-0000-0000000128d1', 'Pel teras', 'Pakai lap hijau',
    'cleaning', '00000000-0000-0000-0000-0000000128e1', '2026-11-23', '09:00', false,
    '00000000-0000-0000-0000-0000000128c1', 'none', 'pending') $q$) = '', 'staff materialises a day of the repeat');

-- ---- What they could do before, and can't now ---------------------------------
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  update public.household_tasks set title = 'Tidur siang' where id = '00000000-0000-0000-0000-0000000128d1' $q$)
  = 'chore_owner_only', 'staff cannot rename a chore');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  update public.household_tasks set location_id = '00000000-0000-0000-0000-0000000128c2' where id = '00000000-0000-0000-0000-0000000128d1' $q$)
  = 'chore_owner_only', 'staff cannot move it to another room');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  update public.household_tasks set recurrence = 'none' where id = '00000000-0000-0000-0000-0000000128d1' $q$)
  = 'chore_owner_only', 'staff cannot stop a repeat');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  update public.household_tasks set due_date = '2026-12-01', due_time = '15:00' where id = '00000000-0000-0000-0000-0000000128d2' $q$)
  = 'chore_owner_only', 'staff cannot reschedule');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  update public.household_tasks set notes = 'Tidak usah' where id = '00000000-0000-0000-0000-0000000128d2' $q$)
  = 'chore_owner_only', 'staff cannot change the notes');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  update public.household_tasks set requires_supervision = true where id = '00000000-0000-0000-0000-0000000128d2' $q$)
  = 'chore_owner_only', 'staff cannot change supervision');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  update public.household_tasks set household_id = '00000000-0000-0000-0000-0000000128f2' where id = '00000000-0000-0000-0000-0000000128d2' $q$)
  <> '', 'staff cannot move a chore to another household');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  delete from public.household_tasks where id = '00000000-0000-0000-0000-0000000128d2' $q$)
  = 'chore_owner_only', 'staff cannot delete a chore');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.household_tasks (household_id, title, category, due_date)
  values ('00000000-0000-0000-0000-0000000128f1', 'Libur', 'cleaning', '2026-11-20') $q$)
  = 'chore_owner_only', 'staff cannot create a chore of its own');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.household_tasks (household_id, parent_task_id, title, notes, category, due_date, due_time, location_id, recurrence)
  values ('00000000-0000-0000-0000-0000000128f1', '00000000-0000-0000-0000-0000000128d1', 'Pel teras saja', 'Pakai lap hijau',
    'cleaning', '2026-11-30', '09:00', '00000000-0000-0000-0000-0000000128c1', 'none') $q$)
  = 'chore_owner_only', 'a materialised day must copy the template''s title');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.household_tasks (household_id, parent_task_id, title, notes, category, due_date, due_time, location_id, recurrence)
  values ('00000000-0000-0000-0000-0000000128f1', '00000000-0000-0000-0000-0000000128d1', 'Pel teras', 'Pakai lap hijau',
    'cleaning', '2026-11-30', '09:00', '00000000-0000-0000-0000-0000000128c1', 'weekly') $q$)
  = 'chore_owner_only', 'a materialised day cannot repeat');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.household_tasks (household_id, parent_task_id, title, category, due_date, recurrence)
  values ('00000000-0000-0000-0000-0000000128f1', '00000000-0000-0000-0000-0000000128d2', 'Cuci mobil', 'cleaning', '2026-11-30', 'none') $q$)
  = 'chore_owner_only', 'only a repeat can be materialised');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.household_tasks (household_id, parent_task_id, title, category, due_date, recurrence)
  values ('00000000-0000-0000-0000-0000000128f1', '00000000-0000-0000-0000-0000000128d3', 'Sapu halaman', 'cleaning', '2026-11-30', 'none') $q$)
  = 'chore_owner_only', 'never from another household''s template');
select pg_temp.ok(
  (select title = 'Pel teras' and recurrence = 'weekly' and location_id = '00000000-0000-0000-0000-0000000128c1'
     from public.household_tasks where id = '00000000-0000-0000-0000-0000000128d1'),
  'the template is unchanged');

-- Another household's staff phone sees and changes nothing here (RLS, as before).
select pg_temp.ok(pg_temp.err_as(:staff2, $q$
  do $d$ begin
    if (select count(*) from public.household_tasks where household_id = '00000000-0000-0000-0000-0000000128f1') > 0
    then raise exception 'saw another household'; end if;
  end $d$ $q$) = '', 'another household''s phone sees none of these chores');

-- ---- Owners keep every power ---------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:owner, $q$
  update public.household_tasks set title = 'Pel teras depan', location_id = '00000000-0000-0000-0000-0000000128c2',
         due_time = '10:00', recurrence = 'monthly'
   where id = '00000000-0000-0000-0000-0000000128d1' $q$) = '', 'the owner edits every field');
select pg_temp.ok(pg_temp.err_as(:owner, $q$
  insert into public.household_tasks (household_id, title, category, due_date)
  values ('00000000-0000-0000-0000-0000000128f1', 'Siram tanaman', 'cleaning', '2026-11-20') $q$) = '', 'the owner creates a chore');
select pg_temp.ok(pg_temp.err_as(:owner, $q$
  delete from public.household_tasks where id = '00000000-0000-0000-0000-0000000128d2' $q$) = '', 'the owner deletes a chore');

-- ---- The database's own jobs pass ----------------------------------------------
select set_config('request.jwt.claims', '', true);
update public.household_tasks set title = 'Pel teras (job)' where id = '00000000-0000-0000-0000-0000000128d1';
select pg_temp.ok(
  (select title = 'Pel teras (job)' from public.household_tasks where id = '00000000-0000-0000-0000-0000000128d1'),
  'no signed-in user (service role, cron): passes');

-- ---- Grants --------------------------------------------------------------------
select pg_temp.ok(not has_function_privilege('anon', 'public.household_tasks_owner_guard()', 'execute'), 'anon cannot execute the guard');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.household_tasks_owner_guard()', 'execute'), 'authenticated cannot execute the guard');
select pg_temp.ok(
  (select prosecdef and proconfig = array['search_path=""'] from pg_proc where oid = 'public.household_tasks_owner_guard()'::regprocedure),
  'security definer with an empty search_path');
select pg_temp.ok(
  exists (select 1 from pg_trigger where tgname = 'household_tasks_owner_guard' and tgrelid = 'public.household_tasks'::regclass and tgenabled = 'O'),
  'the trigger is on household_tasks');

rollback;
