-- Migration 152 checks: owner pushes for walk-in repairs (D4) and the evening
-- summary explaining tasks missed while supervising (D10). Arrival and finish
-- pushes go to each owner with the switch on, in their language, never to
-- the owner who made the change or to staff phones; once per walk-in and push
-- (Undo, a second Selesai, a resend); none in quiet hours, with Repairs off,
-- for a stale offline arrival or with no session. The switches' reader and
-- writer (owners only). The summary: a chore due inside a stretch is
-- explained, one outside it or done isn't, the 15-minute lead, an anyone
-- chore and a routine only when every staff member on duty was supervising
-- (leave counts), a routine's own person, an open stretch, Repairs off.
-- The grants.
-- LOCAL DATABASE ONLY, with 149, 150 and 152 applied. One transaction,
-- rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/152_repair_owner_pushes_and_supervising_summary.sql
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
-- A photo URL in a household's repairs folder.
create function pg_temp.photo(h text, f text) returns text language sql as $$
  select 'http://x/storage/v1/object/public/household-logs/' || h || '/repairs/' || f $$;

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

-- ---- Quiet hours: 141's, as the trigger reads them ---------------------------------------
select pg_temp.ok(public.staff_push_quiet(pg_temp.at(21)) and public.staff_push_quiet(pg_temp.at(5, 59))
                  and not public.staff_push_quiet(pg_temp.at(6)) and not public.staff_push_quiet(pg_temp.at(20, 59)),
  'quiet hours are 21.00-06.00 Jakarta');
-- From here on the test decides (the real clock may be in quiet hours).
create temp table quiet (is_quiet boolean);
insert into quiet values (false);
create or replace function public.staff_push_quiet(p_now timestamptz default now())
returns boolean language sql stable as $$ select is_quiet from pg_temp.quiet $$;

-- ---- Households ---------------------------------------------------------------------------
-- f1: owners a1 (English), a2 (Indonesian), a3 (English, arrival pushes off,
-- no evening summary); staff phone b1; Ari (c1), Syam (c2). Repairs d1
-- "Keran bocor" at "Wastafel", d4 "AC menetes". f2: owner a9, its own repair.
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, anon, now(), now()
from (values
  ('00000000-0000-0000-0000-0000000152a1', 'one152@test.local', false),
  ('00000000-0000-0000-0000-0000000152a2', 'two152@test.local', false),
  ('00000000-0000-0000-0000-0000000152a3', 'three152@test.local', false),
  ('00000000-0000-0000-0000-0000000152a9', 'nine152@test.local', false),
  ('00000000-0000-0000-0000-0000000152b1', null, true),
  ('00000000-0000-0000-0000-0000000152b9', null, true)
) as u(id, email, anon);
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000152f1', 'Rumah Melati', '00000000-0000-0000-0000-0000000152a1'),
  ('00000000-0000-0000-0000-0000000152f2', 'Rumah Kenanga', '00000000-0000-0000-0000-0000000152a9');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000152f1', '00000000-0000-0000-0000-0000000152a1', 'owner'),
  ('00000000-0000-0000-0000-0000000152f1', '00000000-0000-0000-0000-0000000152a2', 'owner'),
  ('00000000-0000-0000-0000-0000000152f1', '00000000-0000-0000-0000-0000000152a3', 'owner'),
  ('00000000-0000-0000-0000-0000000152f2', '00000000-0000-0000-0000-0000000152a9', 'owner');
insert into public.user_preferences (user_id, locale) values
  ('00000000-0000-0000-0000-0000000152a1', 'en'),
  ('00000000-0000-0000-0000-0000000152a2', 'id'),
  ('00000000-0000-0000-0000-0000000152a3', 'en')
on conflict (user_id) do update set locale = excluded.locale;
insert into public.device_sessions (user_id, household_id) values
  ('00000000-0000-0000-0000-0000000152b1', '00000000-0000-0000-0000-0000000152f1'),
  ('00000000-0000-0000-0000-0000000152b9', '00000000-0000-0000-0000-0000000152f2');
insert into public.staff_profiles (id, household_id, name, created_at) values
  ('00000000-0000-0000-0000-0000000152c1', '00000000-0000-0000-0000-0000000152f1', 'Ari', now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000152c2', '00000000-0000-0000-0000-0000000152f1', 'Syam', now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000152c9', '00000000-0000-0000-0000-0000000152f2', 'Sari', now() - interval '1 day');
