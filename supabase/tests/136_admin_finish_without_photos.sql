-- Migration 136 checks: an admin may finish their own (or an unassigned)
-- chore with no photos; one photo alone is still refused; a staff member's
-- chore, a staff phone, a logged-out caller and another household's admin
-- still need both photos; reassigning a staff chore and finishing it
-- photo-free in one write is refused, in two writes allowed; nothing the API
-- acts as can execute the trigger function.
-- LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/136_admin_finish_without_photos.sql
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
  if uid is null then
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    execute 'set local role anon';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
  end if;
  begin
    execute stmt;
  exception when others then
    execute 'reset role';
    return sqlerrm;
  end;
  execute 'reset role';
  return '';
end $$;

-- a1 owns f1; a2 owns f2; b1 is f1's staff phone; Ari (s1) is f1's staff.
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, anon, now(), now()
from (values
  ('00000000-0000-0000-0000-0000000136a1', 'owner136@test.local', false),
  ('00000000-0000-0000-0000-0000000136a2', 'other136@test.local', false),
  ('00000000-0000-0000-0000-0000000136b1', null, true)
) as u(id, email, anon);
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000136f1', 'Rumah Melati', '00000000-0000-0000-0000-0000000136a1'),
  ('00000000-0000-0000-0000-0000000136f2', 'Rumah Kenanga', '00000000-0000-0000-0000-0000000136a2');
-- The membership trigger (migrations/106) gives each admin a roster row.
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000136f1', '00000000-0000-0000-0000-0000000136a1', 'owner'),
  ('00000000-0000-0000-0000-0000000136f2', '00000000-0000-0000-0000-0000000136a2', 'owner');
insert into public.device_sessions (user_id, household_id) values
  ('00000000-0000-0000-0000-0000000136b1', '00000000-0000-0000-0000-0000000136f1');
insert into public.staff_profiles (id, household_id, name) values
  ('00000000-0000-0000-0000-0000000136c1', '00000000-0000-0000-0000-0000000136f1', 'Ari');

select pg_temp.ok((select count(*) = 1 from public.staff_profiles
                    where user_id = '00000000-0000-0000-0000-0000000136a1'), 'setup: the admin has a roster row');

-- Chores in f1: t1..t5 are the admin's own, u1 is unassigned, s1/s2/s3 are
-- Ari's, x1 is unassigned in f1 for the other household's admin to try.
insert into public.household_tasks (id, household_id, title, assigned_to)
select t.id::uuid, '00000000-0000-0000-0000-0000000136f1', t.title,
       case t.who
         when 'me' then (select id from public.staff_profiles where user_id = '00000000-0000-0000-0000-0000000136a1')
         when 'ari' then '00000000-0000-0000-0000-0000000136c1'::uuid
       end
from (values
  ('00000000-0000-0000-0000-0000000136d1', 'Water the plants', 'me'),
  ('00000000-0000-0000-0000-0000000136d2', 'Pay the bill', 'me'),
  ('00000000-0000-0000-0000-0000000136d3', 'Pick up laundry', 'me'),
  ('00000000-0000-0000-0000-0000000136d4', 'Staff phone tries mine', 'me'),
  ('00000000-0000-0000-0000-0000000136d5', 'Logged-out tries mine', 'me'),
  ('00000000-0000-0000-0000-0000000136e1', 'Unassigned', null),
  ('00000000-0000-0000-0000-000000013601', 'Ari: mop', 'ari'),
  ('00000000-0000-0000-0000-000000013602', 'Ari: vacuum', 'ari'),
  ('00000000-0000-0000-0000-000000013603', 'Ari: sweep', 'ari'),
  ('00000000-0000-0000-0000-000000013604', 'Ari: dust', 'ari'),
  ('00000000-0000-0000-0000-000000013605', 'Unassigned, other house tries', null)
) as t(id, title, who);

\set owner '''00000000-0000-0000-0000-0000000136a1'''
\set other '''00000000-0000-0000-0000-0000000136a2'''
\set staff '''00000000-0000-0000-0000-0000000136b1'''

