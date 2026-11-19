-- Migration 170 checks: a routine owes only the slots after it was made
-- (owner, 13 Nov). On the day a row is made, routine_slots_open leaves out
-- its unlogged slots earlier than its created_at, so no staff reminder, no
-- owner alert and no evening "not done" line for them; north_star_day
-- neither counts them due nor closed. A later slot that day, the next day,
-- a row made before its slot, a one-off anchored at midnight and a row made
-- on the slot's minute are all owed as before. Logs still match as before.
-- Same grants and settings as 144.
-- LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/170_routine_slot_owed_from_creation.sql
\set ON_ERROR_STOP on
\pset footer off
begin;

create function pg_temp.ok(cond boolean, label text) returns text language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  return 'ok  ' || label;
end $$;

-- Pushes captured instead of sent (replaced for this transaction only).
create temp table pushes (household uuid, role text, title text, body text, url text, tag text, user_id uuid);
create or replace function public.queue_push(
  p_household_id uuid, p_target_role text, p_title text, p_body text,
  p_url text default '/', p_tag text default null, p_user_id uuid default null, p_exclude_user_id uuid default null
) returns boolean language plpgsql as $$
begin
  insert into pg_temp.pushes values (p_household_id, p_target_role, p_title, p_body, p_url, p_tag, p_user_id);
  return true;
end $$;

create temp table d as select (now() at time zone 'Asia/Jakarta')::date as today;
create function pg_temp.today() returns date language sql as $$ select today from pg_temp.d $$;
create function pg_temp.at(h int, m int default 0, day_offset int default 0) returns timestamptz language sql as $$
  select (pg_temp.today() + day_offset + make_time(h, m, 0)) at time zone 'Asia/Jakarta' $$;
create function pg_temp.fresh() returns void language sql as $$
  delete from pg_temp.pushes;
  delete from public.routine_push_sent;
$$;
create function pg_temp.run(h int, m int default 0) returns int language sql as $$
  select public.notify_routines_due(pg_temp.at(h, m)) $$;
-- The open slots of one routine row on a day, as "HH:MM".
create function pg_temp.open_of(sid uuid, day date) returns text language sql as $$
  select coalesce(string_agg(to_char(o.slot_time, 'HH24:MI'), ',' order by o.slot_time), '')
    from public.routine_slots_open(day) o where o.schedule_id = sid $$;

-- ---- One household: owner a1 (English), Sari's phone p1, pet Matcha ------------------
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, anon, now(), now()
from (values
  ('00000000-0000-0000-0000-0000000170a1', 'one170@test.local', false),
  ('00000000-0000-0000-0000-0000000170b1', null, true)
) as u(id, email, anon);
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000170f1', 'Rumah Melati', '00000000-0000-0000-0000-0000000170a1');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000170f1', '00000000-0000-0000-0000-0000000170a1', 'owner');
insert into public.user_preferences (user_id, locale) values ('00000000-0000-0000-0000-0000000170a1', 'en')
on conflict (user_id) do update set locale = excluded.locale;
insert into public.device_sessions (user_id, household_id) values
  ('00000000-0000-0000-0000-0000000170b1', '00000000-0000-0000-0000-0000000170f1');
insert into public.staff_profiles (id, household_id, name) values
  ('00000000-0000-0000-0000-0000000170c1', '00000000-0000-0000-0000-0000000170f1', 'Sari');
insert into public.staff_push_people (device_user_id, staff_id, household_id) values
  ('00000000-0000-0000-0000-0000000170b1', '00000000-0000-0000-0000-0000000170c1', '00000000-0000-0000-0000-0000000170f1');
insert into public.push_subscriptions (user_id, household_id, subscription)
select u::uuid, '00000000-0000-0000-0000-0000000170f1',
       jsonb_build_object('endpoint', 'https://fcm.googleapis.com/fcm/send/' || u,
                          'keys', jsonb_build_object('p256dh', 'k', 'auth', 'a'))