-- Every owner and staff phone has a subscription.
insert into public.push_subscriptions (user_id, household_id, subscription)
select u::uuid, h::uuid,
       jsonb_build_object('endpoint', 'https://fcm.googleapis.com/fcm/send/' || u,
                          'keys', jsonb_build_object('p256dh', 'k', 'auth', 'a'))
from (values
  ('00000000-0000-0000-0000-0000000152a1', '00000000-0000-0000-0000-0000000152f1'),
  ('00000000-0000-0000-0000-0000000152a2', '00000000-0000-0000-0000-0000000152f1'),
  ('00000000-0000-0000-0000-0000000152a3', '00000000-0000-0000-0000-0000000152f1'),
  ('00000000-0000-0000-0000-0000000152a9', '00000000-0000-0000-0000-0000000152f2'),
  ('00000000-0000-0000-0000-0000000152b1', '00000000-0000-0000-0000-0000000152f1'),
  ('00000000-0000-0000-0000-0000000152b9', '00000000-0000-0000-0000-0000000152f2')
) as s(u, h);

-- Without triggers: the repairs guard only lets an insert start open.
set local session_replication_role = replica;
insert into public.repairs (id, household_id, title, spot, status) values
  ('00000000-0000-0000-0000-0000000152d1', '00000000-0000-0000-0000-0000000152f1', 'Keran bocor', 'Wastafel', 'open'),
  ('00000000-0000-0000-0000-0000000152d4', '00000000-0000-0000-0000-0000000152f1', 'AC menetes', null, 'open'),
  ('00000000-0000-0000-0000-0000000152d5', '00000000-0000-0000-0000-0000000152f1', 'Pintu macet', null, 'open'),
  ('00000000-0000-0000-0000-0000000152d9', '00000000-0000-0000-0000-0000000152f2', 'Pagar', null, 'open');
set local session_replication_role = origin;

\set a1 '''00000000-0000-0000-0000-0000000152a1'''
\set a2 '''00000000-0000-0000-0000-0000000152a2'''
\set a3 '''00000000-0000-0000-0000-0000000152a3'''
\set a9 '''00000000-0000-0000-0000-0000000152a9'''
\set staff '''00000000-0000-0000-0000-0000000152b1'''
\set staff9 '''00000000-0000-0000-0000-0000000152b9'''
\set ari '''00000000-0000-0000-0000-0000000152c1'''
\set syam '''00000000-0000-0000-0000-0000000152c2'''
\set f1 '''00000000-0000-0000-0000-0000000152f1'''
\set f2 '''00000000-0000-0000-0000-0000000152f2'''
\set d1 '''00000000-0000-0000-0000-0000000152d1'''
\set d4 '''00000000-0000-0000-0000-0000000152d4'''
\set d5 '''00000000-0000-0000-0000-0000000152d5'''
\set v1 '''00000000-0000-0000-0000-00000152e001'''
\set v2 '''00000000-0000-0000-0000-00000152e002'''
\set v3 '''00000000-0000-0000-0000-00000152e003'''
\set v4 '''00000000-0000-0000-0000-00000152e004'''
\set v5 '''00000000-0000-0000-0000-00000152e005'''

-- ---- The switches ---------------------------------------------------------------------------
select pg_temp.ok(pg_temp.json_as(:a1, 'select to_jsonb(p) from public.my_repair_push_prefs() p')
                  = '{"repair_arrival_pushes": true, "repair_done_pushes": true}'::jsonb,
  'an owner''s two repair switches are on by default');
select pg_temp.ok(pg_temp.json_as(:a3, 'select to_jsonb(p) from public.set_my_repair_push_prefs(false, true) p')
                  = '{"repair_arrival_pushes": false, "repair_done_pushes": true}'::jsonb,
  'an owner turns arrival pushes off');
select pg_temp.ok((select locale = 'en' and not repair_arrival_pushes and repair_done_pushes and evening_summary_hour = 19
                     from public.user_preferences where user_id = :a3),
  '... saved on their own row, language and summary hour kept');
update public.user_preferences set evening_summary_hour = null where user_id = :a3;
select pg_temp.ok(pg_temp.err_as(:staff, 'select public.set_my_repair_push_prefs(false, false)') like '%admins_only%',
  'a staff phone can''t set them');
