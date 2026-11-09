-- Migration 130 checks: repairs reported by owners and staff phones, owners
-- deciding, staff phones limited to a report they can undo for 5 minutes,
-- archived staff and other households refused, urgent pushes, visits linked
-- by owners only, photo retention (2 years after closing), the nightly
-- clean-up, the export, and every new function's grants.
-- LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/130_repairs.sql
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

insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, anon, now(), now()
from (values
  ('00000000-0000-0000-0000-0000000130a1', 'owner130@test.local', false),
  ('00000000-0000-0000-0000-0000000130a2', 'other130@test.local', false),
  ('00000000-0000-0000-0000-0000000130b1', null, true),
  ('00000000-0000-0000-0000-0000000130b2', null, true)
) as u(id, email, anon);
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000130f1', 'Rumah Kamboja', '00000000-0000-0000-0000-0000000130a1'),
  ('00000000-0000-0000-0000-0000000130f2', 'Rumah lain', '00000000-0000-0000-0000-0000000130a2');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000130f1', '00000000-0000-0000-0000-0000000130a1', 'owner'),
  ('00000000-0000-0000-0000-0000000130f2', '00000000-0000-0000-0000-0000000130a2', 'owner');
-- Two staff phones of the first household.
insert into public.device_sessions (user_id, household_id) values
  ('00000000-0000-0000-0000-0000000130b1', '00000000-0000-0000-0000-0000000130f1'),
  ('00000000-0000-0000-0000-0000000130b2', '00000000-0000-0000-0000-0000000130f1');
insert into public.staff_profiles (id, household_id, name, archived_at) values
  ('00000000-0000-0000-0000-0000000130e1', '00000000-0000-0000-0000-0000000130f1', 'Sari', null),
  ('00000000-0000-0000-0000-0000000130e2', '00000000-0000-0000-0000-0000000130f1', 'Joko', now()),
  ('00000000-0000-0000-0000-0000000130e3', '00000000-0000-0000-0000-0000000130f2', 'Wati', null);
insert into public.household_locations (id, household_id, name, kind, parent_id) values
  ('00000000-0000-0000-0000-0000000130c1', '00000000-0000-0000-0000-0000000130f1', 'LT2', 'floor', null),
  ('00000000-0000-0000-0000-0000000130c9', '00000000-0000-0000-0000-0000000130f2', 'Other room', 'room', null);
insert into public.household_locations (id, household_id, name, kind, parent_id) values
  ('00000000-0000-0000-0000-0000000130c2', '00000000-0000-0000-0000-0000000130f1', 'GB2 Bathroom', 'room', '00000000-0000-0000-0000-0000000130c1');

-- Owner pushes, captured instead of sent (replaced for this transaction only).
create temp table pushes (household uuid, title_en text, body_en text, title_id text, body_id text, url text);
grant insert on pushes to authenticated;
create or replace function public.queue_owner_push(
  p_household_id uuid, p_title_en text, p_body_en text, p_title_id text, p_body_id text,
  p_url text default '/', p_tag text default null, p_exclude_user_id uuid default null)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  insert into pg_temp.pushes values (p_household_id, p_title_en, p_body_en, p_title_id, p_body_id, p_url);
  return true;
end $$;

\set owner '''00000000-0000-0000-0000-0000000130a1'''
\set other '''00000000-0000-0000-0000-0000000130a2'''
\set staff '''00000000-0000-0000-0000-0000000130b1'''
\set staff2 '''00000000-0000-0000-0000-0000000130b2'''

-- ---- Owners report, straight on the list ----------------------------------------
select pg_temp.ok(pg_temp.err_as(:owner, $q$
  insert into public.repairs (id, household_id, location_id, spot, title, status, created_by, decided_at)
  values ('00000000-0000-0000-0000-0000000130d1', '00000000-0000-0000-0000-0000000130f1',
          '00000000-0000-0000-0000-0000000130c2', '  Wastafel ', '  Keran bocor ', 'open',
          '00000000-0000-0000-0000-0000000130a2', now()) $q$) = '', 'an owner reports a problem');
