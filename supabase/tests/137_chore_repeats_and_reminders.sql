-- Migration 137 checks: every N weeks/months in chore_occurs_on (month ends,
-- leap years, a year end); the two new columns' limits; a staff phone can
-- finish a 3-monthly chore on its day and not between, and can't set or copy
-- a reminder or an interval; the 07:00 reminder sends one push per owner,
-- an owner's chore only to them, a staff chore to every owner with a phone
-- set up, nothing for a done, skipped or past day, again on the due day;
-- grants; the cron job.
-- LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/137_chore_repeats_and_reminders.sql
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
-- A repeat that is never stored: just enough of a row for chore_occurs_on.
create function pg_temp.occurs(recurrence text, every int, first date, day date) returns boolean language sql as $$
  select public.chore_occurs_on(
    jsonb_populate_record(null::public.household_tasks, jsonb_build_object(
      'recurrence', recurrence, 'recurrence_interval', every, 'due_date', first)),
    day);
$$;

-- Pushes to one owner, captured instead of sent (replaced for this transaction only).
create temp table pushes (household uuid, title text, body text, url text, tag text, user_id uuid);
create or replace function public.queue_push(
  p_household_id uuid, p_target_role text, p_title text, p_body text,
  p_url text default '/', p_tag text default null, p_user_id uuid default null, p_exclude_user_id uuid default null
) returns boolean language plpgsql as $$
begin
  insert into pg_temp.pushes values (p_household_id, p_title, p_body, p_url, p_tag, p_user_id);
  return true;
end $$;

-- ---- Which days: every N weeks and months ---------------------------------------
select pg_temp.ok(pg_temp.occurs('monthly', 3, '2027-01-31', '2027-04-30'), 'every 3 months from 31 Jan: 30 Apr (clamped)');
select pg_temp.ok(pg_temp.occurs('monthly', 3, '2027-01-31', '2027-07-31'), '... 31 Jul');
select pg_temp.ok(pg_temp.occurs('monthly', 3, '2027-01-31', '2027-10-31'), '... 31 Oct');
select pg_temp.ok(not pg_temp.occurs('monthly', 3, '2027-01-31', '2027-02-28'), '... not 28 Feb');
select pg_temp.ok(not pg_temp.occurs('monthly', 3, '2027-01-31', '2027-03-31'), '... not 31 Mar');
select pg_temp.ok(pg_temp.occurs('monthly', 1, '2027-01-31', '2027-02-28'), 'monthly (interval 1) still clamps to 28 Feb');
select pg_temp.ok(pg_temp.occurs('monthly', 12, '2028-02-29', '2029-02-28'), 'every year from 29 Feb 2028: 28 Feb 2029');
select pg_temp.ok(pg_temp.occurs('monthly', 12, '2028-02-29', '2032-02-29'), '... 29 Feb 2032');
select pg_temp.ok(not pg_temp.occurs('monthly', 12, '2028-02-29', '2028-03-29'), '... not 29 Mar 2028');
select pg_temp.ok(pg_temp.occurs('monthly', 6, '2026-11-20', '2027-05-20'), 'every 6 months from 20 Nov: 20 May');
select pg_temp.ok(not pg_temp.occurs('monthly', 6, '2026-11-20', '2027-02-20'), '... not 20 Feb');
select pg_temp.ok(pg_temp.occurs('weekly', 2, '2026-12-30', '2027-01-13'), 'every 2 weeks from Wed 30 Dec: 13 Jan');
select pg_temp.ok(not pg_temp.occurs('weekly', 2, '2026-12-30', '2027-01-06'), '... not 6 Jan');
select pg_temp.ok(pg_temp.occurs('weekly', 1, '2026-12-30', '2027-01-06'), 'weekly (interval 1): 6 Jan');
select pg_temp.ok(pg_temp.occurs('daily', 3, '2026-12-30', '2026-12-31'), 'daily ignores the interval');
select pg_temp.ok(not pg_temp.occurs('monthly', 3, '2027-01-31', '2026-10-31'), 'never before the first day');