select pg_temp.ok(pg_temp.err_as(:a1, 'select public.set_my_repair_push_prefs(null, true)') like '%true or false%',
  'a missing switch is refused');
select pg_temp.ok(pg_temp.err_as(null, 'select public.my_repair_push_prefs()') like '%permission denied%'
                  and pg_temp.err_as(null, 'select public.set_my_repair_push_prefs(true, true)') like '%permission denied%',
  'logged-out callers can''t read or set them');

-- ---- Arrival -----------------------------------------------------------------------------------
truncate pushes;
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.repair_visits (id, household_id, repair_id, worker_name, logged_by_staff, before_photo_url)
  values (%L, %L, %L, 'Pak Budi', %L, %L) $q$,
  :v1, :f1, :d1, :ari, pg_temp.photo(:f1, 'r1/before.webp'))) = '',
  'Ari logs Pak Budi arriving for the leaking tap');
select pg_temp.ok((select count(*) = 2 from pushes), '... two pushes: a1 and a2 (a3 turned arrivals off)');
select pg_temp.ok((select title = 'Repair person here' and body = 'Pak Budi · Keran bocor · Wastafel (Ari)'
                          and role = 'owner' and tag = 'repair-visit-' || :v1
                          and url = '/dashboard?module=chores&chores=repairs'
                     from pushes where user_id = :a1),
  '... a1 in English: "Repair person here", "Pak Budi · Keran bocor · Wastafel (Ari)", opening Repairs');
select pg_temp.ok((select title = 'Tukang datang' and body = 'Pak Budi · Keran bocor · Wastafel (Ari)'
                     from pushes where user_id = :a2),
  '... a2 in Indonesian: "Tukang datang"');
select pg_temp.ok((select count(*) = 0 from pushes where user_id in (:a3, :a9, :staff)),
  '... nothing to a3, another household or the staff phone');
select pg_temp.ok((select count(*) = 1 from public.repair_visit_push_sent where visit_id = :v1 and push = 'arrival'),
  '... and it is recorded as sent');

-- ---- Finish -------------------------------------------------------------------------------------
truncate pushes;
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  update public.repair_visits set after_photo_url = %L, outcome = 'fixed' where id = %L $q$,
  pg_temp.photo(:f1, 'r1/after.webp'), :v1)) = '',
  'Ari taps Selesai: after photo, "Sudah beres"');
select pg_temp.ok((select count(*) = 3 from pushes), '... three pushes: a1, a2 and a3 (finish pushes on)');
select pg_temp.ok((select title = 'Repair finished' and body = 'Keran bocor · Pak Budi · Done · 2 photos: before and after'
                          and tag = 'repair-visit-' || :v1
                     from pushes where user_id = :a1),
  '... a1: "Repair finished", the chip and the photo count, replacing the arrival push (same tag)');
select pg_temp.ok((select title = 'Perbaikan selesai' and body = 'Keran bocor · Pak Budi · Sudah beres · 2 foto: sebelum dan sesudah'
                     from pushes where user_id = :a2),
  '... a2 in Indonesian');

truncate pushes;
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  update public.repair_visits set after_photo_url = %L, outcome = 'fixed' where id = %L $q$,
  pg_temp.photo(:f1, 'r1/after.webp'), :v1)) = '', 'the save queue sends the same Selesai again');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  update public.repair_visits set after_photo_url = null, outcome = null where id = %L $q$, :v1)) = '',
  'Ari takes Selesai back (Batalkan)');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  update public.repair_visits set after_photo_url = %L, outcome = 'check' where id = %L $q$,
  pg_temp.photo(:f1, 'r1/after2.webp'), :v1)) = '', '... and taps Selesai again');
select pg_temp.ok((select count(*) = 0 from pushes), '... no second finish push for the same walk-in');

-- ---- An owner logs one; their own push is skipped ---------------------------------------------
truncate pushes;
select pg_temp.ok(pg_temp.err_as(:a1, format($q$
  insert into public.repair_visits (id, household_id, repair_id, before_photo_url)
  values (%L, %L, %L, %L) $q$, :v2, :f1, :d4, pg_temp.photo(:f1, 'r4/before.webp'))) = '',
  'owner a1 logs a walk-in themself, no name');
