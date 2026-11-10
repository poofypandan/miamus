-- Migration 139 checks: staff say a task couldn't be done (what they may and
-- may not file, Batalkan within 5 minutes, no edits); a refused medicine
-- pushes every admin; leave and suggestions push the admins with "Staff
-- requests" on, once per suggestion; each admin's switches; the evening
-- summary (nothing open, no push; couldn't-do listed once; leave applied;
-- an admin's own chore only to them; the hour each admin picked); the 90-day
-- prune; the photo clean-up and the export know the new rows; grants.
-- LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/139_couldnt_do_and_evening_summary.sql
\set ON_ERROR_STOP on
\pset footer off
begin;

create function pg_temp.ok(cond boolean, label text) returns text language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  return 'ok  ' || label;
end $$;
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
    perform set_config('request.jwt.claims', '', true);
    return sqlerrm;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return '';
end $$;
create function pg_temp.count_as(uid uuid, stmt text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute stmt into n;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return n;
end $$;

-- Pushes captured instead of sent (replaced for this transaction only).
create temp table pushes (household uuid, title text, body text, url text, tag text, user_id uuid);
grant insert on pushes to authenticated;
create or replace function public.queue_push(
  p_household_id uuid, p_target_role text, p_title text, p_body text,
  p_url text default '/', p_tag text default null, p_user_id uuid default null, p_exclude_user_id uuid default null
) returns boolean language plpgsql as $$
begin
  insert into pg_temp.pushes values (p_household_id, p_title, p_body, p_url, p_tag, p_user_id);
  return true;
end $$;

-- Today in Jakarta, as the guard reads it.
create temp table d as select (now() at time zone 'Asia/Jakarta')::date as today;
create function pg_temp.today() returns date language sql as $$ select today from pg_temp.d $$;
-- That Jakarta day at a given hour, as a timestamptz for the evening job.
create function pg_temp.at_hour(h int) returns timestamptz language sql as $$
  select (pg_temp.today() + make_time(h, 0, 0)) at time zone 'Asia/Jakarta' $$;

-- ---- Households ---------------------------------------------------------------------
-- f1: admins a1 (English, phone), a2 (Indonesian, phone), a3 (no phone);
-- staff phone b1; Sari (s1) and Budi (s2, archived) on the roster.
-- f2: admin a4 (phone); its own chore.
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, anon, now(), now()
from (values
  ('00000000-0000-0000-0000-0000000139a1', 'one139@test.local', false),
  ('00000000-0000-0000-0000-0000000139a2', 'two139@test.local', false),
  ('00000000-0000-0000-0000-0000000139a3', 'three139@test.local', false),
  ('00000000-0000-0000-0000-0000000139a4', 'four139@test.local', false),
  ('00000000-0000-0000-0000-0000000139b1', null, true)
) as u(id, email, anon);
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000139f1', 'Rumah Melati', '00000000-0000-0000-0000-0000000139a1'),
  ('00000000-0000-0000-0000-0000000139f2', 'Rumah Kenanga', '00000000-0000-0000-0000-0000000139a4');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000139f1', '00000000-0000-0000-0000-0000000139a1', 'owner'),
  ('00000000-0000-0000-0000-0000000139f1', '00000000-0000-0000-0000-0000000139a2', 'admin'),
  ('00000000-0000-0000-0000-0000000139f1', '00000000-0000-0000-0000-0000000139a3', 'admin'),
  ('00000000-0000-0000-0000-0000000139f2', '00000000-0000-0000-0000-0000000139a4', 'owner');
insert into public.user_preferences (user_id, locale) values ('00000000-0000-0000-0000-0000000139a2', 'id')
on conflict (user_id) do update set locale = 'id';
insert into public.device_sessions (user_id, household_id) values
  ('00000000-0000-0000-0000-0000000139b1', '00000000-0000-0000-0000-0000000139f1');
insert into public.staff_profiles (id, household_id, name, archived_at) values
  ('00000000-0000-0000-0000-0000000139c1', '00000000-0000-0000-0000-0000000139f1', 'Sari', null),
  ('00000000-0000-0000-0000-0000000139c2', '00000000-0000-0000-0000-0000000139f1', 'Budi', now());
insert into public.push_subscriptions (user_id, household_id, subscription)
select u::uuid, h::uuid, jsonb_build_object('endpoint', 'https://fcm.googleapis.com/fcm/send/' || u,
                                            'keys', jsonb_build_object('p256dh', 'k', 'auth', 'a'))
from (values
  ('00000000-0000-0000-0000-0000000139a1', '00000000-0000-0000-0000-0000000139f1'),
  ('00000000-0000-0000-0000-0000000139a2', '00000000-0000-0000-0000-0000000139f1'),
  ('00000000-0000-0000-0000-0000000139a4', '00000000-0000-0000-0000-0000000139f2')
) as s(u, h);

-- Chores in f1: k1 laundry, daily from a week ago, for Sari at 09:00; k2 mop,
-- a one-off today at 08:00; k3 cancelled; k4 a one-off already done today;
-- k5 water the plants, daily, for admin a1 (their roster row), no time;
-- k6 sweep, a one-off at 23:00 (not due by the evening run).
-- f2: k9 its own one-off.
insert into public.household_tasks (id, household_id, title, category, recurrence, due_date, due_time, status, assigned_to,
                                    before_photo_url, after_photo_url)
select id::uuid, h::uuid, title, 'cleaning', rec, pg_temp.today() + off, tm, st, who::uuid,
       case when st = 'completed' then 'x/b.jpg' end, case when st = 'completed' then 'x/a.jpg' end
from (values
  ('00000000-0000-0000-0000-0000000139d1', '00000000-0000-0000-0000-0000000139f1', 'Laundry', 'daily', -7, '09:00', 'pending', '00000000-0000-0000-0000-0000000139c1'),
  ('00000000-0000-0000-0000-0000000139d2', '00000000-0000-0000-0000-0000000139f1', 'Mop the terrace', 'none', 0, '08:00', 'pending', null),
  ('00000000-0000-0000-0000-0000000139d3', '00000000-0000-0000-0000-0000000139f1', 'Cancelled thing', 'none', 0, null, 'cancelled', null),
  ('00000000-0000-0000-0000-0000000139d4', '00000000-0000-0000-0000-0000000139f1', 'Done thing', 'none', 0, null, 'completed', null),
  ('00000000-0000-0000-0000-0000000139d5', '00000000-0000-0000-0000-0000000139f1', 'Water the plants', 'daily', -3, null, 'pending', null),
  ('00000000-0000-0000-0000-0000000139d6', '00000000-0000-0000-0000-0000000139f1', 'Sweep', 'none', 0, '23:00', 'pending', null),
  ('00000000-0000-0000-0000-0000000139d9', '00000000-0000-0000-0000-0000000139f2', 'Internet', 'none', 0, null, 'pending', null)
) as t(id, h, title, rec, off, tm, st, who);
update public.household_tasks k set assigned_to = s.id
  from public.staff_profiles s
 where k.id = '00000000-0000-0000-0000-0000000139d5'
   and s.user_id = '00000000-0000-0000-0000-0000000139a1' and s.household_id = k.household_id;

-- Pets and routines in f1: Mochi (p1) dinner 18:00 and medicine 08:00 (both
-- since last week); Kopi (p2) at the clinic, dinner 18:00.
insert into public.task_entities (id, household_id, entity_type, name, status) values
  ('00000000-0000-0000-0000-0000000139e1', '00000000-0000-0000-0000-0000000139f1', 'pet', 'Mochi', 'home'),
  ('00000000-0000-0000-0000-0000000139e2', '00000000-0000-0000-0000-0000000139f1', 'pet', 'Kopi', 'admitted');
insert into public.master_schedules (id, entity_id, title, module, frequency_type, fixed_times, is_active, created_at) values
  ('00000000-0000-0000-0000-000000013901', '00000000-0000-0000-0000-0000000139e1', 'Dinner', 'pet', 'fixed_time', array['18:00'::time], true, now() - interval '7 days'),
  ('00000000-0000-0000-0000-000000013902', '00000000-0000-0000-0000-0000000139e1', 'Medication: Amoxicillin', 'pet', 'fixed_time', array['08:00'::time], true, now() - interval '7 days'),
  ('00000000-0000-0000-0000-000000013903', '00000000-0000-0000-0000-0000000139e2', 'Dinner', 'pet', 'fixed_time', array['18:00'::time], true, now() - interval '7 days');
insert into public.inventory_items (id, household_id, name, category) values
  ('00000000-0000-0000-0000-0000000139cc', '00000000-0000-0000-0000-0000000139f1', 'Deterjen', 'household_supplies');

\set a1 '''00000000-0000-0000-0000-0000000139a1'''
\set a2 '''00000000-0000-0000-0000-0000000139a2'''
\set a4 '''00000000-0000-0000-0000-0000000139a4'''
\set staff '''00000000-0000-0000-0000-0000000139b1'''

-- ---- What a staff phone may file ----------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.task_exceptions (id, household_id, chore_id, occurs_on, reason, note, inventory_item_id, staff_id, created_at)
  values ('00000000-0000-0000-0000-00000139ee01', '00000000-0000-0000-0000-0000000139f1', '00000000-0000-0000-0000-0000000139d1',
          %L, 'out_of_stock', '  Tinggal sedikit  ', '00000000-0000-0000-0000-0000000139cc',
          '00000000-0000-0000-0000-0000000139c1', '2020-01-01') $q$, pg_temp.today())) = '',
  'a staff phone says today''s laundry (a repeat, not written) couldn''t be done');
