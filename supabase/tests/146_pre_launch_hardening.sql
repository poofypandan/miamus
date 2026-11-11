-- Migration 146 checks: the pre-launch audit's H1, L1, M1, M2, M6 and M7.
-- A staff phone signs in the real way (an anonymous session, the house code
-- and a PIN through sign_in_with_house_code), then every staff flow that
-- writes still works and every owner-only write is refused, one by one.
-- LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/146_pre_launch_hardening.sql
-- (or, before 146 is applied: begin; \i the migration; \i this file.)
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
-- Runs a write as a session; returns the rows it touched (-1 on an error).
create function pg_temp.n_as(uid uuid, stmt text) returns integer language plpgsql as $$
declare n integer;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute stmt;
    get diagnostics n = row_count;
  exception when others then
    n := -1;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return n;
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

-- ---- Households ----------------------------------------------------------------------
-- f1: admin a1, co-admin a2; staff Sari (PIN 1234), Budi (PIN 5678); Mocha.
--     Phones: p1 (Sari's), p2 (Budi's), p3 and p4 (a laptop's fresh sessions).
-- f2: admin a9 (for M2: an account already in a household).
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, anon, now(), now()
from (values
  ('00000000-0000-0000-0000-0000000146a1', 'one146@test.local', false),
  ('00000000-0000-0000-0000-0000000146a2', 'two146@test.local', false),
  ('00000000-0000-0000-0000-0000000146a9', 'nine146@test.local', false),
  ('00000000-0000-0000-0000-0000000146b1', null, true),
  ('00000000-0000-0000-0000-0000000146b2', null, true),
  ('00000000-0000-0000-0000-0000000146b3', null, true),
  ('00000000-0000-0000-0000-0000000146b4', null, true),
  ('00000000-0000-0000-0000-0000000146b5', null, true)
) as u(id, email, anon);
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000146f1', 'Rumah Melati', '00000000-0000-0000-0000-0000000146a1'),
  ('00000000-0000-0000-0000-0000000146f2', 'Rumah Kenanga', '00000000-0000-0000-0000-0000000146a9');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000146f1', '00000000-0000-0000-0000-0000000146a1', 'owner'),
  ('00000000-0000-0000-0000-0000000146f1', '00000000-0000-0000-0000-0000000146a2', 'owner'),
  ('00000000-0000-0000-0000-0000000146f2', '00000000-0000-0000-0000-0000000146a9', 'owner');
insert into public.staff_profiles (id, household_id, name, pin, has_pin) values
  ('00000000-0000-0000-0000-0000000146c1', '00000000-0000-0000-0000-0000000146f1', 'Sari',
   extensions.crypt('1234', extensions.gen_salt('bf')), true),
  ('00000000-0000-0000-0000-0000000146c2', '00000000-0000-0000-0000-0000000146f1', 'Budi',
   extensions.crypt('5678', extensions.gen_salt('bf')), true);
insert into public.task_entities (id, household_id, entity_type, name) values
  ('00000000-0000-0000-0000-0000000146d1', '00000000-0000-0000-0000-0000000146f1', 'pet', 'Mocha');
insert into public.master_schedules (id, entity_id, title, module, frequency_type, fixed_times, kind, proof) values
  ('00000000-0000-0000-0000-000000014601', '00000000-0000-0000-0000-0000000146d1', 'Makan', 'pet', 'fixed_time', '{08:00}', null, 'photo'),
  ('00000000-0000-0000-0000-000000014602', '00000000-0000-0000-0000-0000000146d1', 'Jalan-jalan', 'pet', 'fixed_time', '{07:00}', 'walk', 'three');
create temp table code as
  select c.code from public.household_join_codes c where c.household_id = '00000000-0000-0000-0000-0000000146f1';
grant select on pg_temp.code to authenticated;

\set a1 '''00000000-0000-0000-0000-0000000146a1'''
\set a2 '''00000000-0000-0000-0000-0000000146a2'''
\set a9 '''00000000-0000-0000-0000-0000000146a9'''
\set p1 '''00000000-0000-0000-0000-0000000146b1'''
\set p2 '''00000000-0000-0000-0000-0000000146b2'''
\set p3 '''00000000-0000-0000-0000-0000000146b3'''
\set p4 '''00000000-0000-0000-0000-0000000146b4'''
\set p5 '''00000000-0000-0000-0000-0000000146b5'''
\set f1 '''00000000-0000-0000-0000-0000000146f1'''
\set f2 '''00000000-0000-0000-0000-0000000146f2'''
\set sari '''00000000-0000-0000-0000-0000000146c1'''
\set budi '''00000000-0000-0000-0000-0000000146c2'''
\set mocha '''00000000-0000-0000-0000-0000000146d1'''
\set feed '''00000000-0000-0000-0000-000000014601'''
\set walk '''00000000-0000-0000-0000-000000014602'''

-- ---- A real staff sign-in: house code, name, PIN -------------------------------------
select pg_temp.ok(pg_temp.json_as(:p1, format($q$ select public.sign_in_with_house_code(
  (select code from pg_temp.code), %L, '1234') $q$, :sari))->>'status' = 'ok',
  'Sari''s phone signs in with the house code and her PIN');
select pg_temp.ok(pg_temp.json_as(:p2, format($q$ select public.sign_in_with_house_code(
  (select code from pg_temp.code), %L, '5678') $q$, :budi))->>'status' = 'ok',
  'Budi''s phone signs in with the house code and his PIN');
select pg_temp.ok((select staff_id from public.device_sessions where user_id = :p1) = :sari::uuid
                  and (select staff_id from public.device_sessions where user_id = :p2) = :budi::uuid,
  'each link records whose PIN opened the phone');
select pg_temp.ok(pg_temp.json_as(:p1, $q$ select to_jsonb(public.check_staff_pin(
  '00000000-0000-0000-0000-0000000146c1', '1234')) $q$)->>'status' = 'ok',
  'the PIN gate on a linked phone still answers ok');

-- ---- H1: pets (task_entities) --------------------------------------------------------
select pg_temp.ok(pg_temp.n_as(:p1, format($q$ update public.task_entities set status = 'admitted' where id = %L $q$, :mocha)) = 1,
  'staff: a vet admission still sets the pet to admitted');
select pg_temp.ok(pg_temp.n_as(:p1, format($q$ update public.task_entities set status = 'home' where id = %L $q$, :mocha)) = 1,
  'staff: the discharge still brings the pet home');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.task_entities set name = 'Diganti' where id = %L $q$, :mocha))
                  like '%pet_owner_only%',
  'NEG staff: renaming a pet is refused');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.task_entities set metadata = '{"x":1}' where id = %L $q$, :mocha))
                  like '%pet_owner_only%',
  'NEG staff: changing a pet''s details is refused');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.task_entities set status = 'deceased' where id = %L $q$, :mocha))
                  like '%pet_owner_only%',
  'NEG staff: any other status is refused');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ insert into public.task_entities (household_id, entity_type, name)
                                               values (%L, 'pet', 'Baru') $q$, :f1)) like '%row-level security%',
  'NEG staff: adding a pet is refused');