select pg_temp.ok((select count(*) = 1 and bool_and(user_id = :a2 and body = 'AC menetes') from pushes),
  '... only a2 is told ("AC menetes"); never a1 who logged it, and a3 has arrivals off');
truncate pushes;
select pg_temp.ok(pg_temp.err_as(:a1, format($q$
  update public.repair_visits set after_photo_url = %L where id = %L $q$, pg_temp.photo(:f1, 'r4/after.webp'), :v2)) = '',
  '... and finishes it, no chip');
select pg_temp.ok((select count(*) = 2 from pushes where user_id in (:a2, :a3))
                  and (select count(*) = 0 from pushes where user_id = :a1)
                  and (select body = 'AC menetes · 2 photos: before and after' from pushes where user_id = :a3),
  '... a2 and a3 get "AC menetes · 2 photos: before and after"');

-- ---- When nothing is sent -----------------------------------------------------------------------
truncate pushes;
insert into public.household_features (household_id, feature, enabled) values (:f1, 'repairs', false);
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.repair_visits (id, household_id, repair_id, logged_by_staff, before_photo_url)
  values (%L, %L, %L, %L, %L) $q$, :v3, :f1, :d5, :syam, pg_temp.photo(:f1, 'r5/before.webp'))) = '',
  'with Repairs off, a walk-in from a stale screen is still saved');
select pg_temp.ok((select count(*) = 0 from pushes)
                  and not exists (select 1 from public.repair_visit_push_sent where visit_id = :v3),
  '... without a push, and nothing recorded');
delete from public.household_features where household_id = :f1 and feature = 'repairs';
select pg_temp.ok(pg_temp.err_as(:staff, format($q$ delete from public.repair_visits where id = %L $q$, :v3)) = '',
  '(Syam takes it back within 5 minutes)');

update quiet set is_quiet = true;
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.repair_visits (id, household_id, repair_id, logged_by_staff, before_photo_url)
  values (%L, %L, %L, %L, %L) $q$, :v4, :f1, :d5, :syam, pg_temp.photo(:f1, 'r5/before.webp'))) = '',
  'in quiet hours, Syam logs a walk-in');
select pg_temp.ok((select count(*) = 0 from pushes)
                  and not exists (select 1 from public.repair_visit_push_sent where visit_id = :v4),
  '... no push, nothing recorded');
update quiet set is_quiet = false;
select pg_temp.ok(pg_temp.err_as(:staff, format($q$ delete from public.repair_visits where id = %L $q$, :v4)) = '',
  '(Syam takes it back)');

select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.repair_visits (id, household_id, repair_id, logged_by_staff, arrived_phone_at, before_photo_url)
  values (%L, %L, %L, %L, now() - interval '40 minutes', %L) $q$, :v5, :f1, :d5, :syam, pg_temp.photo(:f1, 'r5/before.webp'))) = '',
  'a walk-in saved without signal reaches the server 40 minutes late');
select pg_temp.ok((select count(*) = 0 from pushes), '... no stale arrival push');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  update public.repair_visits set after_photo_url = %L, outcome = 'come_back' where id = %L $q$,
  pg_temp.photo(:f1, 'r5/after.webp'), :v5)) = '', '... Syam finishes it');
select pg_temp.ok((select count(*) = 3 from pushes)
                  and (select body = 'Pintu macet · Coming back · 2 photos: before and after' from pushes where user_id = :a1)
                  and (select body = 'Pintu macet · Akan datang lagi · 2 foto: sebelum dan sesudah' from pushes where user_id = :a2),
  '... the finish push still comes ("Coming back" / "Akan datang lagi")');

truncate pushes;
insert into public.repair_visits (household_id, repair_id, before_photo_url)
values (:f2, '00000000-0000-0000-0000-0000000152d9', pg_temp.photo(:f2, 'r9/before.webp'));
select pg_temp.ok((select count(*) = 0 from pushes), 'maintenance with no session pushes nobody');

-- ---- Who may touch what -----------------------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:a1, 'select count(*) from public.repair_visit_push_sent') like '%permission denied%'
                  and pg_temp.err_as(:staff, 'select count(*) from public.repair_visit_push_sent') like '%permission denied%',
  'the sent log is internal: owners and staff phones can''t read it');
