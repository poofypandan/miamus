-- Migration 144 checks: any routine, for any pets (Phase 173 PR A).
-- Only admins write routines (a staff phone reads them and still logs);
-- the new columns' rules; the person on a routine (same household, not
-- archived, released on archive); received_at set by the database, never the
-- phone; routine_slots_open's weekdays and three-photo rule (a walk set to 1
-- photo done on its one log, an Other set to 3 photos needs the end photo);
-- north_star_day's weekdays; staff_workload counts a walk once; the export;
-- the grants.
-- LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/144_any_routine_any_pets.sql
\set ON_ERROR_STOP on
\pset footer off
begin;

create function pg_temp.ok(cond boolean, label text) returns text language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  return 'ok  ' || label;
end $$;
-- Runs a statement as a session (null: anon); returns the error, or ''.
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
-- Runs a query as a session and returns its one value as jsonb.
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

-- A Monday and the Sunday before it, both in the past, as Jakarta dates.
create temp table d as
  select (now() at time zone 'Asia/Jakarta')::date as today,
         ((now() at time zone 'Asia/Jakarta')::date - 14
           - (extract(isodow from (now() at time zone 'Asia/Jakarta')::date)::int - 1)) as monday;
create function pg_temp.monday() returns date language sql as $$ select monday from pg_temp.d $$;
create function pg_temp.at(day date, h int, m int default 0) returns timestamptz language sql as $$
  select (day + make_time(h, m, 0)) at time zone 'Asia/Jakarta' $$;

-- ---- Households ----------------------------------------------------------------------
-- f1: admin a1; staff phone p1; Sari s1, Yanti s2, Budi s3 (archived);
--     Mocha m1 and Matcha m2.
-- f2: admin a9; Rina s9; Coco m9.
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, anon, now(), now()
from (values
  ('00000000-0000-0000-0000-0000000144a1', 'one144@test.local', false),
  ('00000000-0000-0000-0000-0000000144a9', 'nine144@test.local', false),
  ('00000000-0000-0000-0000-0000000144b1', null, true)
) as u(id, email, anon);
insert into public.households (id, name, owner_auth_id, created_at) values
  ('00000000-0000-0000-0000-0000000144f1', 'Rumah Melati', '00000000-0000-0000-0000-0000000144a1', pg_temp.at(pg_temp.monday() - 30, 8)),
  ('00000000-0000-0000-0000-0000000144f2', 'Rumah Kenanga', '00000000-0000-0000-0000-0000000144a9', pg_temp.at(pg_temp.monday() - 30, 8));
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000144f1', '00000000-0000-0000-0000-0000000144a1', 'owner'),
  ('00000000-0000-0000-0000-0000000144f2', '00000000-0000-0000-0000-0000000144a9', 'owner');
insert into public.device_sessions (user_id, household_id) values
  ('00000000-0000-0000-0000-0000000144b1', '00000000-0000-0000-0000-0000000144f1');
insert into public.staff_profiles (id, household_id, name, archived_at) values
  ('00000000-0000-0000-0000-0000000144c1', '00000000-0000-0000-0000-0000000144f1', 'Sari', null),
  ('00000000-0000-0000-0000-0000000144c2', '00000000-0000-0000-0000-0000000144f1', 'Yanti', null),
  ('00000000-0000-0000-0000-0000000144c3', '00000000-0000-0000-0000-0000000144f1', 'Budi', now()),
  ('00000000-0000-0000-0000-0000000144c9', '00000000-0000-0000-0000-0000000144f2', 'Rina', null);
insert into public.task_entities (id, household_id, entity_type, name) values
  ('00000000-0000-0000-0000-0000000144d1', '00000000-0000-0000-0000-0000000144f1', 'pet', 'Mocha'),
  ('00000000-0000-0000-0000-0000000144d2', '00000000-0000-0000-0000-0000000144f1', 'pet', 'Matcha'),
  ('00000000-0000-0000-0000-0000000144d9', '00000000-0000-0000-0000-0000000144f2', 'pet', 'Coco');