select pg_temp.n_as(:p1, format($q$ delete from public.task_entities where id = %L $q$, :mocha)) as n \gset
select pg_temp.ok(:n = 0
                  and exists (select 1 from public.task_entities where id = :mocha::uuid),
  'NEG staff: deleting a pet (and its whole history) matches nothing');
select pg_temp.ok(pg_temp.n_as(:a1, format($q$ update public.task_entities set name = 'Mocha Latte' where id = %L $q$, :mocha)) = 1,
  'owner: renames a pet');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ insert into public.task_entities (id, household_id, entity_type, name)
                                               values ('00000000-0000-0000-0000-0000000146d2', %L, 'pet', 'Kopi') $q$, :f1)) = '',
  'owner: adds a pet');
select pg_temp.ok(pg_temp.n_as(:a1, $q$ delete from public.task_entities where id = '00000000-0000-0000-0000-0000000146d2' $q$) = 1,
  'owner: deletes a pet');
select pg_temp.ok(pg_temp.n_as(:a9, format($q$ update public.task_entities set name = 'X' where id = %L $q$, :mocha)) = 0,
  'NEG another household''s admin touches nothing');

-- ---- H1: logs (task_logs) ------------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ insert into public.task_logs (id, schedule_id, entity_id, module, staff_id, created_by, received_at)
  values ('00000000-0000-0000-0000-0000000146e1', %L, %L, 'pet', %L, %L, now() + interval '1 day') $q$,
  :feed, :mocha, :sari, :p2)) = '',
  'staff: logging a routine still works');