select pg_temp.ok(not has_function_privilege('authenticated', p, 'execute') and not has_function_privilege('anon', p, 'execute')
                  and has_function_privilege('service_role', p, 'execute'),
  'internal: ' || p)
from unnest(array[
  'public.repair_push_prefs_of(uuid)',
  'public.queue_repair_visit_push(uuid, text, text, text, text, text, text, text, uuid)',
  'public.notify_repair_visit()',
  'public.supervision_stretch_at(uuid, uuid, timestamptz, timestamptz)',
  'public.staff_on_leave_on(uuid, date)',
  'public.supervision_explains(uuid, uuid, date, time, timestamptz)',
  'public.supervision_label(uuid, text, timestamptz)',
  'public.notify_evening_summary(timestamptz)'
]) as p;
select pg_temp.ok(has_function_privilege('authenticated', p, 'execute') and not has_function_privilege('anon', p, 'execute'),
  'owners only, never logged out: ' || p)
from unnest(array['public.my_repair_push_prefs()', 'public.set_my_repair_push_prefs(boolean, boolean)']) as p;
select pg_temp.ok((select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
                     from pg_proc p
                    where p.oid in ('public.my_repair_push_prefs()'::regprocedure,
                                    'public.set_my_repair_push_prefs(boolean, boolean)'::regprocedure,
                                    'public.queue_repair_visit_push(uuid, text, text, text, text, text, text, text, uuid)'::regprocedure,
                                    'public.notify_repair_visit()'::regprocedure)),
  'the definer functions run with an empty search_path');