-- ---- Households ---------------------------------------------------------------------
-- f1: admins a1 (English, phone set up), a2 (Indonesian, phone set up),
-- a3 (no phone set up); staff phone b1; Ari (s1) on the roster.
-- f2: admin a4 (phone set up).
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, anon, now(), now()
from (values
  ('00000000-0000-0000-0000-0000000137a1', 'one137@test.local', false),
  ('00000000-0000-0000-0000-0000000137a2', 'two137@test.local', false),
  ('00000000-0000-0000-0000-0000000137a3', 'three137@test.local', false),
  ('00000000-0000-0000-0000-0000000137a4', 'four137@test.local', false),
  ('00000000-0000-0000-0000-0000000137b1', null, true)
) as u(id, email, anon);
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000137f1', 'Rumah Melati', '00000000-0000-0000-0000-0000000137a1'),
  ('00000000-0000-0000-0000-0000000137f2', 'Rumah Kenanga', '00000000-0000-0000-0000-0000000137a4');
-- The membership trigger (migrations/106) gives each admin a roster row.
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000137f1', '00000000-0000-0000-0000-0000000137a1', 'owner'),
  ('00000000-0000-0000-0000-0000000137f1', '00000000-0000-0000-0000-0000000137a2', 'admin'),
  ('00000000-0000-0000-0000-0000000137f1', '00000000-0000-0000-0000-0000000137a3', 'admin'),
  ('00000000-0000-0000-0000-0000000137f2', '00000000-0000-0000-0000-0000000137a4', 'owner');
insert into public.user_preferences (user_id, locale) values ('00000000-0000-0000-0000-0000000137a2', 'id');
insert into public.device_sessions (user_id, household_id) values
  ('00000000-0000-0000-0000-0000000137b1', '00000000-0000-0000-0000-0000000137f1');
insert into public.staff_profiles (id, household_id, name) values
  ('00000000-0000-0000-0000-0000000137c1', '00000000-0000-0000-0000-0000000137f1', 'Ari');
insert into public.push_subscriptions (user_id, household_id, subscription)
select u::uuid, h::uuid, jsonb_build_object('endpoint', 'https://fcm.googleapis.com/fcm/send/' || u,
                                            'keys', jsonb_build_object('p256dh', 'k', 'auth', 'a'))
from (values
  ('00000000-0000-0000-0000-0000000137a1', '00000000-0000-0000-0000-0000000137f1'),
  ('00000000-0000-0000-0000-0000000137a2', '00000000-0000-0000-0000-0000000137f1'),
  ('00000000-0000-0000-0000-0000000137a4', '00000000-0000-0000-0000-0000000137f2')
) as s(u, h);

select pg_temp.ok((select count(*) = 3 from public.staff_profiles
                    where household_id = '00000000-0000-0000-0000-0000000137f1' and user_id is not null),
  'setup: each f1 admin has a roster row');

\set a1 '''00000000-0000-0000-0000-0000000137a1'''
\set staff '''00000000-0000-0000-0000-0000000137b1'''

-- ---- Limits on the columns ---------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:a1, $q$insert into public.household_tasks (household_id, title, recurrence, recurrence_interval)
      values ('00000000-0000-0000-0000-0000000137f1', 'Too far apart', 'monthly', 13)$q$)
  like '%household_tasks_recurrence_interval_check%', 'an interval of 13 is refused');
select pg_temp.ok(pg_temp.err_as(:a1, $q$insert into public.household_tasks (household_id, title, remind_days_before)
      values ('00000000-0000-0000-0000-0000000137f1', 'Odd reminder', 2)$q$)
  like '%household_tasks_remind_days_before_check%', 'a reminder 2 days before is refused');
select pg_temp.ok(pg_temp.err_as(:a1, $q$insert into public.household_tasks
        (id, household_id, title, category, recurrence, recurrence_interval, due_date, remind_days_before, assigned_to)
      values ('00000000-0000-0000-0000-0000000137e9', '00000000-0000-0000-0000-0000000137f1', 'Kuras toren', 'maintenance',
              'monthly', 3, '2026-09-20', null, '00000000-0000-0000-0000-0000000137c1')$q$) = '',
  'an owner adds a 3-monthly chore for Ari');