select pg_temp.ok((select note = 'Tinggal sedikit' and created_at > now() - interval '1 minute'
                     from public.task_exceptions where id = '00000000-0000-0000-0000-00000139ee01'),
  '... the note is trimmed and the server stamps the time');
select pg_temp.ok(pg_temp.count_as(:staff, 'select count(*) from public.task_exceptions') = 1,
  '... and the staff phone can read it back');
select pg_temp.ok(pg_temp.count_as(:a4, 'select count(*) from public.task_exceptions') = 0,
  'another household sees nothing');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.task_exceptions (household_id, chore_id, occurs_on, reason, staff_id)
  values ('00000000-0000-0000-0000-0000000139f1', '00000000-0000-0000-0000-0000000139d1', %L, 'other', null) $q$, pg_temp.today()))
  like '%task_exceptions_other_has_note%', '"Lainnya" needs a few words');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.task_exceptions (household_id, chore_id, occurs_on, reason)
  values ('00000000-0000-0000-0000-0000000139f1', '00000000-0000-0000-0000-0000000139d1', %L, 'done_by_other') $q$, pg_temp.today()))
  like '%task_exceptions_chore_day_key%', 'one per task-day');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.task_exceptions (household_id, chore_id, occurs_on, reason)
  values ('00000000-0000-0000-0000-0000000139f1', '00000000-0000-0000-0000-0000000139d1', %L, 'done_by_other') $q$, pg_temp.today() + 1))
  like '%task_exception_day%', 'never a day ahead');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.task_exceptions (household_id, chore_id, occurs_on, reason)
  values ('00000000-0000-0000-0000-0000000139f1', '00000000-0000-0000-0000-0000000139d1', %L, 'done_by_other') $q$, pg_temp.today() - 8))
  like '%task_exception_day%', 'not more than 7 days back');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.task_exceptions (household_id, chore_id, occurs_on, reason)
  values ('00000000-0000-0000-0000-0000000139f1', '00000000-0000-0000-0000-0000000139d1', %L, 'done_by_other') $q$, pg_temp.today() - 3)) = '',
  'a day from earlier this week is fine');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.task_exceptions (household_id, chore_id, occurs_on, reason)
  values ('00000000-0000-0000-0000-0000000139f1', '00000000-0000-0000-0000-0000000139d2', %L, 'done_by_other') $q$, pg_temp.today() - 1))
  like '%task_exception_day%', 'a one-off only on its own day');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.task_exceptions (household_id, chore_id, occurs_on, reason)
  values ('00000000-0000-0000-0000-0000000139f1', '00000000-0000-0000-0000-0000000139d3', %L, 'done_by_other') $q$, pg_temp.today()))
  like '%task_exception_task%', 'not a cancelled chore');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.task_exceptions (household_id, chore_id, occurs_on, reason)
  values ('00000000-0000-0000-0000-0000000139f1', '00000000-0000-0000-0000-0000000139d4', %L, 'done_by_other') $q$, pg_temp.today()))
  like '%task_exception_not_open%', 'not a chore already done');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.task_exceptions (household_id, chore_id, occurs_on, reason)
  values ('00000000-0000-0000-0000-0000000139f1', '00000000-0000-0000-0000-0000000139d9', %L, 'done_by_other') $q$, pg_temp.today()))
  like '%task_exception_task%', 'not another household''s chore, even naming its own household');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.task_exceptions (household_id, chore_id, occurs_on, reason)
  values ('00000000-0000-0000-0000-0000000139f2', '00000000-0000-0000-0000-0000000139d9', %L, 'done_by_other') $q$, pg_temp.today()))
  like '%row-level security%', 'nor filed into another household');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.task_exceptions (household_id, chore_id, occurs_on, reason, staff_id)
  values ('00000000-0000-0000-0000-0000000139f1', '00000000-0000-0000-0000-0000000139d2', %L, 'done_by_other',
          '00000000-0000-0000-0000-0000000139c2') $q$, pg_temp.today()))
  like '%task_exception_person%', 'not as an archived person');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.task_exceptions (household_id, chore_id, occurs_on, reason)
  values ('00000000-0000-0000-0000-0000000139f1', '00000000-0000-0000-0000-0000000139d2', %L, 'pet_refused') $q$, pg_temp.today()))
  like '%task_exceptions_refused_is_routine%', '"pet refused" only on a routine');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.task_exceptions (household_id, chore_id, occurs_on, reason, photo_url)
  values ('00000000-0000-0000-0000-0000000139f1', '00000000-0000-0000-0000-0000000139d2', %L, 'done_by_other',
          'http://x/storage/v1/object/public/household-logs/00000000-0000-0000-0000-0000000139f2/couldnt/p.webp') $q$, pg_temp.today()))
  like '%task_exception_photo%', 'a photo only from the household''s own folder');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.task_exceptions (household_id, schedule_id, entity_id, occurs_on, reason)
  values ('00000000-0000-0000-0000-0000000139f1', '00000000-0000-0000-0000-000000013901',
          '00000000-0000-0000-0000-0000000139e1', %L, 'pet_refused') $q$, pg_temp.today()))
  like '%task_exceptions_routine_shape%', 'a routine names its slot');