select pg_temp.ok((select title = 'Keran bocor' and spot = 'Wastafel' and status = 'open'
                     and created_by = '00000000-0000-0000-0000-0000000130a1' and decided_at is null
                   from public.repairs where id = '00000000-0000-0000-0000-0000000130d1'),
  'the server trims it and decides who made it; a client can''t set a decision');
select pg_temp.ok(pg_temp.err_as(:owner, $q$
  insert into public.repairs (household_id, title, status) values ('00000000-0000-0000-0000-0000000130f1', 'x', 'reported') $q$)
  like '%repair_owner_reports_open%', 'an owner''s report is open, not waiting for review');
select pg_temp.ok((select count(*) = 0 from pg_temp.pushes), 'an owner''s report sends no push');
select pg_temp.ok(pg_temp.err_as(:owner, $q$
  insert into public.repairs (household_id, title, status, location_id)
  values ('00000000-0000-0000-0000-0000000130f1', 'x', 'open', '00000000-0000-0000-0000-0000000130c9') $q$) <> '',
  'a repair can''t name another household''s room');

-- ---- Staff phones report, and wait for an owner ----------------------------------
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.repairs (id, household_id, location_id, title, status, reported_by_staff)
  values ('00000000-0000-0000-0000-0000000130d2', '00000000-0000-0000-0000-0000000130f1',
          '00000000-0000-0000-0000-0000000130c2', 'Dinding retak', 'reported', '00000000-0000-0000-0000-0000000130e1') $q$) = '',
  'a staff phone reports a problem, waiting for review');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.repairs (household_id, title, status, reported_by_staff)
  values ('00000000-0000-0000-0000-0000000130f1', 'x', 'open', '00000000-0000-0000-0000-0000000130e1') $q$)
  like '%repair_staff_report_only%', 'a staff phone can''t put a repair straight on the list');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.repairs (household_id, title, status) values ('00000000-0000-0000-0000-0000000130f1', 'x', 'reported') $q$)
  like '%repair_staff_report_only%', 'a staff report names who reported it');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.repairs (household_id, title, status, reported_by_staff, fixed_by_name)
  values ('00000000-0000-0000-0000-0000000130f1', 'x', 'reported', '00000000-0000-0000-0000-0000000130e1', 'Pak Budi') $q$)
  like '%repair_staff_report_only%', 'a staff report carries no owner fields');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.repairs (household_id, title, status, reported_by_staff)
  values ('00000000-0000-0000-0000-0000000130f1', 'x', 'reported', '00000000-0000-0000-0000-0000000130e2') $q$)
  like '%staff_archived%', 'someone removed from the household can''t report');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.repairs (household_id, title, status, reported_by_staff)
  values ('00000000-0000-0000-0000-0000000130f1', 'x', 'reported', '00000000-0000-0000-0000-0000000130e3') $q$)
  like '%staff_not_in_household%', 'a staff report names someone of this household');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.repairs (household_id, title, status, reported_by_staff)
  values ('00000000-0000-0000-0000-0000000130f2', 'x', 'reported', '00000000-0000-0000-0000-0000000130e3') $q$) <> '',
  'a staff phone can''t report into another household');
select pg_temp.ok((select count(*) = 0 from pg_temp.pushes), 'a normal staff report sends no push (D6)');

-- Urgent: one push, in both languages, composed by the database.
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.repairs (id, household_id, location_id, spot, title, status, reported_by_staff, urgent)
  values ('00000000-0000-0000-0000-0000000130d3', '00000000-0000-0000-0000-0000000130f1',
          '00000000-0000-0000-0000-0000000130c2', 'Wastafel', 'Pipa bocor', 'reported', '00000000-0000-0000-0000-0000000130e1', true) $q$) = '',
  'a staff phone reports something urgent');
select pg_temp.ok((select count(*) = 1 from pg_temp.pushes), 'an urgent staff report queues the owners'' push');
select pg_temp.ok((select title_en = 'Urgent repair' and title_id = 'Perbaikan darurat'
                     and body_id = 'LT2 · GB2 Bathroom · Wastafel — Pipa bocor (Sari)'
                     and url = '/dashboard?module=chores&chores=repairs'
                   from pg_temp.pushes),
  'the push names the place, the problem and who reported it');