-- ---- A staff phone and the 3-monthly chore -------------------------------------------
select pg_temp.ok(pg_temp.err_as(:staff, $q$insert into public.household_tasks
        (household_id, parent_task_id, title, category, due_date, assigned_to, status, recurrence)
      values ('00000000-0000-0000-0000-0000000137f1', '00000000-0000-0000-0000-0000000137e9', 'Kuras toren',
              'maintenance', '2026-12-20', '00000000-0000-0000-0000-0000000137c1', 'pending', 'none')$q$) = '',
  'staff phone writes the 3-monthly chore''s day (20 Dec)');
select pg_temp.ok(pg_temp.err_as(:staff, $q$insert into public.household_tasks
        (household_id, parent_task_id, title, category, due_date, assigned_to, status, recurrence)
      values ('00000000-0000-0000-0000-0000000137f1', '00000000-0000-0000-0000-0000000137e9', 'Kuras toren',
              'maintenance', '2026-11-20', '00000000-0000-0000-0000-0000000137c1', 'pending', 'none')$q$)
  = 'chore_owner_only', 'staff phone can''t write an in-between month (20 Nov)');
select pg_temp.ok(pg_temp.err_as(:staff, $q$insert into public.household_tasks
        (household_id, parent_task_id, title, category, due_date, assigned_to, status, recurrence, remind_days_before)
      values ('00000000-0000-0000-0000-0000000137f1', '00000000-0000-0000-0000-0000000137e9', 'Kuras toren',
              'maintenance', '2027-03-20', '00000000-0000-0000-0000-0000000137c1', 'pending', 'none', 1)$q$)
  = 'chore_owner_only', 'staff phone''s day copy can''t carry a reminder');
select pg_temp.ok(pg_temp.err_as(:staff, $q$insert into public.household_tasks
        (household_id, parent_task_id, title, category, due_date, assigned_to, status, recurrence, recurrence_interval)
      values ('00000000-0000-0000-0000-0000000137f1', '00000000-0000-0000-0000-0000000137e9', 'Kuras toren',
              'maintenance', '2027-03-20', '00000000-0000-0000-0000-0000000137c1', 'pending', 'none', 3)$q$)
  = 'chore_owner_only', 'staff phone''s day copy can''t carry an interval');
select pg_temp.ok(pg_temp.err_as(:staff, $q$update public.household_tasks set remind_days_before = 1
      where id = '00000000-0000-0000-0000-0000000137e9'$q$) = 'chore_owner_only',
  'staff phone can''t set a reminder on a chore');
select pg_temp.ok(pg_temp.err_as(:staff, $q$update public.household_tasks set recurrence_interval = 1
      where id = '00000000-0000-0000-0000-0000000137e9'$q$) = 'chore_owner_only',
  'staff phone can''t change the interval');
select pg_temp.ok(pg_temp.err_as(:a1, $q$update public.household_tasks set remind_days_before = 1
      where id = '00000000-0000-0000-0000-0000000137e9'$q$) = '',
  'an owner sets a reminder');
select pg_temp.ok(pg_temp.err_as(:a1, $q$update public.household_tasks set remind_days_before = null
      where id = '00000000-0000-0000-0000-0000000137e9'$q$) = '',
  '... and turns it off again');

-- ---- The reminder ------------------------------------------------------------------
-- "Today" in these checks is Sunday 20 Dec 2026.
-- Setup below runs as no one (err_as leaves its claims set for the transaction).
select set_config('request.jwt.claims', '', true);
create temp table roster as
select (select id from public.staff_profiles where user_id = '00000000-0000-0000-0000-0000000137a1') as a1,
       (select id from public.staff_profiles where user_id = '00000000-0000-0000-0000-0000000137a2') as a2,
       (select id from public.staff_profiles where user_id = '00000000-0000-0000-0000-0000000137a4') as a4,
       '00000000-0000-0000-0000-0000000137c1'::uuid as ari;