select pg_temp.ok((select created_by = :p1::uuid and received_at = now() from public.task_logs
                    where id = '00000000-0000-0000-0000-0000000146e1'),
  'the database stamps who saved it and when, whatever the phone sends');
select pg_temp.ok(pg_temp.err_as(:p2, format($q$ insert into public.task_logs (id, schedule_id, entity_id, module, staff_id)
  values ('00000000-0000-0000-0000-0000000146e2', %L, %L, 'pet', %L) $q$, :feed, :mocha, :budi)) = '',
  'staff: Budi logs on his phone too');
select pg_temp.ok(pg_temp.n_as(:p1, $q$ delete from public.task_logs where id = '00000000-0000-0000-0000-0000000146e2' $q$) = 0,
  'NEG staff: a log another phone saved can''t be deleted');
select pg_temp.ok(pg_temp.n_as(:p1, $q$ delete from public.task_logs where id = '00000000-0000-0000-0000-0000000146e1' $q$) = 1,
  'staff: undo within 5 minutes still works');
-- An older log of Sari's phone.
insert into public.task_logs (id, schedule_id, entity_id, module, staff_id)
values ('00000000-0000-0000-0000-0000000146e3', :feed, :mocha, 'pet', :sari);
update public.task_logs set created_by = :p1, received_at = now() - interval '6 minutes'
 where id = '00000000-0000-0000-0000-0000000146e3';
select pg_temp.ok(pg_temp.n_as(:p1, $q$ delete from public.task_logs where id = '00000000-0000-0000-0000-0000000146e3' $q$) = 0,
  'NEG staff: its own log is final after 5 minutes');
-- A log from before 146 (no created_by, no received_at).
insert into public.task_logs (id, schedule_id, entity_id, module) values ('00000000-0000-0000-0000-0000000146e4', :feed, :mocha, 'pet');
update public.task_logs set created_by = null, received_at = null where id = '00000000-0000-0000-0000-0000000146e4';
select pg_temp.ok(pg_temp.n_as(:p1, $q$ delete from public.task_logs where id = '00000000-0000-0000-0000-0000000146e4' $q$) = 0,
  'NEG staff: an old log of any age can''t be deleted');
select pg_temp.ok(pg_temp.n_as(:p1, format($q$ delete from public.task_logs where entity_id = %L $q$, :mocha)) = 0,
  'NEG staff: a blanket delete of a pet''s history matches nothing');
-- A three-photo walk: started 40 minutes ago, not finished.
insert into public.task_logs (id, schedule_id, entity_id, module, sub_type) values
  ('00000000-0000-0000-0000-000000014661', :walk, :mocha, 'pet', 'check_in');
update public.task_logs set created_by = :p1, received_at = now() - interval '40 minutes'
 where id = '00000000-0000-0000-0000-000000014661';
select pg_temp.ok((select public.task_log_undo_open(schedule_id, entity_id, sub_type, received_at)
                     from public.task_logs where id = '00000000-0000-0000-0000-000000014661'),
  'staff: an unfinished walk can still be cancelled (Batalkan jalan-jalan)');
insert into public.task_logs (id, schedule_id, entity_id, module, sub_type) values
  ('00000000-0000-0000-0000-000000014662', :walk, :mocha, 'pet', 'check_out');
update public.task_logs set created_by = :p1, received_at = now() - interval '2 minutes'
 where id = '00000000-0000-0000-0000-000000014662';
select pg_temp.ok((select public.task_log_undo_open(schedule_id, entity_id, sub_type, received_at)
                     from public.task_logs where id = '00000000-0000-0000-0000-000000014661'),
  'staff: a walk that ended 2 minutes ago can still be taken back whole');
