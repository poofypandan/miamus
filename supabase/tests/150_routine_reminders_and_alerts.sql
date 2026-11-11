-- Migration 150 checks: timed reminders for staff (D7) and "tell us if it's
-- not done" for owners (D15). A reminder fires only while a pet is open, and
-- names only the open pets; nothing doubles across reruns; quiet hours with
-- the 22.00 stretch; the owner alert 30 minutes later, cancelled by a log or
-- a "couldn't do", once only; who gets what (the person, anyone, a shared
-- phone, the household switch, owners in their own language, never staff
-- phones); the export; the grants.
-- LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/150_routine_reminders_and_alerts.sql
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
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
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
create function pg_temp.json_as(uid uuid, stmt text) returns jsonb language plpgsql as $$
declare j jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute stmt into j;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return j;
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
create function pg_temp.at(h int, m int default 0) returns timestamptz language sql as $$
  select (pg_temp.today() + make_time(h, m, 0)) at time zone 'Asia/Jakarta' $$;
-- Between cases: nothing recorded, nothing sent yet today.
create function pg_temp.fresh() returns void language sql as $$
  delete from pg_temp.pushes;
  delete from public.routine_push_sent;
$$;
create function pg_temp.run(h int, m int default 0) returns int language sql as $$
  select public.notify_routines_due(pg_temp.at(h, m)) $$;