\set a1 '''00000000-0000-0000-0000-0000000144a1'''
\set a9 '''00000000-0000-0000-0000-0000000144a9'''
\set p1 '''00000000-0000-0000-0000-0000000144b1'''
\set f1 '''00000000-0000-0000-0000-0000000144f1'''
\set sari '''00000000-0000-0000-0000-0000000144c1'''
\set yanti '''00000000-0000-0000-0000-0000000144c2'''
\set budi '''00000000-0000-0000-0000-0000000144c3'''
\set rina '''00000000-0000-0000-0000-0000000144c9'''
\set mocha '''00000000-0000-0000-0000-0000000144d1'''
\set matcha '''00000000-0000-0000-0000-0000000144d2'''
\set coco '''00000000-0000-0000-0000-0000000144d9'''
\set group1 '''00000000-0000-0000-0000-0000000144e1'''

-- ---- Columns and their defaults ------------------------------------------------------
select pg_temp.ok((select count(*) = 0 from public.master_schedules where proof is distinct from 'photo'),
  'every existing routine stays photo');
select pg_temp.ok((select column_default is not null from information_schema.columns
                    where table_schema = 'public' and table_name = 'task_logs' and column_name = 'received_at'),
  'received_at defaults to the server time');

-- ---- The owner makes both examples ---------------------------------------------------
-- Lights off at 21:30 for Mocha and Matcha (one group), a walk for Matcha.
select pg_temp.ok(pg_temp.err_as(:a1, format($q$
  insert into public.master_schedules (id, entity_id, title, module, frequency_type, fixed_times, kind,
                                       routine_group_id, note, proof, created_at)
  values ('00000000-0000-0000-0000-000000014401', %1$L, 'Matikan lampu', 'pet', 'fixed_time', '{21:30}', 'lights', %3$L,
          'Lampu ruang tamu', 'photo', %4$L),
         ('00000000-0000-0000-0000-000000014402', %2$L, 'Matikan lampu', 'pet', 'fixed_time', '{21:30}', 'lights', %3$L,
          'Lampu ruang tamu', 'photo', %4$L)
$q$, :mocha, :matcha, :group1, pg_temp.at(pg_temp.monday() - 7, 8))) = '',
  'an admin adds lights off for two pets in one group');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$
  insert into public.master_schedules (id, entity_id, title, module, frequency_type, fixed_times, kind,
                                       routine_group_id, proof, staff_id, created_at)
  values ('00000000-0000-0000-0000-000000014403', %L, 'Jalan-jalan', 'pet', 'fixed_time', '{07:00}', 'walk',
          gen_random_uuid(), 'three', %L, %L)
$q$, :matcha, :yanti, pg_temp.at(pg_temp.monday() - 7, 8))) = '',
  'and a three-photo walk for Matcha, for Yanti');

-- ---- Only admins write routines (D13) ------------------------------------------------
select pg_temp.ok(pg_temp.json_as(:p1, $q$ select to_jsonb(count(*)) from public.master_schedules
                                           where title in ('Matikan lampu', 'Jalan-jalan') $q$) = '3'::jsonb,
  'a staff phone still reads the routines');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$
  insert into public.master_schedules (entity_id, title, module, frequency_type, fixed_times)
  values (%L, 'Makan', 'pet', 'fixed_time', '{08:00}') $q$, :mocha)) like '%row-level security%',
  'a staff phone can''t add a routine');
select pg_temp.err_as(:p1, $q$ update public.master_schedules set title = 'Diubah'
                               where id = '00000000-0000-0000-0000-000000014401' $q$);
select pg_temp.ok((select title = 'Matikan lampu' from public.master_schedules
                    where id = '00000000-0000-0000-0000-000000014401'),
  'a staff phone can''t change one');
select pg_temp.err_as(:p1, $q$ delete from public.master_schedules
                               where id = '00000000-0000-0000-0000-000000014401' $q$);
select pg_temp.ok((select count(*) = 1 from public.master_schedules
                    where id = '00000000-0000-0000-0000-000000014401'),
  'a staff phone can''t delete one');
select pg_temp.ok(pg_temp.err_as(:a9, format($q$
  insert into public.master_schedules (entity_id, title, module, frequency_type, fixed_times)
  values (%L, 'Makan', 'pet', 'fixed_time', '{08:00}') $q$, :mocha)) like '%row-level security%',
  'another household''s admin can''t add one to Mocha');
-- (A write and its check are separate statements: one statement reads one snapshot.)
select pg_temp.ok(pg_temp.err_as(:a1, $q$ update public.master_schedules set note = 'Pakai tali'
                                          where id = '00000000-0000-0000-0000-000000014403' $q$) = '',
  'the admin changes a routine');