insert into public.household_tasks
  (id, household_id, title, category, recurrence, recurrence_interval, due_date, remind_days_before, assigned_to, status,
   before_photo_url, after_photo_url)
select x.id::uuid, x.h::uuid, x.title, x.category, x.rec, x.every, x.first::date, x.remind, x.who, x.status,
       case when x.status = 'completed' then 'x/b.jpg' end, case when x.status = 'completed' then 'x/a.jpg' end
from roster r, lateral (values
  -- a1's bill, due today (monthly on the 20th).
  ('00000000-0000-0000-0000-000000013701', '00000000-0000-0000-0000-0000000137f1', 'Electricity (PLN)', 'bill', 'monthly', 1, '2026-11-20', 3, r.a1, 'pending'),
  -- a1's bill, due in 3 days.
  ('00000000-0000-0000-0000-000000013702', '00000000-0000-0000-0000-0000000137f1', 'Water (PDAM)', 'bill', 'monthly', 1, '2026-11-23', 3, r.a1, 'pending'),
  -- Ari's 3-monthly upkeep, due tomorrow: every owner with a phone set up.
  ('00000000-0000-0000-0000-000000013703', '00000000-0000-0000-0000-0000000137f1', 'AC service', 'maintenance', 'monthly', 3, '2026-09-21', 1, r.ari, 'pending'),
  -- a1's bill due today, already done (written row below).
  ('00000000-0000-0000-0000-000000013704', '00000000-0000-0000-0000-0000000137f1', 'Internet', 'bill', 'monthly', 1, '2026-11-20', 0, r.a1, 'pending'),
  -- Due today, called off.
  ('00000000-0000-0000-0000-000000013705', '00000000-0000-0000-0000-0000000137f1', 'BPJS Kesehatan', 'bill', 'none', 1, '2026-12-20', 0, null, 'cancelled'),
  -- Daily, no reminder.
  ('00000000-0000-0000-0000-000000013706', '00000000-0000-0000-0000-0000000137f1', 'Mop the terrace', 'cleaning', 'daily', 1, '2026-11-01', null, r.ari, 'pending'),
  -- Yesterday's, still open: no push the day after.
  ('00000000-0000-0000-0000-000000013707', '00000000-0000-0000-0000-0000000137f1', 'Iuran RT/RW', 'bill', 'none', 1, '2026-12-19', 0, r.a1, 'pending'),
  -- a2's own, today: a2 only.
  ('00000000-0000-0000-0000-000000013708', '00000000-0000-0000-0000-0000000137f1', 'Pest control', 'maintenance', 'none', 1, '2026-12-20', 0, r.a2, 'pending'),
  -- A one-off due today, done.
  ('00000000-0000-0000-0000-000000013709', '00000000-0000-0000-0000-0000000137f1', 'PBB', 'bill', 'none', 1, '2026-12-20', 0, r.a1, 'completed'),
  -- A yearly one, a week away.
  ('00000000-0000-0000-0000-000000013710', '00000000-0000-0000-0000-0000000137f1', 'Vehicle tax (STNK)', 'bill', 'monthly', 12, '2025-12-27', 7, r.a1, 'pending'),
  -- The other household's.
  ('00000000-0000-0000-0000-000000013711', '00000000-0000-0000-0000-0000000137f2', 'Electricity (PLN)', 'bill', 'monthly', 1, '2026-10-20', 0, null, 'pending')
) as x(id, h, title, category, rec, every, first, remind, who, status);

-- Internet's 20 Dec, written and done.
insert into public.household_tasks
  (household_id, parent_task_id, title, category, due_date, assigned_to, status, completed_by, completed_at,
   before_photo_url, after_photo_url)
select '00000000-0000-0000-0000-0000000137f1', '00000000-0000-0000-0000-000000013704', 'Internet', 'bill',
       '2026-12-20', r.a1, 'completed', r.a1, now(), 'x/b.jpg', 'x/a.jpg'