update public.task_logs set received_at = now() - interval '10 minutes' where id = '00000000-0000-0000-0000-000000014662';
select pg_temp.ok(pg_temp.n_as(:p1, $q$ delete from public.task_logs where id in ('00000000-0000-0000-0000-000000014661',
                                                                              '00000000-0000-0000-0000-000000014662') $q$) = 0,
  'NEG staff: a walk that ended 10 minutes ago is final');
update public.task_logs set received_at = now() - interval '2 minutes' where id = '00000000-0000-0000-0000-000000014662';
select pg_temp.ok(pg_temp.n_as(:p1, $q$ delete from public.task_logs where id in ('00000000-0000-0000-0000-000000014661',
                                                                              '00000000-0000-0000-0000-000000014662') $q$) = 2,
  'staff: Batalkan jalan-jalan removes both steps within the window');
select pg_temp.ok(pg_temp.n_as(:a1, $q$ delete from public.task_logs where id in ('00000000-0000-0000-0000-0000000146e2',
                                                                              '00000000-0000-0000-0000-0000000146e4') $q$) = 2,
  'owner: deletes any log, of any phone and any age');

-- ---- H1: schedule suggestions (routine_proposals) ------------------------------------
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ insert into public.routine_proposals (id, pet_id, title, category, time, staff_id)
  values ('00000000-0000-0000-0000-0000000146a0', %L, 'Makan siang', 'meal', '12:00', %L) $q$, :mocha, :sari)) = '',
  'staff: a schedule suggestion still files');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ insert into public.routine_proposals (pet_id, title, category, time, status)
  values (%L, 'Sudah disetujui', 'meal', '13:00', 'approved') $q$, :mocha)) like '%row-level security%',
  'NEG staff: a suggestion can''t be filed already approved');
select pg_temp.n_as(:p1, $q$ update public.routine_proposals set status = 'approved'
                                         where id = '00000000-0000-0000-0000-0000000146a0' $q$) as n \gset
select pg_temp.ok(:n = 0
                  and (select status from public.routine_proposals where id = '00000000-0000-0000-0000-0000000146a0') = 'pending',
  'NEG staff: approving their own suggestion matches nothing');
select pg_temp.ok(pg_temp.n_as(:a1, $q$ update public.routine_proposals set status = 'approved'
                                         where id = '00000000-0000-0000-0000-0000000146a0' $q$) = 1,
  'owner: approves it');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ insert into public.routine_proposals (id, pet_id, title, category, time)
  values ('00000000-0000-0000-0000-0000000146a3', %L, 'Salah', 'meal', '14:00') $q$, :mocha)) = ''
                  and pg_temp.n_as(:p1, $q$ delete from public.routine_proposals where id = '00000000-0000-0000-0000-0000000146a3' $q$) = 1,
  'staff: withdrawing a suggestion within 5 minutes still works');

-- ---- H1: the roster (staff_profiles) -------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ insert into public.staff_profiles (household_id, name) values (%L, 'Penyusup') $q$, :f1))
                  like '%row-level security%',
  'NEG staff: adding someone to the roster is refused');
select pg_temp.n_as(:p1, format($q$ update public.staff_profiles set name = 'Diganti' where id = %L $q$, :budi)) as n \gset
select pg_temp.ok(:n = 0
                  and (select name from public.staff_profiles where id = :budi::uuid) = 'Budi',
  'NEG staff: renaming a colleague matches nothing');
select pg_temp.ok(pg_temp.n_as(:p1, format($q$ update public.staff_profiles set name = 'X'
                                              where household_id = %L and user_id is not null $q$, :f1)) = 0,
  'NEG staff: renaming an admin''s row matches nothing');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ insert into public.staff_profiles (household_id, name)
                                               values (%L, 'Yanti') $q$, :f1)) = '',
  'owner: adds a person');
select pg_temp.ok(pg_temp.n_as(:a1, $q$ update public.staff_profiles set name = 'Yanti S'
                                         where name = 'Yanti' and household_id = '00000000-0000-0000-0000-0000000146f1' $q$) = 1,
  'owner: renames them');