-- ---- The evening summary ------------------------------------------------------------------------
-- Only the stretches set here count (the walk-ins above opened some at the
-- real clock's time).
delete from public.repair_supervision;
truncate pushes;
-- A finished walk-in for "AC menetes", supervised by Ari 10:00-13:30.
set local session_replication_role = replica;
insert into public.repair_visits (id, household_id, repair_id, logged_by_staff, arrived_at, before_photo_url, left_at, after_photo_url)
values ('00000000-0000-0000-0000-00000152e0a1', :f1, :d4, :ari, pg_temp.at(10), pg_temp.photo(:f1, 'r4/b.webp'),
        pg_temp.at(13, 30), pg_temp.photo(:f1, 'r4/a.webp')),
       ('00000000-0000-0000-0000-00000152e0a2', :f1, :d5, :syam, pg_temp.at(11), pg_temp.photo(:f1, 'r5/b.webp'),
        pg_temp.at(12), pg_temp.photo(:f1, 'r5/a.webp'));
insert into public.repair_supervision (id, household_id, visit_id, staff_id, started_at, ended_at) values
  ('00000000-0000-0000-0000-00000152ab01', :f1, '00000000-0000-0000-0000-00000152e0a1', :ari, pg_temp.at(10), pg_temp.at(13, 30));
set local session_replication_role = origin;

-- Chores today in f1 (all one-offs): for Ari, Lap kaca 09:50 (inside the
-- 15-minute lead), Sapu dapur 09:40 (before it), Pel teras 11:00, Setrika
-- baju 12:30, Siram tanaman 15:00 (after), Buang sampah 11:00 (done); for
-- anyone, Cuci mobil 11:30. A routine: Mocha's Dinner at 11:00, no person.
insert into public.household_tasks (id, household_id, title, category, recurrence, due_date, due_time, status, assigned_to,
                                    before_photo_url, after_photo_url)
select id::uuid, :f1, title, 'cleaning', 'none', pg_temp.today(), tm, st, who::uuid,
       case when st = 'completed' then 'x/b.jpg' end, case when st = 'completed' then 'x/a.jpg' end
from (values
  ('00000000-0000-0000-0000-00000152dd01', 'Pel teras', '11:00', 'pending', '00000000-0000-0000-0000-0000000152c1'),
  ('00000000-0000-0000-0000-00000152dd02', 'Setrika baju', '12:30', 'pending', '00000000-0000-0000-0000-0000000152c1'),
  ('00000000-0000-0000-0000-00000152dd03', 'Siram tanaman', '15:00', 'pending', '00000000-0000-0000-0000-0000000152c1'),
  ('00000000-0000-0000-0000-00000152dd04', 'Cuci mobil', '11:30', 'pending', null),
  ('00000000-0000-0000-0000-00000152dd05', 'Buang sampah', '11:00', 'completed', '00000000-0000-0000-0000-0000000152c1'),
  ('00000000-0000-0000-0000-00000152dd06', 'Lap kaca', '09:50', 'pending', '00000000-0000-0000-0000-0000000152c1'),
  ('00000000-0000-0000-0000-00000152dd07', 'Sapu dapur', '09:40', 'pending', '00000000-0000-0000-0000-0000000152c1')
) as t(id, title, tm, st, who);
insert into public.task_entities (id, household_id, entity_type, name, status) values
  ('00000000-0000-0000-0000-00000152ee01', :f1, 'pet', 'Mocha', 'home');
insert into public.master_schedules (id, entity_id, title, module, frequency_type, fixed_times, is_active, created_at) values
  ('00000000-0000-0000-0000-00000152cc01', '00000000-0000-0000-0000-00000152ee01', 'Dinner', 'pet', 'fixed_time',
   array['11:00'::time], true, now() - interval '7 days');

create temp table runs (n int);
create function pg_temp.body(uid uuid) returns text language sql as $$
  select body from pg_temp.pushes where user_id = uid $$;
-- "Not done: <plain>; <group>; <group>." split into its parts.
create function pg_temp.part(uid uuid, k int) returns text language sql as $$
  select split_part(split_part(pg_temp.body(uid), case when uid = '00000000-0000-0000-0000-0000000152a2' then 'Belum: ' else 'Not done: ' end, 2), '; ', k) $$;

insert into runs select public.notify_evening_summary(pg_temp.at(19));
select pg_temp.ok((select n = 2 from runs), '19.00: a1 and a2 get the summary (a3 turned it off)');
select pg_temp.ok(pg_temp.part(:a1, 1) = 'Sapu dapur, Mocha: Dinner 11:00 AM, Cuci mobil and 1 more',
  '... plain first: before the lead, a routine and an anyone chore while Syam was free, and 15:00');
select pg_temp.ok(pg_temp.part(:a1, 2) = 'Lap kaca, Pel teras and Setrika baju (Ari was supervising a repair: AC menetes, 10:00 AM–1:30 PM).',
  '... then Ari''s tasks inside her stretch, the stretch once in brackets');
select pg_temp.ok(pg_temp.part(:a2, 2) = 'Lap kaca, Pel teras, dan Setrika baju (Ari mengawasi perbaikan: AC menetes, 10.00–13.30).',
  '... in Indonesian for a2');
select pg_temp.ok(pg_temp.body(:a1) not like '%Buang sampah%', '... a done chore isn''t in it');

-- Syam supervised too, 11:00-12:00: the anyone chore and the routine at
-- 11:00 (inside his 15-minute lead) now explain themselves.
set local session_replication_role = replica;
insert into public.repair_supervision (id, household_id, visit_id, staff_id, started_at, ended_at)
values ('00000000-0000-0000-0000-00000152ab02', :f1, '00000000-0000-0000-0000-00000152e0a2', :syam, pg_temp.at(11), pg_temp.at(12));
set local session_replication_role = origin;
truncate pushes; truncate runs;
insert into runs select public.notify_evening_summary(pg_temp.at(19));
select pg_temp.ok(pg_temp.part(:a1, 1) = 'Sapu dapur and Siram tanaman'
                  and pg_temp.part(:a1, 2) = 'Lap kaca, Mocha: Dinner 11:00 AM, Pel teras and 2 more (Ari was supervising a repair: AC menetes, 10:00 AM–1:30 PM).',
  'everyone on duty supervising: the anyone chore and the routine join the stretch');

-- Syam on leave instead: Ari alone was on duty.
delete from public.repair_supervision where id = '00000000-0000-0000-0000-00000152ab02';
insert into public.leave_requests (household_id, staff_id, start_date, end_date, status, fallback_action, decided_by, decided_at)
values (:f1, :syam, pg_temp.today(), pg_temp.today(), 'approved', 'unassign', :a1, now());
truncate pushes; truncate runs;
insert into runs select public.notify_evening_summary(pg_temp.at(19));
select pg_temp.ok(pg_temp.part(:a1, 1) = 'Sapu dapur and Siram tanaman'
                  and pg_temp.part(:a1, 2) like 'Lap kaca, Mocha: Dinner 11:00 AM, Pel teras and 2 more (Ari was%',
  'Syam on leave: Ari was everyone on duty, so the same');
delete from public.leave_requests where staff_id = :syam;

-- The routine is Syam's (144), who wasn't supervising: plain again; Ari's: explained.
update public.master_schedules set staff_id = :syam where id = '00000000-0000-0000-0000-00000152cc01';
truncate pushes; truncate runs;
insert into runs select public.notify_evening_summary(pg_temp.at(19));
select pg_temp.ok(pg_temp.part(:a1, 1) like 'Sapu dapur, Mocha: Dinner 11:00 AM, %',
  'a routine for Syam, who was free: not explained');
update public.master_schedules set staff_id = :ari where id = '00000000-0000-0000-0000-00000152cc01';
truncate pushes; truncate runs;
insert into runs select public.notify_evening_summary(pg_temp.at(19));
select pg_temp.ok(pg_temp.part(:a1, 2) like 'Lap kaca, Mocha: Dinner 11:00 AM, Pel teras and 1 more (Ari was%',
  'a routine for Ari, who was supervising: explained');

-- Still going on: Ari supervising again since 17:00, Masak at 18:00.
insert into public.household_tasks (id, household_id, title, category, recurrence, due_date, due_time, status, assigned_to)
values ('00000000-0000-0000-0000-00000152dd08', :f1, 'Masak', 'cooking', 'none', pg_temp.today(), '18:00', 'pending', :ari);
set local session_replication_role = replica;
insert into public.repair_visits (id, household_id, repair_id, logged_by_staff, arrived_at, before_photo_url)
values ('00000000-0000-0000-0000-00000152e0a3', :f1, :d1, :ari, pg_temp.at(17), pg_temp.photo(:f1, 'r1/b3.webp'));
insert into public.repair_supervision (id, household_id, visit_id, staff_id, started_at, ended_at) values
  ('00000000-0000-0000-0000-00000152ab03', :f1, '00000000-0000-0000-0000-00000152e0a3', :ari, pg_temp.at(17), null);
set local session_replication_role = origin;
truncate pushes; truncate runs;
insert into runs select public.notify_evening_summary(pg_temp.at(19));
select pg_temp.ok(pg_temp.part(:a1, 3) = 'Masak (Ari is supervising a repair: Keran bocor, since 5:00 PM).'
                  and pg_temp.part(:a2, 3) = 'Masak (Ari mengawasi perbaikan: Keran bocor, sejak 17.00).',
  'an open stretch: "since 5:00 PM" / "sejak 17.00", its own group after the first');

-- Repairs off: nothing is explained.
insert into public.household_features (household_id, feature, enabled) values (:f1, 'repairs', false);
truncate pushes; truncate runs;
insert into runs select public.notify_evening_summary(pg_temp.at(19));
select pg_temp.ok(pg_temp.body(:a1) not like '%supervising%' and pg_temp.body(:a1) not like '%;%'
                  and pg_temp.body(:a2) not like '%mengawasi%',
  'with Repairs off, every missed task reads plainly "not done"');
delete from public.household_features where household_id = :f1 and feature = 'repairs';

-- The twin's edges, directly.
select pg_temp.ok(public.supervision_explains(:f1, :ari, pg_temp.today(), '09:45', pg_temp.at(19)) = '00000000-0000-0000-0000-00000152ab01'
                  and public.supervision_explains(:f1, :ari, pg_temp.today(), '09:44', pg_temp.at(19)) is null
                  and public.supervision_explains(:f1, :ari, pg_temp.today(), '13:30', pg_temp.at(19)) = '00000000-0000-0000-0000-00000152ab01'
                  and public.supervision_explains(:f1, :ari, pg_temp.today(), '13:31', pg_temp.at(19)) is null,
  'the stretch counts from 15 minutes before it started until it ended');
select pg_temp.ok(public.supervision_explains(:f1, :ari, pg_temp.today(), '18:30', pg_temp.at(18)) is null
                  and public.supervision_explains(:f1, :ari, pg_temp.today(), null, pg_temp.at(19)) is null,
  'a task not yet due, or with no time, is never explained');
select pg_temp.ok(public.supervision_explains(:f2, null, pg_temp.today(), '11:00', pg_temp.at(19)) is null,
  'another household''s stretches explain nothing');

rollback;