from (values ('00000000-0000-0000-0000-0000000170b1'), ('00000000-0000-0000-0000-0000000170a1')) as s(u);
insert into public.task_entities (id, household_id, entity_type, name) values
  ('00000000-0000-0000-0000-0000000170e1', '00000000-0000-0000-0000-0000000170f1', 'pet', 'Matcha');

\set matcha '''00000000-0000-0000-0000-0000000170e1'''
\set f1 '''00000000-0000-0000-0000-0000000170f1'''
-- d1: the owner's walk, 15.00, made today at 15.10 (both switches on).
-- d2: a walk at 07.00 and 17.00, made today at 12.00.
-- d3: lights off at 21.30, made today at 09.00 (before its slot).
-- d4: a one-off at 08.00 today, anchored at today's midnight.
-- d5: water at 10.00, made today at 10.00:40 (the slot's own minute).
-- d6: the walk, 15.00, made today at 15.35 (both switches on).
\set d1 '''00000000-0000-0000-0000-0000000170d1'''
\set d2 '''00000000-0000-0000-0000-0000000170d2'''
\set d3 '''00000000-0000-0000-0000-0000000170d3'''
\set d4 '''00000000-0000-0000-0000-0000000170d4'''
\set d5 '''00000000-0000-0000-0000-0000000170d5'''
\set d6 '''00000000-0000-0000-0000-0000000170d6'''
insert into public.master_schedules (id, entity_id, title, module, frequency_type, fixed_times, kind,
                                     created_at, expires_at, remind_staff, alert_owners) values
  (:d1, :matcha, 'Jalan-jalan', 'pet', 'fixed_time', array['15:00']::time[], 'walk', pg_temp.at(15, 10), null, true, true),
  (:d2, :matcha, 'Jalan sore', 'pet', 'fixed_time', array['07:00', '17:00']::time[], 'walk', pg_temp.at(12), null, false, false),
  (:d3, :matcha, 'Matikan lampu', 'pet', 'fixed_time', array['21:30']::time[], 'lights', pg_temp.at(9), null, false, false),
  (:d4, :matcha, 'Ke toko hewan', 'pet', 'fixed_time', array['08:00']::time[], 'other', pg_temp.at(0), pg_temp.today(), false, false),
  (:d5, :matcha, 'Ganti air minum', 'pet', 'fixed_time', array['10:00']::time[], 'water',
   pg_temp.at(10) + interval '40 seconds', null, false, false),
  (:d6, :matcha, 'Jalan siang', 'pet', 'fixed_time', array['15:00']::time[], 'walk', pg_temp.at(15, 35), null, true, true);

-- ---- routine_slots_open ------------------------------------------------------------------
select pg_temp.ok(pg_temp.open_of(:d1, pg_temp.today()) = '',
  'made at 15.10 for 15.00: not open today');
select pg_temp.ok(pg_temp.open_of(:d1, pg_temp.today() + 1) = '15:00',
  '... open from tomorrow');
select pg_temp.ok(pg_temp.open_of(:d2, pg_temp.today()) = '17:00',
  'made at 12.00 for 07.00 and 17.00: only 17.00 is open today');
select pg_temp.ok(pg_temp.open_of(:d2, pg_temp.today() + 1) = '07:00,17:00',
  '... both from tomorrow');
select pg_temp.ok(pg_temp.open_of(:d3, pg_temp.today()) = '21:30',
  'made at 09.00 for 21.30: open as usual');
select pg_temp.ok(pg_temp.open_of(:d4, pg_temp.today()) = '08:00',
  'a one-off anchored at midnight: every slot owed');
select pg_temp.ok(pg_temp.open_of(:d5, pg_temp.today()) = '10:00',
  'made on the slot''s own minute (10.00:40 for 10.00): owed, as the app reads it');

-- Logs still match as before: a 07.10 log on the two-slot walk claims the
-- 07.00 slot (not owed anyway), so 17.00 stays open; a 16.50 log closes 17.00.
insert into public.task_logs (schedule_id, entity_id, module, completed_at)
values (:d2, :matcha, 'pet', pg_temp.at(7, 10));
select pg_temp.ok(pg_temp.open_of(:d2, pg_temp.today()) = '17:00',
  'a log near the slot that isn''t owed leaves 17.00 open');
insert into public.task_logs (schedule_id, entity_id, module, completed_at)
values (:d2, :matcha, 'pet', pg_temp.at(16, 50));
select pg_temp.ok(pg_temp.open_of(:d2, pg_temp.today()) = '',
  '... and a log at 16.50 closes it');
delete from public.task_logs where schedule_id = :d2;

-- ---- notify_routines_due: no reminder, no alert for a slot that isn't owed ----------------
-- d1 (made 15.10) would have rung in the 15.10 run and d6 (made 15.35)
-- would have alerted the owners in the 15.35 run before 170.
select pg_temp.fresh();
select pg_temp.run(15, 10);
select pg_temp.run(15, 15);
select pg_temp.ok((select count(*) = 0 from pushes where role = 'staff'),
  'no staff reminder for 15.00 when the routine was made at 15.10');
select pg_temp.run(15, 35);
select pg_temp.run(15, 40);
select pg_temp.ok((select count(*) = 0 from pushes),
  'no owner alert for 15.00 when the routine was made at 15.35 (or at 15.10)');
select pg_temp.ok((select count(*) = 0 from public.routine_push_sent), '... and nothing is marked sent');

-- The same routine made before its slot: reminder at 15.00, alert at 15.30.
update public.master_schedules set created_at = pg_temp.at(14, 50) where id = :d1;
select pg_temp.fresh();
select pg_temp.run(15, 0);
select pg_temp.ok((select count(*) = 1 from pushes where role = 'staff' and body like '15.00 · %'),
  'made at 14.50: the staff reminder rings at 15.00 as before');
select pg_temp.run(15, 30);
select pg_temp.ok((select count(*) = 1 from pushes where role = 'owner'),
  '... and the owner alert comes at 15.30');

-- ---- north_star_day: a slot that isn't owed is neither due nor closed --------------------
update public.master_schedules set created_at = pg_temp.at(15, 10) where id = :d1;
-- Today, owed: d2 17.00, d3 21.30, d4 08.00, d5 10.00 = 4 due, none closed.
-- (d1 and d6 at 15.00, and d2 at 07.00, were made after their time.)
select pg_temp.ok((select due = 4 and closed = 0 from public.north_star_day(pg_temp.today()) n where n.household_id = :f1),
  'north star today: 4 due, 0 closed (not owed slots aren''t counted as closed)');
-- Tomorrow every repeating slot is due (d4 has ended): d1, d2 x2, d3, d5, d6 = 6.
select pg_temp.ok((select due = 6 from public.north_star_day(pg_temp.today() + 1) n where n.household_id = :f1),
  '... and tomorrow all 6 repeating slots are due');

-- ---- Same settings and grants as 144 -------------------------------------------------------
select pg_temp.ok(not has_function_privilege('authenticated', 'public.routine_slots_open(date)', 'execute')
                  and not has_function_privilege('anon', 'public.routine_slots_open(date)', 'execute')
                  and has_function_privilege('service_role', 'public.routine_slots_open(date)', 'execute')
                  and not has_function_privilege('authenticated', 'public.north_star_day(date)', 'execute')
                  and not has_function_privilege('anon', 'public.north_star_day(date)', 'execute')
                  and has_function_privilege('service_role', 'public.north_star_day(date)', 'execute'),
  'only service_role runs either function');
select pg_temp.ok((select bool_and(not prosecdef and provolatile = 's' and proconfig = array['search_path=""'])
                     from pg_proc where oid in ('public.routine_slots_open(date)'::regprocedure,
                                                'public.north_star_day(date)'::regprocedure)),
  'both stay SECURITY INVOKER, STABLE, with an empty search_path');

rollback;