select pg_temp.ok((select note = 'Pakai tali' from public.master_schedules
                    where id = '00000000-0000-0000-0000-000000014403'), '... and it is changed');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$
  insert into public.master_schedules (id, entity_id, title, module, frequency_type, fixed_times)
  values ('00000000-0000-0000-0000-0000000144ff', %L, 'Sementara', 'pet', 'fixed_time', '{08:00}') $q$, :mocha)) = '',
  'the admin adds another');
select pg_temp.ok(pg_temp.err_as(:a1, $q$ delete from public.master_schedules
                                          where id = '00000000-0000-0000-0000-0000000144ff' $q$) = '',
  'and removes it');
select pg_temp.ok(not exists (select 1 from public.master_schedules where id = '00000000-0000-0000-0000-0000000144ff'),
  '... and it is gone');

-- ---- The new columns' rules ----------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ insert into public.master_schedules
  (entity_id, title, module, frequency_type, fixed_times, kind) values (%L, 'x', 'pet', 'fixed_time', '{08:00}', 'bath') $q$,
  :mocha)) like '%master_schedules_kind_check%', 'an unknown kind is refused');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ insert into public.master_schedules
  (entity_id, title, module, frequency_type, fixed_times, days_of_week) values (%L, 'x', 'pet', 'fixed_time', '{08:00}', '{0,1}') $q$,
  :mocha)) like '%days_of_week_check%', 'a weekday outside 1-7 is refused');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ insert into public.master_schedules
  (entity_id, title, module, frequency_type, fixed_times, days_of_week) values (%L, 'x', 'pet', 'fixed_time', '{08:00}', '{}') $q$,
  :mocha)) like '%days_of_week_check%', 'no weekdays at all is refused (null means every day)');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ insert into public.master_schedules
  (entity_id, title, module, frequency_type, fixed_times, note) values (%L, 'x', 'pet', 'fixed_time', '{08:00}', repeat('a', 121)) $q$,
  :mocha)) like '%note_check%', 'a note over 120 characters is refused');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ insert into public.master_schedules
  (entity_id, title, module, frequency_type, fixed_times, proof) values (%L, 'x', 'pet', 'fixed_time', '{08:00}', 'gps') $q$,
  :mocha)) like '%proof_check%', 'an unknown proof is refused');

-- ---- The person on a routine ---------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:a1, $q$ update public.master_schedules set staff_id = '00000000-0000-0000-0000-0000000144c9'
                                          where id = '00000000-0000-0000-0000-000000014401' $q$) like '%routine_staff%',
  'another household''s person is refused');
select pg_temp.ok(pg_temp.err_as(:a1, $q$ update public.master_schedules set staff_id = '00000000-0000-0000-0000-0000000144c3'
                                          where id = '00000000-0000-0000-0000-000000014401' $q$) like '%routine_staff%',
  'an archived person is refused');
select pg_temp.ok(pg_temp.err_as(:a1, $q$ update public.master_schedules set staff_id = '00000000-0000-0000-0000-0000000144c1'
                                          where id = '00000000-0000-0000-0000-000000014401' $q$) = '',
  'a person on the roster is fine');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.archive_staff_profile(%L) $q$, :sari)) = '',
  'the admin archives Sari');
select pg_temp.ok((select staff_id is null from public.master_schedules where id = '00000000-0000-0000-0000-000000014401')
                  and (select staff_id = :yanti::uuid from public.master_schedules where id = '00000000-0000-0000-0000-000000014403'),
  'archiving Sari gives her routine back to anyone, and leaves Yanti''s');

-- ---- received_at is the server's ------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:p1, format($q$
  insert into public.task_logs (id, schedule_id, entity_id, module, completed_at, received_at, sub_type)
  values ('00000000-0000-0000-0000-0000001440a1', '00000000-0000-0000-0000-000000014401', %L, 'pet', now(),
          '2000-01-01T00:00:00Z', 'complete') $q$, :mocha)) = '',
  'a staff phone still logs a routine');
select pg_temp.ok((select received_at > now() - interval '1 minute' from public.task_logs
                    where id = '00000000-0000-0000-0000-0000001440a1'),
  '... and the time it claimed for received_at is replaced by the server''s');
select pg_temp.err_as(:p1, $q$ update public.task_logs set received_at = '2000-01-01T00:00:00Z'
                               where id = '00000000-0000-0000-0000-0000001440a1' $q$);