-- ---- Batalkan, and no edits ---------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  update public.task_exceptions set reason = 'other', note = 'changed' $q$) like '%permission denied%',
  'nobody edits one');
select pg_temp.ok(pg_temp.count_as(:staff, $q$
  with gone as (delete from public.task_exceptions where id = '00000000-0000-0000-0000-00000139ee01' returning 1)
  select count(*) from gone $q$) = 1,
  'Batalkan within 5 minutes removes it');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.task_exceptions (id, household_id, chore_id, occurs_on, reason, staff_id)
  values ('00000000-0000-0000-0000-00000139ee01', '00000000-0000-0000-0000-0000000139f1', '00000000-0000-0000-0000-0000000139d1',
          %L, 'out_of_stock', '00000000-0000-0000-0000-0000000139c1') $q$, pg_temp.today())) = '',
  '... and it can be filed again');
update public.task_exceptions set created_at = now() - interval '6 minutes' where occurs_on = pg_temp.today() - 3;
select pg_temp.ok(pg_temp.count_as(:staff, $q$
  with gone as (delete from public.task_exceptions where chore_id = '00000000-0000-0000-0000-0000000139d1'
                and occurs_on < current_date - 1 returning 1)
  select count(*) from gone $q$) = 0,
  'after 5 minutes it stays');