-- ---- The admin's own chore ----------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:owner, format(
  $q$update public.household_tasks set status = 'completed', completed_by = %L, completed_at = now()
      where id = '00000000-0000-0000-0000-0000000136d1'$q$, (select id from public.staff_profiles where user_id = :owner))) = '',
  'admin finishes their own chore with no photos');
select pg_temp.ok((select status = 'completed' from public.household_tasks where id = '00000000-0000-0000-0000-0000000136d1'),
  '... and it is completed');

select pg_temp.ok(pg_temp.err_as(:owner, format(
  $q$update public.household_tasks set status = 'completed', completed_by = %L, after_photo_url = 'x/after.jpg'
      where id = '00000000-0000-0000-0000-0000000136d2'$q$, (select id from public.staff_profiles where user_id = :owner)))
  like 'A chore is completed with both%',
  'admin, own chore, one photo only: refused (both or none)');

select pg_temp.ok(pg_temp.err_as(:owner, format(
  $q$update public.household_tasks set status = 'completed', completed_by = %L,
        before_photo_url = 'x/before.jpg', after_photo_url = 'x/after.jpg', photo_url = 'x/after.jpg'
      where id = '00000000-0000-0000-0000-0000000136d3'$q$, (select id from public.staff_profiles where user_id = :owner))) = '',
  'admin, own chore, both photos: allowed');

select pg_temp.ok(pg_temp.err_as(:owner, $q$update public.household_tasks set status = 'completed', completed_by = null
      where id = '00000000-0000-0000-0000-0000000136d2'$q$) like 'A chore is completed with both%',
  'admin, own chore, completed_by not set to themselves: refused');

-- Marking it not done again needs nothing.
select pg_temp.ok(pg_temp.err_as(:owner, $q$update public.household_tasks
      set status = 'pending', completed_by = null, completed_at = null
      where id = '00000000-0000-0000-0000-0000000136d1'$q$) = '',
  'admin marks their own chore not done again');

-- ---- Unassigned ---------------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:owner, format(
  $q$update public.household_tasks set status = 'completed', completed_by = %L
      where id = '00000000-0000-0000-0000-0000000136e1'$q$, (select id from public.staff_profiles where user_id = :owner))) = '',
  'admin finishes an unassigned chore with no photos');

-- ---- Someone else's chore -----------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:owner, format(
  $q$update public.household_tasks set status = 'completed', completed_by = %L
      where id = '00000000-0000-0000-0000-000000013601'$q$, (select id from public.staff_profiles where user_id = :owner)))
  like 'A chore is completed with both%',
  'admin finishes a staff member''s chore with no photos, completed_by themselves: refused');

select pg_temp.ok(pg_temp.err_as(:owner, format(
  $q$update public.household_tasks set status = 'completed', completed_by = %1$L, assigned_to = %1$L
      where id = '00000000-0000-0000-0000-000000013602'$q$, (select id from public.staff_profiles where user_id = :owner)))
  like 'A chore is completed with both%',
  'admin reassigns a staff chore to themselves and finishes it in the same write: refused');

select pg_temp.ok(pg_temp.err_as(:owner, format(
  $q$update public.household_tasks set assigned_to = %L
      where id = '00000000-0000-0000-0000-000000013603'$q$, (select id from public.staff_profiles where user_id = :owner))) = '',
  'admin takes over a staff chore (a separate edit)');
select pg_temp.ok(pg_temp.err_as(:owner, format(
  $q$update public.household_tasks set status = 'completed', completed_by = %L
      where id = '00000000-0000-0000-0000-000000013603'$q$, (select id from public.staff_profiles where user_id = :owner))) = '',
  '... then finishes it with no photos: allowed');

select pg_temp.ok(pg_temp.err_as(:owner, $q$update public.household_tasks
      set status = 'completed', completed_by = '00000000-0000-0000-0000-0000000136c1'
      where id = '00000000-0000-0000-0000-000000013604'$q$) like 'A chore is completed with both%',
  'admin marks a staff chore done in the staff member''s name with no photos: refused');