select pg_temp.ok((select received_at > now() - interval '1 minute' from public.task_logs
                    where id = '00000000-0000-0000-0000-0000001440a1'),
  'and it can''t be changed afterwards');
delete from public.task_logs where id = '00000000-0000-0000-0000-0000001440a1';

-- ---- Open slots: weekdays and three-photo routines -----------------------------------
-- Brush teeth on Mondays and Wednesdays; a walk set to 1 photo; an Other set
-- to 3 photos. All for Mocha, from a week before the test Monday.
insert into public.master_schedules (id, entity_id, title, module, frequency_type, fixed_times, kind, proof,
                                     days_of_week, created_at) values
  ('00000000-0000-0000-0000-000000014404', :mocha, 'Sikat gigi', 'pet', 'fixed_time', '{19:00}', 'teeth', 'photo',
   '{1,3}', pg_temp.at(pg_temp.monday() - 7, 8)),
  ('00000000-0000-0000-0000-000000014405', :mocha, 'Jalan sore', 'pet', 'fixed_time', '{16:30}', 'walk', 'photo',
   null, pg_temp.at(pg_temp.monday() - 7, 8)),
  ('00000000-0000-0000-0000-000000014406', :mocha, 'Ke toko hewan', 'pet', 'fixed_time', '{10:00}', 'other', 'three',
   null, pg_temp.at(pg_temp.monday() - 7, 8)),
  -- An old vet row and an Other titled like one: only the old row waits for check-out.
  ('00000000-0000-0000-0000-000000014407', :mocha, 'Vet: Kontrol', 'pet', 'fixed_time', '{11:00}', null, 'photo',
   null, pg_temp.at(pg_temp.monday() - 7, 8)),
  ('00000000-0000-0000-0000-000000014408', :mocha, 'Vet: beli makanan', 'pet', 'fixed_time', '{12:00}', 'other', 'photo',
   null, pg_temp.at(pg_temp.monday() - 7, 8));

create function pg_temp.open_on(day date, sid text) returns boolean language sql as $$
  select exists (select 1 from public.routine_slots_open(day) where schedule_id = sid::uuid) $$;

select pg_temp.ok(pg_temp.open_on(pg_temp.monday(), '00000000-0000-0000-0000-000000014404'),
  'brushing teeth on Monday is due (and open)');
select pg_temp.ok(not pg_temp.open_on(pg_temp.monday() - 1, '00000000-0000-0000-0000-000000014404'),
  '... and not on Sunday');

-- Matcha's three-photo walk on Monday: start and arrived leave it open.
insert into public.task_logs (schedule_id, entity_id, module, completed_at, sub_type, staff_id) values
  ('00000000-0000-0000-0000-000000014403', :matcha, 'pet', pg_temp.at(pg_temp.monday(), 7, 2), 'check_in', :yanti),
  ('00000000-0000-0000-0000-000000014403', :matcha, 'pet', pg_temp.at(pg_temp.monday(), 7, 15), 'arrived', :yanti);
select pg_temp.ok(pg_temp.open_on(pg_temp.monday(), '00000000-0000-0000-0000-000000014403'),
  'a three-photo walk with start and arrived photos is still open');
insert into public.task_logs (schedule_id, entity_id, module, completed_at, sub_type, staff_id) values
  ('00000000-0000-0000-0000-000000014403', :matcha, 'pet', pg_temp.at(pg_temp.monday(), 7, 34), 'check_out', :yanti);
select pg_temp.ok(not pg_temp.open_on(pg_temp.monday(), '00000000-0000-0000-0000-000000014403'),
  '... and done at its end photo');

insert into public.task_logs (schedule_id, entity_id, module, completed_at, sub_type) values
  ('00000000-0000-0000-0000-000000014405', :mocha, 'pet', pg_temp.at(pg_temp.monday(), 16, 40), 'complete');
select pg_temp.ok(not pg_temp.open_on(pg_temp.monday(), '00000000-0000-0000-0000-000000014405'),
  'a walk set to 1 photo is done on its one log');

insert into public.task_logs (schedule_id, entity_id, module, completed_at, sub_type) values
  ('00000000-0000-0000-0000-000000014406', :mocha, 'pet', pg_temp.at(pg_temp.monday(), 10, 0), 'check_in'),
  ('00000000-0000-0000-0000-000000014406', :mocha, 'pet', pg_temp.at(pg_temp.monday(), 10, 20), 'arrived');