-- ---- Staff phones can't decide, edit or delete (except their own Undo) -----------
select pg_temp.ok(pg_temp.count_as(:staff, $q$ select count(*) from public.repairs $q$) = 3,
  'a staff phone sees its household''s repairs');
select pg_temp.ok(pg_temp.count_as(:other, $q$ select count(*) from public.repairs $q$) = 0,
  'another household sees none');
select pg_temp.ok(pg_temp.count_as(:staff, $q$
  with u as (update public.repairs set status = 'open' where id = '00000000-0000-0000-0000-0000000130d2' returning 1)
  select count(*) from u $q$) = 0, 'a staff phone can''t accept a report');
select pg_temp.ok(pg_temp.count_as(:staff, $q$
  with u as (update public.repairs set title = 'changed' where id = '00000000-0000-0000-0000-0000000130d1' returning 1)
  select count(*) from u $q$) = 0, 'a staff phone can''t edit a repair');
select pg_temp.ok(pg_temp.count_as(:staff, $q$
  with d as (delete from public.repairs where id = '00000000-0000-0000-0000-0000000130d1' returning 1)
  select count(*) from d $q$) = 0, 'a staff phone can''t delete an owner''s repair');
select pg_temp.ok(pg_temp.count_as(:staff2, $q$
  with d as (delete from public.repairs where id = '00000000-0000-0000-0000-0000000130d2' returning 1)
  select count(*) from d $q$) = 0, 'another staff phone can''t delete someone else''s report');
select pg_temp.ok(pg_temp.count_as(:staff, $q$
  with d as (delete from public.repairs where id = '00000000-0000-0000-0000-0000000130d3' returning 1)
  select count(*) from d $q$) = 1, 'the phone that reported it can undo it within 5 minutes');
set local session_replication_role = replica;
update public.repairs set created_at = now() - interval '6 minutes' where id = '00000000-0000-0000-0000-0000000130d2';
set local session_replication_role = origin;
select pg_temp.ok(pg_temp.count_as(:staff, $q$
  with d as (delete from public.repairs where id = '00000000-0000-0000-0000-0000000130d2' returning 1)
  select count(*) from d $q$) = 0, 'not after 5 minutes');

-- ---- Owners decide ----------------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:owner, $q$
  update public.repairs set status = 'open' where id = '00000000-0000-0000-0000-0000000130d2' $q$) = '', 'an owner accepts a staff report');
select pg_temp.ok((select status = 'open' and decided_by = '00000000-0000-0000-0000-0000000130a1' and decided_at is not null
                     and reported_by_staff = '00000000-0000-0000-0000-0000000130e1'
                   from public.repairs where id = '00000000-0000-0000-0000-0000000130d2'),
  'accepting records who decided, and keeps who reported it');
select pg_temp.ok(pg_temp.err_as(:owner, $q$
  update public.repairs set status = 'reported' where id = '00000000-0000-0000-0000-0000000130d2' $q$)
  like '%repair_cannot_return_to_reported%', 'an accepted repair can''t go back to waiting');
select pg_temp.ok(pg_temp.err_as(:owner, $q$
  update public.repairs set status = 'fixed', fixed_by_name = ' Pak Budi ' where id = '00000000-0000-0000-0000-0000000130d2' $q$) = '',
  'an owner marks it fixed, naming the repair person');
select pg_temp.ok((select closed_at is not null and fixed_by_name = 'Pak Budi' from public.repairs where id = '00000000-0000-0000-0000-0000000130d2'),
  'fixing stamps when it closed');
select pg_temp.ok(pg_temp.err_as(:owner, $q$
  update public.repairs set status = 'open' where id = '00000000-0000-0000-0000-0000000130d2' $q$) = '', 'an owner reopens it');
select pg_temp.ok((select closed_at is null from public.repairs where id = '00000000-0000-0000-0000-0000000130d2'),
  'reopening clears when it closed');
select pg_temp.ok(pg_temp.err_as(:owner, $q$
  update public.repairs set status = 'dismissed', dismiss_reason = 'Sudah diperbaiki minggu lalu' where id = '00000000-0000-0000-0000-0000000130d1' $q$) = '',
  'an owner dismisses one');