from roster r;

select pg_temp.ok(public.notify_chores_due('2026-12-20') = 3, 'three owners told on 20 Dec (a1, a2, f2''s owner)');
select pg_temp.ok((select body = 'Due today: Electricity (PLN). Tomorrow: AC service. In 3 days: Water (PDAM). In 1 week: Vehicle tax (STNK).'
                     from pg_temp.pushes where user_id = '00000000-0000-0000-0000-0000000137a1'),
  'a1, in English: today, tomorrow, in 3 days, in a week (nothing done, skipped or past)');
select pg_temp.ok((select title = 'Reminder' and url = '/dashboard?module=agenda' and tag = 'chores-due-2026-12-20'
                     from pg_temp.pushes where user_id = '00000000-0000-0000-0000-0000000137a1'),
  '... titled Reminder, opening Today, tagged with the date');
select pg_temp.ok((select title = 'Pengingat' and body = 'Hari ini: Pest control. Besok: AC service.'
                     from pg_temp.pushes where user_id = '00000000-0000-0000-0000-0000000137a2'),
  'a2, in Indonesian: their own chore and Ari''s, not a1''s');
select pg_temp.ok(not exists (select 1 from pg_temp.pushes where user_id = '00000000-0000-0000-0000-0000000137a3'),
  'a3 has no phone set up: nothing queued');
select pg_temp.ok((select household = '00000000-0000-0000-0000-0000000137f2' and body = 'Due today: Electricity (PLN).'
                     from pg_temp.pushes where user_id = '00000000-0000-0000-0000-0000000137a4'),
  'the other household''s owner gets only their own household''s');
select pg_temp.ok((select count(*) = 1 from pg_temp.pushes where user_id = '00000000-0000-0000-0000-0000000137a1'),
  'one push per owner per morning');

-- 21 Dec: the AC service is due, still not done: told again on the day.
delete from pg_temp.pushes;
select pg_temp.ok(public.notify_chores_due('2026-12-21') >= 2, 'run on 21 Dec');
select pg_temp.ok((select body = 'Due today: AC service.' from pg_temp.pushes where user_id = '00000000-0000-0000-0000-0000000137a1'),
  'the AC service again on its day, for a1');
select pg_temp.ok((select body = 'Hari ini: AC service.' from pg_temp.pushes where user_id = '00000000-0000-0000-0000-0000000137a2'),
  '... and for a2');

-- 22 Dec: the AC service's day has passed: no more pushes for it.
delete from pg_temp.pushes;
select pg_temp.ok(public.notify_chores_due('2026-12-22') >= 0, 'run on 22 Dec');
select pg_temp.ok(not exists (select 1 from pg_temp.pushes where body like '%AC service%'),
  'nothing for the AC service the day after');

-- Its day written by a staff phone and finished: no push on the day.
delete from pg_temp.pushes;
insert into public.household_tasks
  (household_id, parent_task_id, title, category, due_date, assigned_to, status, completed_by, completed_at,
   before_photo_url, after_photo_url)
values ('00000000-0000-0000-0000-0000000137f1', '00000000-0000-0000-0000-000000013703', 'AC service', 'maintenance',
        '2026-12-21', '00000000-0000-0000-0000-0000000137c1', 'completed', '00000000-0000-0000-0000-0000000137c1', now(),
        'x/b.jpg', 'x/a.jpg');
select pg_temp.ok(public.notify_chores_due('2026-12-21') >= 0, 'run on 21 Dec again');
select pg_temp.ok(not exists (select 1 from pg_temp.pushes where body like '%AC service%'),
  'a finished day is not reminded');

-- A preserved short-month day off the pattern (first day skipped on the
-- 31st: 28 Feb kept as its own row, the start moved to 31 Mar) still reminds.
delete from pg_temp.pushes;
insert into public.household_tasks
  (id, household_id, title, category, recurrence, recurrence_interval, due_date, remind_days_before, assigned_to)