-- ---- A refused medicine pushes every admin now ---------------------------------------
truncate pushes;
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.task_exceptions (id, household_id, schedule_id, entity_id, occurs_on, slot_time, reason, staff_id)
  values ('00000000-0000-0000-0000-00000139ee02', '00000000-0000-0000-0000-0000000139f1', '00000000-0000-0000-0000-000000013902',
          '00000000-0000-0000-0000-0000000139e2', %L, '08:00', 'pet_refused', '00000000-0000-0000-0000-0000000139c1') $q$,
  pg_temp.today())) = '',
  'Mochi wouldn''t take the 08:00 medicine');
select pg_temp.ok((select entity_id = '00000000-0000-0000-0000-0000000139e1' from public.task_exceptions
                    where id = '00000000-0000-0000-0000-00000139ee02'),
  '... the pet is the routine''s, whatever was sent');
select pg_temp.ok((select count(*) = 2 from pushes), '... both admins with a phone are told');
select pg_temp.ok((select body = 'Mochi wouldn''t take Amoxicillin (8:00 AM). Reported by Sari.' and title = 'Medicine not taken'
                     from pushes where user_id = '00000000-0000-0000-0000-0000000139a1'),
  '... in English');
select pg_temp.ok((select body = 'Mochi tidak mau minum obat Amoxicillin (08.00). Dilaporkan Sari.' and title = 'Obat tidak diminum'
                     from pushes where user_id = '00000000-0000-0000-0000-0000000139a2'),
  '... and in Bahasa Indonesia');