-- ---- H1: health records (medical_records) --------------------------------------------
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ insert into public.medical_records (entity_id, record_type, title)
                                               values (%L, 'vaccine', 'Palsu') $q$, :mocha)) like '%row-level security%',
  'NEG staff: adding a health record is refused');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ insert into public.medical_records (entity_id, record_type, title)
                                               values (%L, 'vaccine', 'Rabies') $q$, :mocha)) = '',
  'owner: adds a health record');

-- ---- H1: ending leave early ----------------------------------------------------------
insert into public.leave_requests (id, household_id, staff_id, start_date, end_date, status, fallback_action)
values ('00000000-0000-0000-0000-000000014671', :f1, :budi, current_date - 1, current_date + 5, 'approved', 'unassign'),
       ('00000000-0000-0000-0000-000000014672', :f1, :sari, current_date - 1, current_date + 5, 'approved', 'unassign');
select pg_temp.err_as(:p1, $q$ select public.end_leave_early('00000000-0000-0000-0000-000000014671', current_date) $q$) as r \gset
select pg_temp.ok(:'r' like '%not_your_leave%'
                  and (select status from public.leave_requests where id = '00000000-0000-0000-0000-000000014671') = 'approved',
  'NEG staff: ending a colleague''s leave is refused');
select pg_temp.err_as(:p2, $q$ select public.end_leave_early('00000000-0000-0000-0000-000000014671', current_date) $q$) as r \gset
select pg_temp.ok(:'r' = ''
                  and (select status from public.leave_requests where id = '00000000-0000-0000-0000-000000014671') = 'ended_early',
  'staff: Budi ends his own leave (Saya Sudah Kembali)');
select pg_temp.ok(pg_temp.err_as(:a1, $q$ select public.end_leave_early('00000000-0000-0000-0000-000000014672', current_date) $q$) = '',
  'owner: ends anyone''s leave');
select pg_temp.ok(pg_temp.err_as(:p2, format($q$ insert into public.leave_requests (household_id, staff_id, start_date, end_date)
                                               values (%L, %L, current_date + 10, current_date + 11) $q$, :f1, :budi)) = '',
  'staff: a leave request still files');

-- ---- H1: deleting photos (storage) ---------------------------------------------------
set local storage.allow_delete_query = 'true';
insert into storage.objects (id, bucket_id, name, owner, owner_id, created_at) values
  ('00000000-0000-0000-0000-000000014651', 'household-logs', '00000000-0000-0000-0000-0000000146f1/pet/new.jpg', :p1, :p1, now()),
  ('00000000-0000-0000-0000-000000014652', 'household-logs', '00000000-0000-0000-0000-0000000146f1/pet/old.jpg', :p1, :p1, now() - interval '2 days'),
  ('00000000-0000-0000-0000-000000014653', 'household-logs', '00000000-0000-0000-0000-0000000146f1/pet/budi.jpg', :p2, :p2, now()),
  ('00000000-0000-0000-0000-000000014654', 'household-logs', '00000000-0000-0000-0000-0000000146f1/pets/forever.jpg', :a1, :a1, now() - interval '90 days');
select pg_temp.ok(pg_temp.n_as(:p1, $q$ delete from storage.objects where id = '00000000-0000-0000-0000-000000014651' $q$) = 1,
  'staff: deleting its own fresh photo (the undo) still works');
select pg_temp.ok(pg_temp.n_as(:p1, $q$ delete from storage.objects where id = '00000000-0000-0000-0000-000000014652' $q$) = 0,
  'NEG staff: its own photo from 2 days ago can''t be deleted');
select pg_temp.ok(pg_temp.n_as(:p1, $q$ delete from storage.objects where id = '00000000-0000-0000-0000-000000014653' $q$) = 0,
  'NEG staff: another phone''s photo can''t be deleted');
select pg_temp.ok(pg_temp.n_as(:p1, $q$ delete from storage.objects where id = '00000000-0000-0000-0000-000000014654' $q$) = 0,
  'NEG staff: a kept-forever pet photo can''t be deleted');
select pg_temp.ok(pg_temp.n_as(:a1, $q$ delete from storage.objects where id in ('00000000-0000-0000-0000-000000014652',
                                                                             '00000000-0000-0000-0000-000000014654') $q$) = 2,
  'owner: deletes any photo of the household');