select pg_temp.ok(pg_temp.open_on(pg_temp.monday(), '00000000-0000-0000-0000-000000014406'),
  'an Other set to 3 photos isn''t done at two');
insert into public.task_logs (schedule_id, entity_id, module, completed_at, sub_type) values
  ('00000000-0000-0000-0000-000000014406', :mocha, 'pet', pg_temp.at(pg_temp.monday(), 10, 45), 'check_out');
select pg_temp.ok(not pg_temp.open_on(pg_temp.monday(), '00000000-0000-0000-0000-000000014406'),
  '... and is at the third');

insert into public.task_logs (schedule_id, entity_id, module, completed_at, sub_type) values
  ('00000000-0000-0000-0000-000000014407', :mocha, 'pet', pg_temp.at(pg_temp.monday(), 11, 0), 'complete'),
  ('00000000-0000-0000-0000-000000014408', :mocha, 'pet', pg_temp.at(pg_temp.monday(), 12, 0), 'complete');
select pg_temp.ok(pg_temp.open_on(pg_temp.monday(), '00000000-0000-0000-0000-000000014407')
                  and not pg_temp.open_on(pg_temp.monday(), '00000000-0000-0000-0000-000000014408'),
  'the vet rule still holds for old rows, and not for a new routine titled "Vet: "');

-- ---- North star: due only on the routine's weekdays ----------------------------------
create function pg_temp.due_on(day date) returns int language sql as $$
  select coalesce((select due from public.north_star_day(day) where household_id = '00000000-0000-0000-0000-0000000144f1'), 0) $$;
select pg_temp.ok(pg_temp.due_on(pg_temp.monday()) = pg_temp.due_on(pg_temp.monday() - 1) + 1,
  'brushing teeth adds one slot due on Monday and none on Sunday');

-- ---- Staff workload: a three-photo walk counts once ----------------------------------
select pg_temp.ok((pg_temp.json_as(:a1, format($q$
  select to_jsonb(pets_completed) from public.staff_workload(%L, %L, %L) where staff_id = %L $q$,
  :f1, pg_temp.at(pg_temp.monday(), 0), pg_temp.at(pg_temp.monday() + 1, 0), :yanti)))::int = 1,
  'Yanti''s three photos count as one walk');

-- ---- The export ------------------------------------------------------------------------
select pg_temp.ok((select bool_and(l ? 'received_at') and count(*) > 0
                     from jsonb_array_elements(pg_temp.json_as(:a1, 'select public.export_household_data()') -> 'logs') as l),
  'each exported log carries received_at');
select pg_temp.ok((select bool_or(r ->> 'kind' = 'walk' and r ->> 'proof' = 'three')
                     from jsonb_array_elements(pg_temp.json_as(:a1, 'select public.export_household_data()') -> 'routines') as r),
  'exported routines carry kind and proof');

-- ---- Grants ----------------------------------------------------------------------------
select pg_temp.ok(not has_function_privilege('authenticated', 'public.stamp_task_log_received_at()', 'execute')
                  and not has_function_privilege('anon', 'public.stamp_task_log_received_at()', 'execute')
                  and not has_function_privilege('authenticated', 'public.check_master_schedule_staff()', 'execute')
                  and not has_function_privilege('anon', 'public.check_master_schedule_staff()', 'execute'),
  'nobody calls the trigger functions directly');
select pg_temp.ok(not has_function_privilege('anon', 'public.archive_staff_profile(uuid)', 'execute')
                  and has_function_privilege('authenticated', 'public.archive_staff_profile(uuid)', 'execute')
                  and not has_function_privilege('anon', 'public.export_household_data()', 'execute')
                  and has_function_privilege('authenticated', 'public.staff_workload(uuid, timestamptz, timestamptz)', 'execute')
                  and not has_function_privilege('authenticated', 'public.routine_slots_open(date)', 'execute'),
  'the re-created functions keep their grants');
select pg_temp.ok((select count(*) = 3 from pg_policies where tablename = 'master_schedules' and policyname like 'admin_%')
                  and (select count(*) = 0 from pg_policies where tablename = 'master_schedules'
                        and policyname in ('tenant_insert_master_schedules', 'tenant_update_master_schedules', 'tenant_delete_master_schedules')),
  'the three write policies are the admin ones');

rollback;