truncate pushes;
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.task_exceptions (household_id, schedule_id, entity_id, occurs_on, slot_time, reason, staff_id)
  values ('00000000-0000-0000-0000-0000000139f1', '00000000-0000-0000-0000-000000013901',
          '00000000-0000-0000-0000-0000000139e1', %L, '18:00', 'pet_refused', '00000000-0000-0000-0000-0000000139c1') $q$,
  pg_temp.today())) = '' and (select count(*) = 0 from pushes),
  'a meal refused waits for the evening (no push)');

-- ---- Switches ------------------------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:staff, 'select public.set_my_notification_prefs(19::smallint, false)') like '%admins_only%',
  'a staff phone has no notification switches');
select pg_temp.ok(pg_temp.err_as(:a1, 'select public.set_my_notification_prefs(17::smallint, true)') like '%hour must be%',
  'only 18, 19, 20 or 21');
select pg_temp.ok(pg_temp.err_as(:a2, 'select public.set_my_notification_prefs(20::smallint, false)') = '',
  'a2: summary at 20.00, staff requests off');
select pg_temp.ok((select locale = 'id' and evening_summary_hour = 20 and not staff_request_pushes
                     from public.user_preferences where user_id = '00000000-0000-0000-0000-0000000139a2'),
  '... the language stays as chosen');
select pg_temp.ok(pg_temp.count_as(:a1, 'select count(*) from public.my_notification_prefs() where evening_summary_hour = 19 and staff_request_pushes') = 1,
  'a1 has the defaults');
select pg_temp.ok(pg_temp.err_as(null, 'select public.my_notification_prefs()') like '%permission denied%',
  'logged out: no access');

-- ---- Leave and suggestions --------------------------------------------------------
truncate pushes;
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.leave_requests (household_id, staff_id, start_date, end_date)
  values ('00000000-0000-0000-0000-0000000139f1', '00000000-0000-0000-0000-0000000139c1', '2027-11-30', '2027-12-02') $q$)) = '',
  'Sari asks for leave');
select pg_temp.ok((select count(*) = 1 and bool_and(user_id = '00000000-0000-0000-0000-0000000139a1') from pushes),
  '... only a1 is told (a2 turned staff requests off, a3 has no phone)');
select pg_temp.ok((select body = 'Sari asked for 30 Nov – 2 Dec off.' and title = 'Leave request' and url like '/dashboard/leave/%'
                     from pushes),
  '... "Sari asked for 30 Nov – 2 Dec off."');
truncate pushes;
select pg_temp.ok(pg_temp.err_as(:a1, $q$
  insert into public.leave_requests (household_id, staff_id, start_date, end_date)
  values ('00000000-0000-0000-0000-0000000139f1', '00000000-0000-0000-0000-0000000139c1', '2027-01-04', '2027-01-04') $q$) = ''
  and (select count(*) = 0 from pushes),
  'never to the phone that filed it');