select pg_temp.ok((select closed_at is not null and dismiss_reason is not null from public.repairs where id = '00000000-0000-0000-0000-0000000130d1'),
  'with a reason staff can read, and it counts as closed');
select pg_temp.ok(pg_temp.count_as(:other, $q$
  with u as (update public.repairs set status = 'fixed' where id = '00000000-0000-0000-0000-0000000130d2' returning 1)
  select count(*) from u $q$) = 0, 'another household''s owner can''t touch it');
select pg_temp.ok(pg_temp.err_as(:owner, $q$
  update public.repairs set household_id = '00000000-0000-0000-0000-0000000130f2' where id = '00000000-0000-0000-0000-0000000130d2' $q$) <> '',
  'a repair can''t move to another household');

-- ---- Visits: chores linked to a repair, by owners only -----------------------------
select pg_temp.ok(pg_temp.err_as(:owner, $q$
  insert into public.household_tasks (id, household_id, title, category, due_date, repair_id, location_id)
  values ('00000000-0000-0000-0000-000000013011', '00000000-0000-0000-0000-0000000130f1', 'Perbaiki: dinding retak',
          'maintenance', current_date, '00000000-0000-0000-0000-0000000130d2', '00000000-0000-0000-0000-0000000130c2') $q$) = '',
  'an owner schedules a visit');
select pg_temp.ok(pg_temp.err_as(:owner, $q$
  insert into public.household_tasks (household_id, title, category, due_date, repair_id)
  values ('00000000-0000-0000-0000-0000000130f2', 'x', 'maintenance', current_date, '00000000-0000-0000-0000-0000000130d2') $q$) <> '',
  'a chore can''t point at another household''s repair');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  update public.household_tasks set repair_id = null where id = '00000000-0000-0000-0000-000000013011' $q$)
  like '%chore_owner_only%', 'a staff phone can''t unlink a visit');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  update public.household_tasks set status = 'completed', completed_at = now(), assigned_to = '00000000-0000-0000-0000-0000000130e1',
    completed_by = '00000000-0000-0000-0000-0000000130e1', before_photo_url = 'b.jpg', after_photo_url = 'a.jpg'
  where id = '00000000-0000-0000-0000-000000013011' $q$) = '',
  'a staff phone finishes the visit with before and after photos');
-- A repeating visit's day: the copy must carry the template's repair.
select set_config('request.jwt.claims', '', true);
insert into public.household_tasks (id, household_id, title, category, due_date, recurrence, repair_id) values
  ('00000000-0000-0000-0000-000000013012', '00000000-0000-0000-0000-0000000130f1', 'Awasi tukang', 'maintenance',
   current_date, 'daily', '00000000-0000-0000-0000-0000000130d2');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.household_tasks (household_id, title, category, due_date, parent_task_id, repair_id)
  values ('00000000-0000-0000-0000-0000000130f1', 'Awasi tukang', 'maintenance', current_date,
          '00000000-0000-0000-0000-000000013012', null) $q$) like '%chore_owner_only%',
  'a staff phone''s copy of a repeat''s day can''t drop its repair');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.household_tasks (household_id, title, category, due_date, parent_task_id, repair_id)
  values ('00000000-0000-0000-0000-0000000130f1', 'Awasi tukang', 'maintenance', current_date,
          '00000000-0000-0000-0000-000000013012', '00000000-0000-0000-0000-0000000130d2') $q$) = '',
  'and copies it as the template has it');