select pg_temp.ok(pg_temp.n_as(:a9, $q$ delete from storage.objects where id = '00000000-0000-0000-0000-000000014653' $q$) = 0,
  'NEG another household''s admin deletes nothing here');

-- ---- M1: growing lockouts and the caps -----------------------------------------------
create function pg_temp.try_pin(uid uuid, staff uuid, pin text) returns jsonb language plpgsql as $$
begin
  return pg_temp.json_as(uid, format($q$ select public.sign_in_with_house_code((select code from pg_temp.code), %L, %L) $q$, staff, pin));
end $$;
-- Five wrong for Budi from the laptop's first session: 15 minutes.
select 'tries ' || count(pg_temp.try_pin(:p3, :budi, '0000')) from generate_series(1, 4);
select pg_temp.try_pin(:p3, :budi, '0000') as j \gset
select pg_temp.ok((:'j')::jsonb->>'status' = 'locked'
                  and (select pin_lock_level = 1 and pin_locked_until between now() + interval '14 minutes' and now() + interval '16 minutes'
                         from public.staff_profiles where id = :budi::uuid),
  'M1: 5 wrong PINs lock for 15 minutes');
select pg_temp.try_pin(:p4, :budi, '5678') as j \gset
select pg_temp.ok((:'j')::jsonb->>'status' = 'locked'
                  and (select count(*) = 5 from public.staff_sign_in_attempts where staff_id = :budi::uuid and not success),
  'M1: while locked, even the right PIN is refused, and the refusal isn''t counted toward the caps');
-- The lock runs out; five more wrong from a second session: 1 hour.
update public.staff_profiles set pin_locked_until = now() - interval '1 second' where id = :budi;
select 'tries ' || count(pg_temp.try_pin(:p4, :budi, '0000')) from generate_series(1, 4);
select pg_temp.try_pin(:p4, :budi, '0000') as j \gset
select pg_temp.ok((:'j')::jsonb->>'status' = 'locked'
                  and (select pin_lock_level = 2 and pin_locked_until between now() + interval '59 minutes' and now() + interval '61 minutes'
                         from public.staff_profiles where id = :budi::uuid),
  'M1: the next 5 within a day lock for 1 hour');
-- An hour later (the 1-hour lock has run, and with it the hour the caps
-- count), five more from a third session: until an admin resets it.
update public.staff_profiles set pin_locked_until = now() - interval '1 second' where id = :budi;
update public.staff_sign_in_attempts set created_at = now() - interval '61 minutes' where household_id = :f1::uuid;
select 'tries ' || count(pg_temp.try_pin(:p5, :budi, '0000')) from generate_series(1, 4);
select pg_temp.try_pin(:p5, :budi, '0000') as j \gset
select pg_temp.ok((:'j')::jsonb @> '{"status":"locked","until_reset":true}'
                  and (select pin_lock_level = 3 and pin_locked_until = 'infinity' from public.staff_profiles where id = :budi::uuid),
  'M1: the next 5 lock until an admin resets the PIN');
-- Ten more wrong in the household within the hour, then the cap.
select 'tries ' || count(pg_temp.try_pin(:p3, :sari, '0000')) from generate_series(1, 4);
update public.staff_profiles set failed_pin_attempts = 0, pin_locked_until = null where id = :sari;
select 'tries ' || count(pg_temp.try_pin(:p4, :sari, '0000')) from generate_series(1, 4);
update public.staff_profiles set failed_pin_attempts = 0, pin_locked_until = null where id = :sari;
select 'tries ' || count(pg_temp.try_pin(:p1, :sari, '0000')) from generate_series(1, 2);
select pg_temp.ok((select count(*) from public.staff_sign_in_attempts where household_id = :f1::uuid and kind = 'pin' and not success
                     and created_at > now() - interval '1 hour') >= 15,
  'M1: the household now has 15 wrong PINs in the hour');
select pg_temp.try_pin(:p5, :sari, '9999') as j \gset
select pg_temp.ok((:'j')::jsonb->>'status' = 'too_many_attempts',
  'M1: past 15 wrong PINs in the household, PIN tries are not checked');