delete from public.leave_requests where start_date = '2027-01-04';
truncate pushes;
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.routine_proposals (pet_id, title, category, time, status, batch_id, staff_id) values
    ('00000000-0000-0000-0000-0000000139e1', 'Obat pagi', 'medication', '08:00', 'pending', 'b-139', '00000000-0000-0000-0000-0000000139c1'),
    ('00000000-0000-0000-0000-0000000139e1', 'Obat siang', 'medication', '13:00', 'pending', 'b-139', '00000000-0000-0000-0000-0000000139c1'),
    ('00000000-0000-0000-0000-0000000139e1', 'Obat malam', 'medication', '20:00', 'pending', 'b-139', '00000000-0000-0000-0000-0000000139c1') $q$) = '',
  'Sari suggests a 3-dose medicine schedule');
select pg_temp.ok((select count(*) = 1 from pushes), '... one push, not three');
select pg_temp.ok((select body = 'Sari suggested 3 schedule changes.' and tag = 'proposal-b-139' from pushes),
  '... "Sari suggested 3 schedule changes."');
select pg_temp.ok(pg_temp.count_as(:staff, format('select count(*) from (select public.household_requests_push_on(%L) as v) x where v',
                                                  '00000000-0000-0000-0000-0000000139f1')) = 1,
  'the staff phone learns an admin will be told');
select pg_temp.ok(pg_temp.count_as(:staff, format('select count(*) from (select public.household_requests_push_on(%L) as v) x where v',
                                                  '00000000-0000-0000-0000-0000000139f2')) = 0,
  '... and nothing about another household');

-- ---- The evening summary --------------------------------------------------------------
truncate pushes;
select pg_temp.ok(public.notify_evening_summary(pg_temp.at_hour(18)) = 0, '18.00: nobody picked it');
select pg_temp.ok(public.notify_evening_summary(pg_temp.at_hour(19)) = 2, '19.00: a1 (f1) and a4 (f2)');
select pg_temp.ok((select title = 'Not done today' and tag = 'evening-' || pg_temp.today()
                          and url = '/dashboard?module=agenda&summary=' || pg_temp.today()
                     from pushes where user_id = '00000000-0000-0000-0000-0000000139a1'),
  '... the title, the tag of the day, opening the summary');
select pg_temp.ok((select body = 'Couldn''t: Mochi: Amoxicillin (wouldn''t take medicine), Laundry (out of stock) and Mochi: Dinner (wouldn''t eat).'
                              || ' Not done: Water the plants and Mop the terrace.'
                              || ' Waiting for you: 1 schedule suggestion and Sari''s leave.'
                     from pushes where user_id = '00000000-0000-0000-0000-0000000139a1'),
  '... couldn''t (each listed once), not done (due by now; Kopi at the clinic and the 23:00 sweep left out), waiting');
select pg_temp.ok((select body = 'Not done: Internet.' from pushes where user_id = '00000000-0000-0000-0000-0000000139a4'),
  '... f2 has its own');
truncate pushes;
select pg_temp.ok(public.notify_evening_summary(pg_temp.at_hour(20)) = 1, '20.00: a2, who picked it');
select pg_temp.ok((select body like 'Tidak bisa: %' and body like '%Belum: Mop the terrace.%'
                          and body not like '%Water the plants%' and body like '%Menunggu Anda: %cuti Sari%'
                     from pushes where user_id = '00000000-0000-0000-0000-0000000139a2'),
  '... in Bahasa Indonesia; a1''s own chore isn''t in a2''s');

-- Everything done or explained away: no push.
delete from public.task_exceptions;
delete from public.leave_requests where household_id = '00000000-0000-0000-0000-0000000139f1';
delete from public.routine_proposals where batch_id = 'b-139';
update public.master_schedules set is_active = false where id in (
  '00000000-0000-0000-0000-000000013901', '00000000-0000-0000-0000-000000013902');
update public.household_tasks set status = 'completed', before_photo_url = 'x/b.jpg', after_photo_url = 'x/a.jpg', due_date = pg_temp.today()
 where id = '00000000-0000-0000-0000-0000000139d2';