-- ---- Photos: kept while open, and 2 years after closing (D3) -----------------------
select set_config('request.jwt.claims', '', true);
set local session_replication_role = replica;
insert into storage.objects (bucket_id, name, created_at, metadata) values
  ('household-logs', '00000000-0000-0000-0000-0000000130f1/repairs/open.webp',     now() - interval '400 days', '{"size": 1}'),
  ('household-logs', '00000000-0000-0000-0000-0000000130f1/repairs/recent.webp',   now() - interval '400 days', '{"size": 1}'),
  ('household-logs', '00000000-0000-0000-0000-0000000130f1/repairs/old.webp',      now() - interval '900 days', '{"size": 1}'),
  ('household-logs', '00000000-0000-0000-0000-0000000130f1/repairs/orphan.webp',   now() - interval '3 days',   '{"size": 1}'),
  ('household-logs', '00000000-0000-0000-0000-0000000130f1/repairs/fresh.webp',    now() - interval '1 hour',   '{"size": 1}'),
  ('household-logs', '00000000-0000-0000-0000-0000000130f1/chores/visit-open.webp',   now() - interval '400 days', '{"size": 1}'),
  ('household-logs', '00000000-0000-0000-0000-0000000130f1/chores/visit-old.webp',    now() - interval '900 days', '{"size": 1}'),
  ('household-logs', '00000000-0000-0000-0000-0000000130f1/chores/visit-orphan.webp', now() - interval '60 days',  '{"size": 1}');
insert into public.repairs (id, household_id, title, status, photo_url, created_at, closed_at) values
  ('00000000-0000-0000-0000-0000000130d5', '00000000-0000-0000-0000-0000000130f1', 'Open a year', 'open',
   'http://x/storage/v1/object/public/household-logs/00000000-0000-0000-0000-0000000130f1/repairs/open.webp', now() - interval '400 days', null),
  ('00000000-0000-0000-0000-0000000130d6', '00000000-0000-0000-0000-0000000130f1', 'Fixed a year ago', 'fixed',
   'http://x/storage/v1/object/public/household-logs/00000000-0000-0000-0000-0000000130f1/repairs/recent.webp', now() - interval '400 days', now() - interval '365 days'),
  ('00000000-0000-0000-0000-0000000130d7', '00000000-0000-0000-0000-0000000130f1', 'Fixed 2½ years ago', 'fixed',
   'http://x/storage/v1/object/public/household-logs/00000000-0000-0000-0000-0000000130f1/repairs/old.webp', now() - interval '950 days', now() - interval '900 days'),
  ('00000000-0000-0000-0000-0000000130d8', '00000000-0000-0000-0000-0000000130f1', 'Fixed long ago, photo gone', 'fixed',
   'http://x/storage/v1/object/public/household-logs/00000000-0000-0000-0000-0000000130f1/repairs/gone.webp', now() - interval '950 days', now() - interval '900 days');
insert into public.household_tasks (household_id, title, category, due_date, status, completed_at, repair_id, before_photo_url, after_photo_url) values
  ('00000000-0000-0000-0000-0000000130f1', 'Visit, open repair', 'maintenance', current_date - 400, 'completed', now() - interval '400 days',
   '00000000-0000-0000-0000-0000000130d5',
   'http://x/storage/v1/object/public/household-logs/00000000-0000-0000-0000-0000000130f1/chores/visit-open.webp',
   'http://x/storage/v1/object/public/household-logs/00000000-0000-0000-0000-0000000130f1/chores/visit-open.webp'),
  ('00000000-0000-0000-0000-0000000130f1', 'Visit, old repair', 'maintenance', current_date - 900, 'completed', now() - interval '900 days',
   '00000000-0000-0000-0000-0000000130d7',
   'http://x/storage/v1/object/public/household-logs/00000000-0000-0000-0000-0000000130f1/chores/visit-old.webp',
   'http://x/storage/v1/object/public/household-logs/00000000-0000-0000-0000-0000000130f1/chores/visit-old.webp'),
  ('00000000-0000-0000-0000-0000000130f1', 'Visit, repair deleted', 'maintenance', current_date - 60, 'completed', now() - interval '60 days',
   null,
   'http://x/storage/v1/object/public/household-logs/00000000-0000-0000-0000-0000000130f1/chores/visit-orphan.webp',
   'http://x/storage/v1/object/public/household-logs/00000000-0000-0000-0000-0000000130f1/chores/visit-orphan.webp');
set local session_replication_role = origin;

create temp table secret as
  select coalesce(
    (select decrypted_secret from vault.decrypted_secrets where name = 'task_photo_retention_secret'),
    'test-secret-130') as s;
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'task_photo_retention_secret') then
    perform vault.create_secret('test-secret-130', 'task_photo_retention_secret', 'test');
  end if;