select pg_temp.try_pin(:p5, :sari, '1234') as j \gset
select pg_temp.ok((:'j')::jsonb->>'status' = 'too_many_attempts',
  'M1: not even the right one, until the hour has passed');
select pg_temp.err_as(:a1, format($q$ select public.set_staff_pin(%L, '4321') $q$, :budi)) as r \gset
select pg_temp.ok(:'r' = ''
                  and (select pin_lock_level = 0 and pin_locked_until is null and failed_pin_attempts = 0
                         from public.staff_profiles where id = :budi::uuid),
  'M1: an admin setting a new PIN lifts every lock');
-- Per session: clear the household's count, then 10 wrong from one session across people.
delete from public.staff_sign_in_attempts where household_id = :f1::uuid;
update public.staff_profiles set failed_pin_attempts = 0, pin_locked_until = null, pin_lock_level = 0, pin_locked_at = null
 where household_id = :f1::uuid;
select pg_temp.try_pin(:p3, s, '0000') from (values (:sari::uuid), (:budi::uuid)) v(s), generate_series(1, 4);
select pg_temp.try_pin(:p3, :sari, '0000'), pg_temp.try_pin(:p3, :budi, '0000');
-- Both are locked now; Sari's lock runs out.
update public.staff_profiles set failed_pin_attempts = 0, pin_locked_until = null where id = :sari;
select pg_temp.ok(pg_temp.try_pin(:p3, :sari, '1234')->>'status' = 'too_many_attempts',
  'M1: past 10 wrong PINs from one session, that session''s tries are not checked');
-- Wrong codes: no more global cap.
insert into public.staff_sign_in_attempts (user_id, kind, success, created_at)
select null, 'code', false, now() from generate_series(1, 300);
select pg_temp.ok(pg_temp.json_as(:p4, $q$ select to_jsonb(count(*)) from public.house_code_roster((select code from pg_temp.code)) $q$)::int >= 2,
  'M1: 300 wrong codes elsewhere no longer block house-code sign-in for everyone');
insert into public.staff_sign_in_attempts (user_id, kind, success)
select :p5::uuid, 'code', false from generate_series(1, 10);
select pg_temp.ok(pg_temp.err_as(:p5, $q$ select * from public.house_code_roster((select code from pg_temp.code)) $q$)
                  like '%too_many_attempts%',
  'M1: 10 wrong codes from one session still stop that session');
-- Archiving changes the code and signs the person's phones out.
create temp table old_code as select code from pg_temp.code;
grant select on pg_temp.old_code to authenticated;
select pg_temp.err_as(:a1, format($q$ select public.archive_staff_profile(%L) $q$, :sari)) as r \gset
select pg_temp.ok(:'r' = ''
                  and (select c.code from public.household_join_codes c where c.household_id = :f1::uuid)
                      <> (select code from old_code),
  'M1: archiving someone gives the house a new code');
select pg_temp.ok(not exists (select 1 from public.device_sessions where user_id = :p1::uuid)
                  and exists (select 1 from public.device_sessions where user_id = :p2::uuid),
  'M1: the archived person''s phone is unlinked, the others stay');
select pg_temp.ok(pg_temp.json_as(:p4, $q$ select to_jsonb(count(*)) from public.house_code_roster((select code from old_code)) $q$)::int = 0,
  'NEG M1: the old code shows no names');

-- ---- M2: one household per account ---------------------------------------------------
insert into public.owner_invites (household_id, token, expires_at) values (:f1, 'tok146', now() + interval '1 day');
select pg_temp.err_as(:a9, $q$ select public.use_owner_invite_token('tok146') $q$) as r \gset
select pg_temp.ok(:'r' like '%already_in_a_household%'
                  and (select used_at is null from public.owner_invites where token = 'tok146')
                  and not exists (select 1 from public.household_members where user_id = :a9::uuid and household_id = :f1::uuid),
  'NEG M2: an invite to a second household is refused and stays unused');
select pg_temp.ok(pg_temp.err_as(:a2, $q$ select public.use_owner_invite_token('tok146') $q$) = '',
  'M2: an admin clicking an invite to their own household still lands there');