-- The repeats' days written as done.
insert into public.household_tasks (household_id, parent_task_id, title, category, due_date, status, before_photo_url, after_photo_url)
select household_id, id, title, category, pg_temp.today(), 'completed', 'x/b.jpg', 'x/a.jpg'
  from public.household_tasks where id in ('00000000-0000-0000-0000-0000000139d1', '00000000-0000-0000-0000-0000000139d5');
truncate pushes;
-- Run, then look: one statement can't see the pushes its own call captured.
create temp table runs (n int);
insert into runs select public.notify_evening_summary(pg_temp.at_hour(19));
select pg_temp.ok((select n from runs) = 1 and (select count(*) = 1 from pushes
                    where user_id = '00000000-0000-0000-0000-0000000139a4'),
  'f1 all done: no push for a1 (silence means done); f2 still gets one');

-- Leave: a paused day isn't listed.
update public.household_tasks set status = 'pending', before_photo_url = null, after_photo_url = null,
       assigned_to = '00000000-0000-0000-0000-0000000139c1'
 where parent_task_id = '00000000-0000-0000-0000-0000000139d1' and due_date = pg_temp.today();
insert into public.leave_requests (household_id, staff_id, start_date, end_date, status, fallback_action)
values ('00000000-0000-0000-0000-0000000139f1', '00000000-0000-0000-0000-0000000139c1', pg_temp.today(), pg_temp.today(), 'approved', 'pause');
truncate pushes;
truncate runs;
insert into runs select public.notify_evening_summary(pg_temp.at_hour(19));
select pg_temp.ok((select n from runs) = 1
                  and not exists (select 1 from pushes where user_id = '00000000-0000-0000-0000-0000000139a1'),
  'Sari on leave with her chores paused: her laundry isn''t listed');

-- ---- A written day's own title and time (Codex, PR #71) -------------------------------
-- Today's plants, written with its own title and time (21:00): not due by 19.00.
update public.household_tasks
   set status = 'pending', before_photo_url = null, after_photo_url = null, title = 'Plants (late)', due_time = '21:00'
 where parent_task_id = '00000000-0000-0000-0000-0000000139d5' and due_date = pg_temp.today();
select pg_temp.ok((select title = 'Plants (late)' and due_time = '21:00'
                     from public.chore_days_open(pg_temp.today()) where chore_id = '00000000-0000-0000-0000-0000000139d5'),
  'a written day reads its own title and time');