end $$;
create temp table due as
  select name from public.task_photos_due_for_pruning((select s from secret), 1000)
  where name like '00000000-0000-0000-0000-0000000130f1/%';
select pg_temp.ok((select array_agg(name order by name) from due)
                  = array['00000000-0000-0000-0000-0000000130f1/chores/visit-old.webp',
                          '00000000-0000-0000-0000-0000000130f1/chores/visit-orphan.webp',
                          '00000000-0000-0000-0000-0000000130f1/repairs/old.webp',
                          '00000000-0000-0000-0000-0000000130f1/repairs/orphan.webp'],
  'due: photos of a repair closed over 2 years ago and its visit, a visit whose repair was deleted (30 days), and an old upload no repair points at — never an open repair''s photos, a repair closed a year ago, or a fresh upload');

select pg_temp.ok(public.prune_closed_repairs() = 1, 'the nightly job deletes one old repair');
select pg_temp.ok(not exists (select 1 from public.repairs where id = '00000000-0000-0000-0000-0000000130d8'),
  'the old repair whose photo is already gone');
select pg_temp.ok(exists (select 1 from public.repairs where id = '00000000-0000-0000-0000-0000000130d7'),
  'an old repair whose photo is still there waits for the photo clean-up');
select pg_temp.ok(exists (select 1 from public.repairs where id = '00000000-0000-0000-0000-0000000130d6'),
  'a repair closed a year ago stays');
select pg_temp.ok((select count(*) = 1 from cron.job where jobname = 'prune-closed-repairs'), 'the nightly job is scheduled');

-- Deleting a repair: its visits keep their rows, unlinked.
select pg_temp.ok(pg_temp.err_as(:owner, $q$ delete from public.repairs where id = '00000000-0000-0000-0000-0000000130d2' $q$) = '',
  'an owner deletes a repair');
select pg_temp.ok((select repair_id is null from public.household_tasks where id = '00000000-0000-0000-0000-000000013011'),
  'its visit stays, unlinked');

-- ---- The export includes repairs --------------------------------------------------
create temp table exported (data jsonb);
grant insert on exported to authenticated;
select pg_temp.ok(pg_temp.err_as(:owner, $q$ insert into exported select public.export_household_data() $q$) = '',
  'an owner exports the household');
select pg_temp.ok((select jsonb_array_length(data -> 'repairs') >= 4 from exported), 'the export lists the repairs');
select pg_temp.ok(pg_temp.err_as(:staff, $q$ select public.export_household_data() $q$) like '%admins_only%',
  'a staff phone still can''t export');

-- ---- Grants -----------------------------------------------------------------------
select pg_temp.ok(not has_table_privilege('anon', 'public.repairs', 'select'), 'logged-out callers get no repairs');
select pg_temp.ok(
  not exists (
    select 1 from unnest(array[
      'public.repairs_guard()', 'public.notify_urgent_repair()', 'public.repair_place_label(uuid,text)',
      'public.repair_keep_cutoff()', 'public.prune_closed_repairs()', 'public.household_tasks_owner_guard()',
      'public.task_photos_due_for_pruning(text,integer)'
    ]) f
    where has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute')
  ), 'no new or replaced function is callable from the API');
select pg_temp.ok(has_function_privilege('authenticated', 'public.export_household_data()', 'execute')
                  and not has_function_privilege('anon', 'public.export_household_data()', 'execute'),
  'the export stays for signed-in owners only');
select pg_temp.ok(
  (select bool_and(p.prosecdef = false) from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('repairs_guard', 'repair_place_label', 'repair_keep_cutoff', 'prune_closed_repairs')),
  'the repair functions run with the caller''s rights (only the push trigger is a definer)');
select pg_temp.ok(
  (select bool_and(proconfig = array['search_path=""']) from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('repairs_guard', 'notify_urgent_repair', 'repair_place_label', 'repair_keep_cutoff',
                      'prune_closed_repairs', 'household_tasks_owner_guard', 'task_photos_due_for_pruning',
                      'export_household_data')),
  'every new or replaced function has an empty search_path');

rollback;