-- ---- Households ----------------------------------------------------------------------
-- f1: owners a1 (English) and a2 (Indonesian); phone p1 (Sari's own), phone
-- p2 (shared by Wati and Dewi), phone p3 linked but nobody's notifications
-- on. Pets Mocha and Matcha. f2: owner a9, pet Coco, phone p9 (Rina).
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, anon, now(), now()
from (values
  ('00000000-0000-0000-0000-0000000150a1', 'one150@test.local', false),
  ('00000000-0000-0000-0000-0000000150a2', 'two150@test.local', false),
  ('00000000-0000-0000-0000-0000000150a9', 'nine150@test.local', false),
  ('00000000-0000-0000-0000-0000000150b1', null, true),
  ('00000000-0000-0000-0000-0000000150b2', null, true),
  ('00000000-0000-0000-0000-0000000150b3', null, true),
  ('00000000-0000-0000-0000-0000000150b9', null, true)
) as u(id, email, anon);
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000150f1', 'Rumah Melati', '00000000-0000-0000-0000-0000000150a1'),
  ('00000000-0000-0000-0000-0000000150f2', 'Rumah Kenanga', '00000000-0000-0000-0000-0000000150a9');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000150f1', '00000000-0000-0000-0000-0000000150a1', 'owner'),
  ('00000000-0000-0000-0000-0000000150f1', '00000000-0000-0000-0000-0000000150a2', 'owner'),
  ('00000000-0000-0000-0000-0000000150f2', '00000000-0000-0000-0000-0000000150a9', 'owner');
insert into public.user_preferences (user_id, locale) values
  ('00000000-0000-0000-0000-0000000150a1', 'en'),
  ('00000000-0000-0000-0000-0000000150a2', 'id')
on conflict (user_id) do update set locale = excluded.locale;
insert into public.device_sessions (user_id, household_id) values
  ('00000000-0000-0000-0000-0000000150b1', '00000000-0000-0000-0000-0000000150f1'),
  ('00000000-0000-0000-0000-0000000150b2', '00000000-0000-0000-0000-0000000150f1'),
  ('00000000-0000-0000-0000-0000000150b3', '00000000-0000-0000-0000-0000000150f1'),
  ('00000000-0000-0000-0000-0000000150b9', '00000000-0000-0000-0000-0000000150f2');
insert into public.staff_profiles (id, household_id, name) values
  ('00000000-0000-0000-0000-0000000150c1', '00000000-0000-0000-0000-0000000150f1', 'Sari'),
  ('00000000-0000-0000-0000-0000000150c2', '00000000-0000-0000-0000-0000000150f1', 'Wati'),
  ('00000000-0000-0000-0000-0000000150c3', '00000000-0000-0000-0000-0000000150f1', 'Dewi'),
  ('00000000-0000-0000-0000-0000000150c9', '00000000-0000-0000-0000-0000000150f2', 'Rina');
insert into public.staff_push_people (device_user_id, staff_id, household_id) values
  ('00000000-0000-0000-0000-0000000150b1', '00000000-0000-0000-0000-0000000150c1', '00000000-0000-0000-0000-0000000150f1'),
  ('00000000-0000-0000-0000-0000000150b2', '00000000-0000-0000-0000-0000000150c2', '00000000-0000-0000-0000-0000000150f1'),
  ('00000000-0000-0000-0000-0000000150b2', '00000000-0000-0000-0000-0000000150c3', '00000000-0000-0000-0000-0000000150f1'),
  ('00000000-0000-0000-0000-0000000150b9', '00000000-0000-0000-0000-0000000150c9', '00000000-0000-0000-0000-0000000150f2');
-- Every phone and owner has a subscription (p3 too: it just notifies nobody).
insert into public.push_subscriptions (user_id, household_id, subscription)
select u::uuid, h::uuid,
       jsonb_build_object('endpoint', 'https://fcm.googleapis.com/fcm/send/' || u,
                          'keys', jsonb_build_object('p256dh', 'k', 'auth', 'a'))
from (values
  ('00000000-0000-0000-0000-0000000150b1', '00000000-0000-0000-0000-0000000150f1'),
  ('00000000-0000-0000-0000-0000000150b2', '00000000-0000-0000-0000-0000000150f1'),
  ('00000000-0000-0000-0000-0000000150b3', '00000000-0000-0000-0000-0000000150f1'),
  ('00000000-0000-0000-0000-0000000150b9', '00000000-0000-0000-0000-0000000150f2'),
  ('00000000-0000-0000-0000-0000000150a1', '00000000-0000-0000-0000-0000000150f1'),
  ('00000000-0000-0000-0000-0000000150a2', '00000000-0000-0000-0000-0000000150f1'),
  ('00000000-0000-0000-0000-0000000150a9', '00000000-0000-0000-0000-0000000150f2')
) as s(u, h);
insert into public.task_entities (id, household_id, entity_type, name) values
  ('00000000-0000-0000-0000-0000000150e1', '00000000-0000-0000-0000-0000000150f1', 'pet', 'Mocha'),
  ('00000000-0000-0000-0000-0000000150e2', '00000000-0000-0000-0000-0000000150f1', 'pet', 'Matcha'),
  ('00000000-0000-0000-0000-0000000150e9', '00000000-0000-0000-0000-0000000150f2', 'pet', 'Coco');

\set a1 '''00000000-0000-0000-0000-0000000150a1'''
\set a2 '''00000000-0000-0000-0000-0000000150a2'''
\set a9 '''00000000-0000-0000-0000-0000000150a9'''
\set p1 '''00000000-0000-0000-0000-0000000150b1'''
\set p2 '''00000000-0000-0000-0000-0000000150b2'''
\set p3 '''00000000-0000-0000-0000-0000000150b3'''
\set p9 '''00000000-0000-0000-0000-0000000150b9'''
\set sari '''00000000-0000-0000-0000-0000000150c1'''
\set mocha '''00000000-0000-0000-0000-0000000150e1'''
\set matcha '''00000000-0000-0000-0000-0000000150e2'''
\set f1 '''00000000-0000-0000-0000-0000000150f1'''

-- ---- The switches ----------------------------------------------------------------------
select pg_temp.ok((select count(*) = 0 from public.master_schedules where remind_staff or alert_owners),
  'every existing routine starts with both switches off');

-- Lights off at 21.30 for Mocha and Matcha (one group), for anyone.
insert into public.master_schedules (id, entity_id, title, module, frequency_type, fixed_times, kind,
                                     routine_group_id, created_at, remind_staff, alert_owners) values
  ('00000000-0000-0000-0000-0000000150d1', :mocha, 'Matikan lampu', 'pet', 'fixed_time', array['21:30']::time[], 'lights',
   '00000000-0000-0000-0000-000000015091', now() - interval '2 days', true, true),
  ('00000000-0000-0000-0000-0000000150d2', :matcha, 'Matikan lampu', 'pet', 'fixed_time', array['21:30']::time[], 'lights',
   '00000000-0000-0000-0000-000000015091', now() - interval '2 days', true, true);

select pg_temp.ok(pg_temp.err_as(:p1, $q$ update public.master_schedules set remind_staff = false
                                          where id = '00000000-0000-0000-0000-0000000150d1' $q$) = ''
                  and (select remind_staff from public.master_schedules where id = '00000000-0000-0000-0000-0000000150d1'),
  'a staff phone can''t turn a reminder off (144''s admin-only writes)');
select pg_temp.ok(pg_temp.err_as(:a1, $q$ update public.master_schedules set alert_owners = alert_owners
                                          where id = '00000000-0000-0000-0000-0000000150d1' $q$) = '',
  '... an owner can write them');

-- ---- D7: the staff reminder --------------------------------------------------------------
select pg_temp.fresh();
select pg_temp.run(21, 25);
select pg_temp.ok((select count(*) = 0 from pushes), 'nothing before 21.30');

select pg_temp.run(21, 30);
select pg_temp.ok((select count(*) = 2 from pushes), 'at 21.30, for anyone: one push to each phone that notifies someone');
select pg_temp.ok((select count(*) = 2 from pushes where role = 'staff' and user_id in (:p1::uuid, :p2::uuid)),
  '... Sari''s phone and the shared phone, as staff pushes');
select pg_temp.ok((select bool_and(title = 'Pengingat' and body = '21.30 · Matikan lampu · Matcha & Mocha'
                                   and url = '/staff') from pushes),
  '... "Pengingat", "21.30 · Matikan lampu · Matcha & Mocha", the same text on the shared phone');
select pg_temp.ok((select count(*) = 0 from pushes where user_id in (:p3::uuid, :p9::uuid, :a1::uuid, :a2::uuid)),
  '... not a phone that notifies nobody, not another household, not an owner');
select pg_temp.ok((select count(*) = 2 from public.routine_push_sent where push = 'staff_reminder'),
  '... and both routine rows are marked sent');

delete from pushes;
select pg_temp.run(21, 30);
select pg_temp.run(21, 35);
select pg_temp.ok((select count(*) = 0 from pushes where role = 'staff'), 'a rerun or the next run sends nothing again');

-- Only if not done: Mocha's lights logged at 21.10, so only Matcha is named.
select pg_temp.fresh();
insert into public.task_logs (schedule_id, entity_id, module, completed_at)
values ('00000000-0000-0000-0000-0000000150d1', :mocha, 'pet', pg_temp.at(21, 10));
select pg_temp.run(21, 30);
select pg_temp.ok((select count(*) = 2 and bool_and(body = '21.30 · Matikan lampu · Matcha') from pushes),
  'one pet done: the reminder names only the one still open');
select pg_temp.ok((select count(*) = 1 from public.routine_push_sent),
  '... and only that pet''s row is marked sent');

-- Matcha reopened after the push (her log undone): marked, not pushed again.
delete from pushes;
delete from public.task_logs where schedule_id = '00000000-0000-0000-0000-0000000150d1';
select pg_temp.run(21, 35);
select pg_temp.ok((select count(*) = 0 from pushes) and (select count(*) = 2 from public.routine_push_sent),
  'a pet reopened after the push: no second reminder for the same 21.30');
insert into public.task_logs (schedule_id, entity_id, module, completed_at)
values ('00000000-0000-0000-0000-0000000150d1', :mocha, 'pet', pg_temp.at(21, 10));

-- Both done: no reminder.
select pg_temp.fresh();
insert into public.task_logs (schedule_id, entity_id, module, completed_at)
values ('00000000-0000-0000-0000-0000000150d2', :matcha, 'pet', pg_temp.at(21, 20));
select pg_temp.run(21, 30);
select pg_temp.ok((select count(*) = 0 from pushes), 'both done: no reminder');
delete from public.task_logs where schedule_id in ('00000000-0000-0000-0000-0000000150d1', '00000000-0000-0000-0000-0000000150d2');

-- A "couldn't do" for one pet takes it off; for both, nothing.
select pg_temp.fresh();
insert into public.task_exceptions (household_id, schedule_id, entity_id, occurs_on, slot_time, reason)
values (:f1, '00000000-0000-0000-0000-0000000150d2', :matcha, pg_temp.today(), '21:30', 'done_by_other');
select pg_temp.run(21, 30);
select pg_temp.ok((select count(*) = 2 and bool_and(body = '21.30 · Matikan lampu · Mocha') from pushes),
  'a couldn''t-do for Matcha: only Mocha is named');
select pg_temp.fresh();
insert into public.task_exceptions (household_id, schedule_id, entity_id, occurs_on, slot_time, reason)
values (:f1, '00000000-0000-0000-0000-0000000150d1', :mocha, pg_temp.today(), '21:30', 'done_by_other');
select pg_temp.run(21, 30);
select pg_temp.ok((select count(*) = 0 from pushes), 'a couldn''t-do for both: no reminder');
delete from public.task_exceptions where schedule_id in ('00000000-0000-0000-0000-0000000150d1', '00000000-0000-0000-0000-0000000150d2');

-- Late runs: up to 20 minutes after the time, never later.
select pg_temp.fresh();
select pg_temp.run(21, 45);
select pg_temp.ok((select count(*) = 2 from pushes where role = 'staff'), 'a run 15 minutes late still reminds');
select pg_temp.fresh();
select pg_temp.run(21, 50);
select pg_temp.ok((select count(*) = 0 from pushes where role = 'staff'), '... 20 minutes late does not');

-- For one person: only phones that notify her.
update public.master_schedules set staff_id = :sari::uuid, alert_owners = false
 where routine_group_id = '00000000-0000-0000-0000-000000015091';
select pg_temp.fresh();
select pg_temp.run(21, 30);
select pg_temp.ok((select count(*) = 1 and bool_and(user_id = :p1::uuid and title = 'Pengingat'
                                                    and url = '/staff?untuk=' || :sari) from pushes),
  'for Sari: only her phone');

-- On leave today: everyone (the card shows to everyone) ...
insert into public.leave_requests (household_id, staff_id, start_date, end_date, status, fallback_action)
values (:f1, :sari::uuid, pg_temp.today(), pg_temp.today(), 'approved', 'unassign');
select pg_temp.fresh();
select pg_temp.run(21, 30);
select pg_temp.ok((select count(*) = 2 and bool_and(url = '/staff') from pushes), 'Sari on leave: every phone');
-- ... or the person covering for her.
update public.leave_requests set fallback_action = 'reassign',
       fallback_assignee_id = '00000000-0000-0000-0000-0000000150c2' where staff_id = :sari::uuid;
select pg_temp.fresh();
select pg_temp.run(21, 30);
select pg_temp.ok((select count(*) = 1 and bool_and(user_id = :p2::uuid and body = '21.30 · Matikan lampu · Matcha & Mocha') from pushes),
  '... Wati covering: the phone that notifies Wati, with the full text (shared or not)');
delete from public.leave_requests where staff_id = :sari::uuid;

-- Sari turned her notifications off on her phone: nobody.
delete from public.staff_push_people where staff_id = :sari::uuid;
select pg_temp.fresh();
select pg_temp.run(21, 30);
select pg_temp.ok((select count(*) = 0 from pushes), 'her own switch off: no push');
insert into public.staff_push_people (device_user_id, staff_id, household_id) values (:p1::uuid, :sari::uuid, :f1);

-- The household switch off: no staff push.
update public.households set staff_push = false where id = :f1;
select pg_temp.fresh();
select pg_temp.run(21, 30);
select pg_temp.ok((select count(*) = 0 from pushes), 'the household switch off: no push');
update public.households set staff_push = true where id = :f1;

-- The reminder switch off: nothing.
update public.master_schedules set remind_staff = false where routine_group_id = '00000000-0000-0000-0000-000000015091';
select pg_temp.fresh();
select pg_temp.run(21, 30);
select pg_temp.ok((select count(*) = 0 from pushes), 'the switch off: no reminder');

-- ---- D7: quiet hours with the 22.00 stretch -------------------------------------------------
update public.master_schedules set remind_staff = true, staff_id = null
 where routine_group_id = '00000000-0000-0000-0000-000000015091';
update public.master_schedules set fixed_times = array['21:57']::time[]
 where routine_group_id = '00000000-0000-0000-0000-000000015091';
select pg_temp.fresh();
select pg_temp.run(21, 55);
select pg_temp.ok((select count(*) = 0 from pushes), '21.57: not at 21.55');
select pg_temp.run(22, 0);
select pg_temp.ok((select count(*) = 2 from pushes), '... it rings at the 22.00 run: its time is before 22.00');
select pg_temp.fresh();
select pg_temp.run(22, 5);
select pg_temp.ok((select count(*) = 0 from pushes), '... but a run late past 22.05 never rings');

update public.master_schedules set fixed_times = array['22:00']::time[]
 where routine_group_id = '00000000-0000-0000-0000-000000015091';
select pg_temp.fresh();
select pg_temp.run(22, 0);
select pg_temp.run(22, 5);
select pg_temp.ok((select count(*) = 0 from pushes), '22.00 is too late for a reminder');

update public.master_schedules set fixed_times = array['05:45']::time[]
 where routine_group_id = '00000000-0000-0000-0000-000000015091';
select pg_temp.fresh();
select pg_temp.run(5, 45);
select pg_temp.run(6, 0);
select pg_temp.ok((select count(*) = 0 from pushes), '05.45 is too early (mornings from 06.00, as 166)');

update public.master_schedules set fixed_times = array['06:00']::time[]
 where routine_group_id = '00000000-0000-0000-0000-000000015091';
select pg_temp.fresh();
select pg_temp.run(6, 0);
select pg_temp.ok((select count(*) = 2 from pushes), '06.00 rings');

-- ---- D15: the owner alert, 30 minutes later --------------------------------------------------
update public.master_schedules set fixed_times = array['21:30']::time[], remind_staff = false, alert_owners = true
 where routine_group_id = '00000000-0000-0000-0000-000000015091';
select pg_temp.fresh();
select pg_temp.run(21, 30);
select pg_temp.run(21, 55);
select pg_temp.ok((select count(*) = 0 from pushes), 'no alert before 22.00, and no reminder with that switch off');

select pg_temp.run(22, 0);
select pg_temp.ok((select count(*) = 2 from pushes), 'at 22.00: one push to each owner with notifications on');
select pg_temp.ok((select count(*) = 2 from pushes where role = 'owner' and user_id in (:a1::uuid, :a2::uuid)),
  '... both owners of this household, as owner pushes');
select pg_temp.ok((select title = 'Lights off · Matcha & Mocha' and body = 'Not done yet (9:30 PM)'
                     from pushes where user_id = :a1::uuid),
  '... in English for a1: "Lights off · Matcha & Mocha", "Not done yet (9:30 PM)"');
select pg_temp.ok((select title = 'Matikan lampu · Matcha & Mocha' and body = 'Belum dikerjakan (21.30)'
                     and url = '/dashboard?module=agenda'
                     from pushes where user_id = :a2::uuid),
  '... in Indonesian for a2: "Matikan lampu · Matcha & Mocha", "Belum dikerjakan (21.30)"');
select pg_temp.ok((select count(*) = 0 from pushes where role = 'staff' or user_id = :a9::uuid),
  '... never a staff phone, never another household''s owner');

delete from pushes;
select pg_temp.run(22, 0);
select pg_temp.run(22, 5);
select pg_temp.run(22, 15);
select pg_temp.ok((select count(*) = 0 from pushes), 'once per occurrence: never repeated');

-- Done first: no alert.
select pg_temp.fresh();
insert into public.task_logs (schedule_id, entity_id, module, completed_at) values
  ('00000000-0000-0000-0000-0000000150d1', :mocha, 'pet', pg_temp.at(21, 40)),
  ('00000000-0000-0000-0000-0000000150d2', :matcha, 'pet', pg_temp.at(21, 50));
select pg_temp.run(22, 0);
select pg_temp.ok((select count(*) = 0 from pushes), 'done before 22.00: no alert');
delete from public.task_logs where schedule_id in ('00000000-0000-0000-0000-0000000150d1', '00000000-0000-0000-0000-0000000150d2');

-- A couldn't-do first: no alert for that pet; for both, none.
select pg_temp.fresh();
insert into public.task_exceptions (household_id, schedule_id, entity_id, occurs_on, slot_time, reason) values
  (:f1, '00000000-0000-0000-0000-0000000150d1', :mocha, pg_temp.today(), '21:30', 'done_by_other');
select pg_temp.run(22, 0);
select pg_temp.ok((select count(*) = 2 and bool_and(title in ('Lights off · Matcha', 'Matikan lampu · Matcha')) from pushes),
  'a couldn''t-do for Mocha: the alert names only Matcha');
select pg_temp.fresh();
insert into public.task_exceptions (household_id, schedule_id, entity_id, occurs_on, slot_time, reason) values
  (:f1, '00000000-0000-0000-0000-0000000150d2', :matcha, pg_temp.today(), '21:30', 'done_by_other');
select pg_temp.run(22, 0);
select pg_temp.ok((select count(*) = 0 from pushes), 'a couldn''t-do for both: no alert');
delete from public.task_exceptions where schedule_id in ('00000000-0000-0000-0000-0000000150d1', '00000000-0000-0000-0000-0000000150d2');

-- Late runs: up to 20 minutes after 22.00.
select pg_temp.fresh();
select pg_temp.run(22, 15);
select pg_temp.ok((select count(*) = 2 from pushes), 'an alert run 15 minutes late still goes');
select pg_temp.fresh();
select pg_temp.run(22, 20);
select pg_temp.ok((select count(*) = 0 from pushes), '... 20 minutes late does not');

-- The owner's quiet hours: until 22.30 for a routine at 22.00 or earlier.
update public.master_schedules set fixed_times = array['22:00']::time[]
 where routine_group_id = '00000000-0000-0000-0000-000000015091';
select pg_temp.fresh();
select pg_temp.run(22, 30);
select pg_temp.ok((select count(*) = 2 from pushes), 'a 22.00 routine: the alert comes at 22.30');
select pg_temp.fresh();
select pg_temp.run(22, 40);
select pg_temp.ok((select count(*) = 0 from pushes), '... a run late to 22.40 sends nothing');
update public.master_schedules set fixed_times = array['22:05']::time[]
 where routine_group_id = '00000000-0000-0000-0000-000000015091';
select pg_temp.fresh();
select pg_temp.run(22, 35);
select pg_temp.run(22, 40);
select pg_temp.ok((select count(*) = 0 from pushes), 'a 22.05 routine: too late for an alert');
update public.master_schedules set fixed_times = array['05:30']::time[]
 where routine_group_id = '00000000-0000-0000-0000-000000015091';
select pg_temp.fresh();
select pg_temp.run(6, 0);
select pg_temp.ok((select count(*) = 2 from pushes), 'a 05.30 routine: the alert comes at 06.00');
update public.master_schedules set fixed_times = array['05:25']::time[]
 where routine_group_id = '00000000-0000-0000-0000-000000015091';
select pg_temp.fresh();
select pg_temp.run(5, 55);
select pg_temp.run(6, 0);
select pg_temp.ok((select count(*) = 0 from pushes), 'a 05.25 routine: too early for an alert');

-- ---- Both switches, and the English name of an Other ------------------------------------------
update public.master_schedules set fixed_times = array['21:30']::time[], remind_staff = true,
       kind = 'other', title = 'Kunci pintu depan'
 where routine_group_id = '00000000-0000-0000-0000-000000015091';
select pg_temp.fresh();
select pg_temp.run(21, 30);
select pg_temp.run(22, 0);
select pg_temp.ok((select count(*) = 2 from pushes where role = 'staff' and body = '21.30 · Kunci pintu depan · Matcha & Mocha')
                  and (select count(*) = 2 from pushes where role = 'owner'),
  'both on: staff reminded at 21.30, owners told at 22.00');
select pg_temp.ok((select title = 'Kunci pintu depan · Matcha & Mocha' from pushes where user_id = :a1::uuid),
  '... an Other routine keeps its typed name in English');

-- ---- Text helpers -----------------------------------------------------------------------------
select pg_temp.ok(public.push_names_label(array['Mocha'], 'id') = 'Mocha'
                  and public.push_names_label(array['A', 'B', 'C'], 'en') = 'A, B & C'
                  and public.push_names_label(array['A', 'B', 'C', 'D', 'E'], 'id') = 'A, B, C & 2 lagi'
                  and public.push_names_label(array['A', 'B', 'C', 'D'], 'en') = 'A, B, C & 1 more',
  'pet names: "A & B", "A, B & C", then "& 2 lagi" / "& 1 more"');
select pg_temp.ok(public.routine_owner_title('walk', 'Jalan-jalan', 'en') = 'Walk'
                  and public.routine_owner_title('walk', 'Jalan-jalan', 'id') = 'Jalan-jalan'
                  and public.routine_owner_title(null, 'Medication: Bravecto', 'en') = 'Bravecto',
  'owner titles: a chip in English, the saved title otherwise, without the app''s prefixes');

-- ---- Pruning, the export, the grants -----------------------------------------------------------
insert into public.routine_push_sent (schedule_id, occurs_on, slot_time, push, household_id)
values ('00000000-0000-0000-0000-0000000150d1', pg_temp.today() - 8, '21:30', 'staff_reminder', :f1);
select pg_temp.run(3, 0);
select pg_temp.ok((select count(*) = 0 from public.routine_push_sent where occurs_on < pg_temp.today() - 7),
  'sent marks older than 7 days are pruned');

select pg_temp.ok((select bool_and((r ->> 'remind_staff')::boolean and (r ->> 'alert_owners')::boolean)
                     from jsonb_array_elements(pg_temp.json_as(:a1, 'select public.export_household_data()') -> 'routines') r
                    where r ->> 'id' in ('00000000-0000-0000-0000-0000000150d1', '00000000-0000-0000-0000-0000000150d2')),
  'the export carries both switches on each routine');

select pg_temp.ok(not has_function_privilege('authenticated', 'public.notify_routines_due(timestamptz)', 'execute')
                  and not has_function_privilege('anon', 'public.notify_routines_due(timestamptz)', 'execute')
                  and not has_function_privilege('authenticated', 'public.queue_staff_reminder_push(uuid, uuid, text, text, text, text)', 'execute')
                  and not has_function_privilege('anon', 'public.queue_staff_reminder_push(uuid, uuid, text, text, text, text)', 'execute')
                  and not has_function_privilege('authenticated', 'public.push_names_label(text[], text)', 'execute')
                  and not has_function_privilege('authenticated', 'public.routine_owner_title(text, text, text)', 'execute'),
  'no client role can run the job or its helpers');
select pg_temp.ok(not has_table_privilege('authenticated', 'public.routine_push_sent', 'select')
                  and not has_table_privilege('anon', 'public.routine_push_sent', 'select')
                  and not has_table_privilege('authenticated', 'public.routine_push_sent', 'insert'),
  '... nor read or write what was sent');
select pg_temp.ok((select count(*) = 1 from cron.job where jobname = 'notify-routines-due' and schedule = '*/5 * * * *'),
  'the job runs every 5 minutes');

rollback;