-- ---- Slots matched as Today matches them (Codex, PR #71) ------------------------------
-- Potty every 4 hours from 08:00 to 16:00, with one log at 12:05: the 12:00
-- slot is done, 08:00 and 16:00 are open (not 08:00 done and 12:00 open).
insert into public.master_schedules (id, entity_id, title, module, frequency_type, start_time, end_time, interval_hours, is_active, created_at)
values ('00000000-0000-0000-0000-000000013904', '00000000-0000-0000-0000-0000000139e1', 'Potty', 'pet', 'interval',
        '08:00', '16:00', 4, true, now() - interval '7 days');
insert into public.task_logs (schedule_id, entity_id, module, completed_at)
values ('00000000-0000-0000-0000-000000013904', '00000000-0000-0000-0000-0000000139e1', 'pet',
        (pg_temp.today() + time '12:05') at time zone 'Asia/Jakarta');
select pg_temp.ok((select array_agg(slot_time order by slot_time) from public.routine_slots_open(pg_temp.today())
                    where schedule_id = '00000000-0000-0000-0000-000000013904') = array['08:00'::time, '16:00'::time],
  'an interval routine: the logged 12:00 slot is done, 08:00 and 16:00 are open');
insert into public.task_logs (schedule_id, entity_id, module, completed_at)
values ('00000000-0000-0000-0000-000000013904', '00000000-0000-0000-0000-0000000139e1', 'pet',
        (pg_temp.today() + time '07:50') at time zone 'Asia/Jakarta');
select pg_temp.ok((select array_agg(slot_time order by slot_time) from public.routine_slots_open(pg_temp.today())
                    where schedule_id = '00000000-0000-0000-0000-000000013904') = array['16:00'::time],
  '... and a 07:50 log settles 08:00');
delete from public.master_schedules where id = '00000000-0000-0000-0000-000000013904';
-- An archived pet's routines leave the summary, as they leave Today.
update public.task_entities set metadata = '{"archived": true}' where id = '00000000-0000-0000-0000-0000000139e1';
update public.master_schedules set is_active = true where id = '00000000-0000-0000-0000-000000013901';
select pg_temp.ok(not exists (select 1 from public.routine_slots_open(pg_temp.today())
                               where entity_id = '00000000-0000-0000-0000-0000000139e1'),
  'an archived pet''s routines are left out');
update public.task_entities set metadata = '{}' where id = '00000000-0000-0000-0000-0000000139e1';
update public.master_schedules set is_active = false where id = '00000000-0000-0000-0000-000000013901';

-- ---- 90 days, photos, export ---------------------------------------------------------
insert into public.task_exceptions (id, household_id, chore_id, occurs_on, reason, photo_url)
values ('00000000-0000-0000-0000-00000139ee03', '00000000-0000-0000-0000-0000000139f1', '00000000-0000-0000-0000-0000000139d6',
        pg_temp.today(), 'done_by_other',
        'http://x/storage/v1/object/public/household-logs/00000000-0000-0000-0000-0000000139f1/couldnt/p.webp');
create temp table exported (data jsonb);
grant insert on exported to authenticated;
select pg_temp.ok(pg_temp.err_as(:a1, 'insert into exported select public.export_household_data()') = '',
  'the export runs for an admin');
select pg_temp.ok((select jsonb_array_length(data -> 'couldnt_do') = 1
              and data -> 'couldnt_do' -> 0 ->> 'reason' = 'done_by_other'
              and data -> 'couldnt_do' -> 0 ->> 'photo' like 'household-logs/%/couldnt/p.webp'
              and (data -> 'my_notifications' ->> 'evening_summary_hour')::int = 19
         from exported),
  '... with the couldn''t-do rows and the admin''s own switches');
select pg_temp.ok(pg_temp.err_as(:staff, 'select public.export_household_data()') like '%admins_only%',
  '... never for a staff phone');
select pg_temp.ok((select prosrc like '%task_exceptions%' from pg_proc where proname = 'orphaned_household_photos')
  and (select prosrc like '%task_exceptions%' from pg_proc where proname = 'task_photos_due_for_pruning')
  and (select prosrc like '%task_exceptions%' from pg_proc where proname = 'forget_missing_task_photos')
  and (select prosrc like '%bill_payments%' from pg_proc where proname = 'orphaned_household_photos')
  and (select prosrc like '%bill_payments%' from pg_proc where proname = 'export_household_data')
  and (select prosrc like '%feedback%' from pg_proc where proname = 'export_household_data'),
  'the photo clean-up and export know the new rows, and keep bill payments and feedback');
update public.task_exceptions set created_at = now() - interval '91 days' where id = '00000000-0000-0000-0000-00000139ee03';
select pg_temp.ok(public.prune_old_task_exceptions() >= 1, 'the prune removes old rows');
select pg_temp.ok(not exists (select 1 from public.task_exceptions where id = '00000000-0000-0000-0000-00000139ee03'),
  'after 90 days a row is deleted');
select pg_temp.ok(exists (select 1 from cron.job where jobname = 'notify-evening-summary' and schedule = '0 11-14 * * *')
  and exists (select 1 from cron.job where jobname = 'prune-old-task-exceptions'),
  'both cron jobs are scheduled');

-- ---- Grants ---------------------------------------------------------------------------
select pg_temp.ok(not has_function_privilege('anon', 'public.set_my_notification_prefs(smallint, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.household_requests_push_on(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.notify_evening_summary(timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.queue_staff_request_push(uuid, text, text, text, text, text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.task_exceptions_guard()', 'execute')
  and not has_function_privilege('authenticated', 'public.chore_days_open(date)', 'execute')
  and not has_function_privilege('anon', 'public.export_household_data()', 'execute')
  and has_function_privilege('authenticated', 'public.my_notification_prefs()', 'execute')
  and not has_table_privilege('anon', 'public.task_exceptions', 'select')
  and not has_table_privilege('authenticated', 'public.task_exceptions', 'update'),
  'grants: clients reach only what they need');

rollback;