-- ---- M6: accounts without a household ------------------------------------------------
delete from public.household_members where household_id = :f1 and user_id = :a2;
select pg_temp.ok((select due_at = now() + interval '30 days' from public.account_deletions where user_id = :a2::uuid),
  'M6: a removed admin''s account is due for deletion in 30 days');
insert into public.household_members (household_id, user_id, role) values (:f1, :a2, 'owner');
select pg_temp.ok(not exists (select 1 from public.account_deletions where user_id = :a2::uuid),
  'M6: joining again cancels it');
delete from public.household_members where household_id = :f1 and user_id = :a2;
select pg_temp.ok(public.delete_orphaned_accounts() = 0 and exists (select 1 from auth.users where id = :a2::uuid),
  'M6: nothing is deleted before the 30 days');
select id as a2row from public.staff_profiles where user_id = :a2 \gset
update public.account_deletions set due_at = now() - interval '1 second' where user_id = :a2;
select public.delete_orphaned_accounts() as n \gset
select pg_temp.ok(:n = 1
                  and not exists (select 1 from auth.users where id = :a2::uuid),
  'M6: after 30 days the account is deleted');
select pg_temp.ok((select user_id is null and archived_at is not null and not has_pin
                     from public.staff_profiles where id = :'a2row'),
  'M6: no roster row is left claimable by PIN');
delete from public.households where id = :f2;
select pg_temp.ok(exists (select 1 from public.account_deletions where user_id = :a9::uuid),
  'M6: deleting a household starts the clock for its last admin');

-- ---- M7: idle phones -----------------------------------------------------------------
update public.device_sessions set last_seen_at = now() - interval '61 days' where user_id = :p2;
insert into auth.sessions (id, user_id, created_at, updated_at, refreshed_at)
values (gen_random_uuid(), :p2, now() - interval '90 days', now() - interval '3 days', (now() - interval '3 days') at time zone 'UTC');
select public.unlink_idle_phones() as n \gset
select pg_temp.ok(:n = 0
                  and (select last_seen_at > now() - interval '4 days' from public.device_sessions where user_id = :p2::uuid),
  'M7: a phone whose app refreshed 3 days ago stays linked, and its last-seen is updated');
delete from auth.sessions where user_id = :p2;
update public.device_sessions set last_seen_at = now() - interval '61 days' where user_id = :p2;
select public.unlink_idle_phones() as n \gset
select pg_temp.ok(:n = 1 and not exists (select 1 from public.device_sessions where user_id = :p2::uuid),
  'M7: a phone not seen for 61 days is unlinked');

-- ---- L1 and grants -------------------------------------------------------------------
select pg_temp.ok(not exists (
  select 1 from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'),
  'L1: anon holds no table privilege in public');
select pg_temp.ok(not exists (
  select 1 from information_schema.role_table_grants where grantee = 'authenticated' and table_schema = 'public'
     and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')),
  'L1: authenticated holds no TRUNCATE, REFERENCES or TRIGGER');
select pg_temp.ok(not exists (
  select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
     and (has_function_privilege('anon', p.oid, 'execute')
          or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                      where a.grantee = 0 and a.privilege_type = 'EXECUTE'))),
  'L1: no public function can be run by anon or PUBLIC');
select pg_temp.ok(has_function_privilege('authenticated', 'public.adjust_inventory_quantity(uuid, numeric)', 'execute')
                  and has_function_privilege('authenticated', 'public.staff_workload(uuid, timestamptz, timestamptz)', 'execute'),
  'L1: the app keeps its helpers');
select pg_temp.ok(not has_column_privilege('authenticated', 'public.staff_profiles', 'pin_lock_level', 'select')
                  and not has_function_privilege('authenticated', 'public.unlink_idle_phones()', 'execute')
                  and not has_function_privilege('authenticated', 'public.delete_orphaned_accounts()', 'execute')
                  and not has_function_privilege('authenticated', 'public.task_entities_staff_guard()', 'execute')
                  and has_function_privilege('authenticated', 'public.end_leave_early(uuid, date)', 'execute')
                  and has_function_privilege('authenticated', 'public.is_household_admin(uuid)', 'execute')
                  and not has_table_privilege('authenticated', 'public.account_deletions', 'select'),
  'the new pieces have only the grants they need');

rollback;