select '00000000-0000-0000-0000-000000013720', '00000000-0000-0000-0000-0000000137f1', 'Rent', 'bill',
       'monthly', 1, '2027-03-31', 1, r.a1
from roster r;
insert into public.household_tasks (household_id, parent_task_id, title, category, due_date, assigned_to, status)
select '00000000-0000-0000-0000-0000000137f1', '00000000-0000-0000-0000-000000013720', 'Rent', 'bill',
       '2027-02-28', r.a1, 'pending'
from roster r;
select pg_temp.ok(public.notify_chores_due('2027-02-27') >= 1, 'run on 27 Feb 2027');
select pg_temp.ok((select body like '%Tomorrow: Rent.%' from pg_temp.pushes where user_id = '00000000-0000-0000-0000-0000000137a1'),
  'the kept 28 Feb is reminded the day before, though it is off the pattern');
delete from pg_temp.pushes;
select pg_temp.ok(public.notify_chores_due('2027-02-28') >= 1, 'run on 28 Feb 2027');
select pg_temp.ok((select body like '%Due today: Rent.%' from pg_temp.pushes where user_id = '00000000-0000-0000-0000-0000000137a1'),
  '... and on the day');

-- A daily chore reminded the day before: one line a morning, not
-- "Due today: X. Tomorrow: X." (code review, PR #60).
delete from pg_temp.pushes;
insert into public.household_tasks
  (household_id, title, category, recurrence, recurrence_interval, due_date, remind_days_before, assigned_to)
select '00000000-0000-0000-0000-0000000137f2', 'Water the plants', 'cleaning', 'daily', 1, '2027-03-01', 1, r.a4
from roster r;
select pg_temp.ok(public.notify_chores_due('2027-03-10') >= 1, 'run on 10 Mar 2027');
select pg_temp.ok((select body = 'Due today: Water the plants.'
                     from pg_temp.pushes where user_id = '00000000-0000-0000-0000-0000000137a4'),
  'a daily chore is reminded once a morning, not also as tomorrow''s');

-- ---- The list of titles --------------------------------------------------------------
select pg_temp.ok(public.chore_due_titles(array['A'], 'en') = 'A', 'one title');
select pg_temp.ok(public.chore_due_titles(array['A', 'B', 'C'], 'en') = 'A, B and C', 'three titles, English');
select pg_temp.ok(public.chore_due_titles(array['A', 'B', 'C'], 'id') = 'A, B, dan C', 'three titles, Indonesian');
select pg_temp.ok(public.chore_due_titles(array['A', 'B', 'C', 'D', 'E'], 'en') = 'A, B, C and 2 more', 'five titles, English');

-- ---- Grants and the job ----------------------------------------------------------------
select pg_temp.ok(not has_function_privilege('anon', 'public.notify_chores_due(date)', 'execute')
              and not has_function_privilege('authenticated', 'public.notify_chores_due(date)', 'execute'),
  'nobody the API acts as can send reminders');
select pg_temp.ok(not has_function_privilege('anon', 'public.chore_due_titles(text[], text)', 'execute')
              and not has_function_privilege('authenticated', 'public.chore_due_titles(text[], text)', 'execute'),
  'chore_due_titles: not callable from the API');
select pg_temp.ok(not has_function_privilege('anon', 'public.chore_occurs_on(public.household_tasks, date)', 'execute')
              and not has_function_privilege('authenticated', 'public.chore_occurs_on(public.household_tasks, date)', 'execute'),
  'chore_occurs_on: still not callable from the API');
select pg_temp.ok(not has_function_privilege('anon', 'public.household_tasks_owner_guard()', 'execute')
              and not has_function_privilege('authenticated', 'public.household_tasks_owner_guard()', 'execute'),
  'the guard: still not callable from the API');
select pg_temp.ok((select schedule = '5 0 * * *' from cron.job where jobname = 'notify-chores-due'),
  'the reminder runs at 07:05 Jakarta');

rollback;