-- ---- Staff phones, logged-out callers, other households ----------------------
select pg_temp.ok(pg_temp.err_as(:staff, $q$update public.household_tasks
      set status = 'completed', completed_by = '00000000-0000-0000-0000-0000000136c1'
      where id = '00000000-0000-0000-0000-000000013604'$q$) like 'A chore is completed with both%',
  'staff phone, its own chore, no photos: refused');

select pg_temp.ok(pg_temp.err_as(:staff, format(
  $q$update public.household_tasks set status = 'completed', completed_by = %L
      where id = '00000000-0000-0000-0000-0000000136d4'$q$, (select id from public.staff_profiles where user_id = :owner)))
  like 'A chore is completed with both%',
  'staff phone finishing the admin''s chore in the admin''s name, no photos: refused');

select pg_temp.ok(pg_temp.err_as(:staff, $q$update public.household_tasks
      set status = 'completed', completed_by = '00000000-0000-0000-0000-0000000136c1',
          before_photo_url = 'x/b.jpg', after_photo_url = 'x/a.jpg', photo_url = 'x/a.jpg'
      where id = '00000000-0000-0000-0000-000000013604'$q$) = '',
  'staff phone with both photos: allowed, as before');

-- Logged out: RLS hides every row, so nothing is updated; the trigger never runs.
select pg_temp.ok(pg_temp.err_as(null, $q$update public.household_tasks set status = 'completed'
      where id = '00000000-0000-0000-0000-0000000136d5'$q$) is not null
  and (select status = 'pending' from public.household_tasks where id = '00000000-0000-0000-0000-0000000136d5'),
  'logged-out caller: nothing completed');

-- The other household's admin, naming their own roster row on f1's chore.
select pg_temp.ok((select status = 'pending' from public.household_tasks where id = '00000000-0000-0000-0000-000000013605')
  and (pg_temp.err_as(:other, format(
  $q$update public.household_tasks set status = 'completed', completed_by = %L
      where id = '00000000-0000-0000-0000-000000013605'$q$, (select id from public.staff_profiles where user_id = :other))) is not null)
  and (select status = 'pending' from public.household_tasks where id = '00000000-0000-0000-0000-000000013605'),
  'another household''s admin: nothing completed');

-- A straight insert as completed, photo-free, for oneself (not an app path,
-- but the rule is the same): allowed; for Ari: refused.
select pg_temp.ok(pg_temp.err_as(:owner, format(
  $q$insert into public.household_tasks (household_id, title, status, assigned_to, completed_by)
      values ('00000000-0000-0000-0000-0000000136f1', 'Done already', 'completed', %1$L, %1$L)$q$,
  (select id from public.staff_profiles where user_id = :owner))) = '',
  'insert as completed, own, no photos: allowed');
select pg_temp.ok(pg_temp.err_as(:owner, format(
  $q$insert into public.household_tasks (household_id, title, status, assigned_to, completed_by)
      values ('00000000-0000-0000-0000-0000000136f1', 'Done for Ari', 'completed', '00000000-0000-0000-0000-0000000136c1', %L)$q$,
  (select id from public.staff_profiles where user_id = :owner))) like 'A chore is completed with both%',
  'insert as completed, staff chore, no photos: refused');

-- ---- Grants -------------------------------------------------------------------
select pg_temp.ok(not has_function_privilege('anon', 'public.require_chore_proof_photos()', 'execute'),
  'anon cannot execute the trigger function');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.require_chore_proof_photos()', 'execute'),
  'authenticated cannot execute the trigger function');
select pg_temp.ok((select prosecdef from pg_proc where oid = 'public.require_chore_proof_photos()'::regprocedure),
  'the trigger function is security definer');
select pg_temp.ok((select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.require_chore_proof_photos()'::regprocedure),
  'with an empty search_path');

rollback;
