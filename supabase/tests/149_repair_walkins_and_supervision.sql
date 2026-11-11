-- Migration 149 checks: walk-in repairs and supervising (Phase 174 PR A).
-- What a staff phone may log and finish (and may not: another household, a
-- closed repair, someone else's name, an old phone time, another person's
-- columns); server times; Undo within 5 minutes; the stretches the triggers
-- open, close and hand over, one per person; no client edits of stretches;
-- the "Mengawasi perbaikan" reason; photos kept with the repair (the
-- repairs_due trap); the 90-day prune; the export; grants.
-- LOCAL DATABASE ONLY, with 149 applied (or applied in the same
-- transaction). One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/149_repair_walkins_and_supervision.sql
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
-- A photo URL in a household's repairs folder.
create function pg_temp.photo(h text, f text) returns text language sql as $$
  select 'http://x/storage/v1/object/public/household-logs/' || h || '/repairs/' || f $$;

-- ---- Households ---------------------------------------------------------------------
-- f1: owner a1, staff phone b1; Ari (c1), Syam (c2), Budi (c3, archived).
-- f2: owner a4, staff phone b2; its own repair.
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, anon, now(), now()
from (values
  ('00000000-0000-0000-0000-0000000149a1', 'one149@test.local', false),
  ('00000000-0000-0000-0000-0000000149a4', 'four149@test.local', false),
  ('00000000-0000-0000-0000-0000000149b1', null, true),
  ('00000000-0000-0000-0000-0000000149b2', null, true)
) as u(id, email, anon);
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000149f1', 'Rumah Melati', '00000000-0000-0000-0000-0000000149a1'),
  ('00000000-0000-0000-0000-0000000149f2', 'Rumah Kenanga', '00000000-0000-0000-0000-0000000149a4');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-0000000149a1', 'owner'),
  ('00000000-0000-0000-0000-0000000149f2', '00000000-0000-0000-0000-0000000149a4', 'owner');
insert into public.device_sessions (user_id, household_id) values
  ('00000000-0000-0000-0000-0000000149b1', '00000000-0000-0000-0000-0000000149f1'),
  ('00000000-0000-0000-0000-0000000149b2', '00000000-0000-0000-0000-0000000149f2');
insert into public.staff_profiles (id, household_id, name, archived_at) values
  ('00000000-0000-0000-0000-0000000149c1', '00000000-0000-0000-0000-0000000149f1', 'Ari', null),
  ('00000000-0000-0000-0000-0000000149c2', '00000000-0000-0000-0000-0000000149f1', 'Syam', null),
  ('00000000-0000-0000-0000-0000000149c3', '00000000-0000-0000-0000-0000000149f1', 'Budi', now()),
  ('00000000-0000-0000-0000-0000000149c9', '00000000-0000-0000-0000-0000000149f2', 'Sari', null);
-- The owner's own roster row (106 makes it).
create temp table owner_row as
  select id from public.staff_profiles
   where household_id = '00000000-0000-0000-0000-0000000149f1' and user_id = '00000000-0000-0000-0000-0000000149a1';
grant select on owner_row to authenticated;
select pg_temp.ok((select count(*) = 1 from owner_row), 'the owner has a roster row (106)');

-- Without triggers: the repairs guard only lets an insert start open.
set local session_replication_role = replica;
insert into public.repairs (id, household_id, title, status, closed_at) values
  ('00000000-0000-0000-0000-0000000149d1', '00000000-0000-0000-0000-0000000149f1', 'Keran bocor', 'open', null),
  ('00000000-0000-0000-0000-0000000149d2', '00000000-0000-0000-0000-0000000149f1', 'Lampu teras', 'fixed', now()),
  ('00000000-0000-0000-0000-0000000149d3', '00000000-0000-0000-0000-0000000149f2', 'Pagar', 'open', null),
  ('00000000-0000-0000-0000-0000000149d4', '00000000-0000-0000-0000-0000000149f1', 'AC menetes', 'open', null),
  ('00000000-0000-0000-0000-0000000149d5', '00000000-0000-0000-0000-0000000149f1', 'Dinding retak', 'dismissed', now());
set local session_replication_role = origin;

\set a1 '''00000000-0000-0000-0000-0000000149a1'''
\set a4 '''00000000-0000-0000-0000-0000000149a4'''
\set staff '''00000000-0000-0000-0000-0000000149b1'''
\set staff2 '''00000000-0000-0000-0000-0000000149b2'''

-- ---- A staff phone logs a walk-in ------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.repair_visits (id, household_id, repair_id, worker_name, logged_by_staff, created_by,
                                    arrived_at, arrived_phone_at, before_photo_url, left_at, after_photo_url, outcome, note)
  values ('00000000-0000-0000-0000-00000149e001', '00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-0000000149d1',
          '  Pak Budi  ', '00000000-0000-0000-0000-0000000149c1', '00000000-0000-0000-0000-0000000149a1',
          '2020-01-01', now() - interval '3 minutes', %L, '2020-01-02', %L, 'fixed', 'sneaky') $q$,
  pg_temp.photo('00000000-0000-0000-0000-0000000149f1', 'r1/before.webp'),
  pg_temp.photo('00000000-0000-0000-0000-0000000149f1', 'r1/after.webp'))) = '',
  'a staff phone logs a walk-in (Ari, Pak Budi, a before photo)');
select pg_temp.ok((select worker_name = 'Pak Budi' and arrived_at = now()
                          and created_by = '00000000-0000-0000-0000-0000000149b1'
                          and left_at is null and after_photo_url is null and outcome is null and note is null
                     from public.repair_visits where id = '00000000-0000-0000-0000-00000149e001'),
  '... the server stamps the arrival and the phone, and a walk-in starts open whatever the phone sends');
select pg_temp.ok((select count(*) = 1 from public.repair_supervision
                    where visit_id = '00000000-0000-0000-0000-00000149e001'
                      and staff_id = '00000000-0000-0000-0000-0000000149c1' and ended_at is null and started_at = now()),
  '... and opens Ari''s supervising stretch');
select pg_temp.ok(pg_temp.count_as(:staff, 'select count(*) from public.repair_visits') = 1
                  and pg_temp.count_as(:staff, 'select count(*) from public.repair_supervision') = 1,
  'the staff phone reads the walk-in and the stretch');
select pg_temp.ok(pg_temp.count_as(:a4, 'select count(*) from public.repair_visits') = 0
                  and pg_temp.count_as(:a4, 'select count(*) from public.repair_supervision') = 0
                  and pg_temp.count_as(:staff2, 'select count(*) from public.repair_visits') = 0,
  'another household''s owner and staff phone see nothing');
select pg_temp.ok(pg_temp.err_as(null, 'select count(*) from public.repair_visits') like '%permission denied%'
                  and pg_temp.err_as(null, 'select count(*) from public.repair_supervision') like '%permission denied%',
  'logged-out callers get nothing');

select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.repair_visits (id, household_id, repair_id, logged_by_staff, before_photo_url)
  values ('00000000-0000-0000-0000-00000149e001', '00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-0000000149d1',
          '00000000-0000-0000-0000-0000000149c1', %L) $q$,
  pg_temp.photo('00000000-0000-0000-0000-0000000149f1', 'r1/before.webp'))) like '%repair_visits_pkey%',
  'a resend of the same walk-in is "already saved" (the primary key)');

-- ---- What a staff phone may not log -------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.repair_visits (household_id, repair_id, logged_by_staff, before_photo_url)
  values ('00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-0000000149d2', '00000000-0000-0000-0000-0000000149c2', %L) $q$,
  pg_temp.photo('00000000-0000-0000-0000-0000000149f1', 'r2/b.webp'))) like '%repair_visit_closed%',
  'not on a fixed repair');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.repair_visits (household_id, repair_id, logged_by_staff, before_photo_url)
  values ('00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-0000000149d5', '00000000-0000-0000-0000-0000000149c2', %L) $q$,
  pg_temp.photo('00000000-0000-0000-0000-0000000149f1', 'r5/b.webp'))) like '%repair_visit_closed%',
  'nor on a dismissed one');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.repair_visits (household_id, repair_id, logged_by_staff, before_photo_url)
  values ('00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-0000000149d4', '00000000-0000-0000-0000-0000000149c3', %L) $q$,
  pg_temp.photo('00000000-0000-0000-0000-0000000149f1', 'r4/b.webp'))) like '%staff_archived%',
  'not in the name of someone removed from the household');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.repair_visits (household_id, repair_id, logged_by_staff, before_photo_url)
  values ('00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-0000000149d4', (select id from owner_row), %L) $q$,
  pg_temp.photo('00000000-0000-0000-0000-0000000149f1', 'r4/b.webp'))) like '%repair_visit_staff%',
  'not in the owner''s name');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.repair_visits (household_id, repair_id, logged_by_staff, before_photo_url)
  values ('00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-0000000149d4', null, %L) $q$,
  pg_temp.photo('00000000-0000-0000-0000-0000000149f1', 'r4/b.webp'))) like '%repair_visit_staff%',
  'not without a name');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.repair_visits (household_id, repair_id, logged_by_staff, before_photo_url)
  values ('00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-0000000149d4', '00000000-0000-0000-0000-0000000149c9', %L) $q$,
  pg_temp.photo('00000000-0000-0000-0000-0000000149f1', 'r4/b.webp'))) like '%repair_visit_staff%',
  'not in the name of another household''s staff');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.repair_visits (household_id, repair_id, logged_by_staff, before_photo_url)
  values ('00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-0000000149d3', '00000000-0000-0000-0000-0000000149c2', %L) $q$,
  pg_temp.photo('00000000-0000-0000-0000-0000000149f1', 'r3/b.webp'))) ~ '(repair_visit_repair|repair_visits_repair_fkey)',
  'not on another household''s repair, naming its own household');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.repair_visits (household_id, repair_id, logged_by_staff, before_photo_url)
  values ('00000000-0000-0000-0000-0000000149f2', '00000000-0000-0000-0000-0000000149d3', '00000000-0000-0000-0000-0000000149c2', %L) $q$,
  pg_temp.photo('00000000-0000-0000-0000-0000000149f2', 'r3/b.webp'))) like '%repair_visit_household%',
  'nor into another household');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.repair_visits (household_id, repair_id, logged_by_staff, before_photo_url)
  values ('00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-0000000149d4', '00000000-0000-0000-0000-0000000149c2', %L) $q$,
  pg_temp.photo('00000000-0000-0000-0000-0000000149f2', 'r4/b.webp'))) like '%repair_visit_photo%',
  'not with a photo from another household''s folder');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.repair_visits (household_id, repair_id, logged_by_staff, before_photo_url)
  values ('00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-0000000149d4', '00000000-0000-0000-0000-0000000149c2',
          'http://x/storage/v1/object/public/household-logs/00000000-0000-0000-0000-0000000149f1/chores/b.webp') $q$)
  like '%repair_visit_photo%', 'not with a photo outside the repairs folder');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.repair_visits (household_id, repair_id, logged_by_staff, arrived_phone_at, before_photo_url)
  values ('00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-0000000149d4', '00000000-0000-0000-0000-0000000149c2',
          now() - interval '3 days', %L) $q$,
  pg_temp.photo('00000000-0000-0000-0000-0000000149f1', 'r4/b.webp'))) like '%repair_visit_phone_time%',
  'not with a phone time more than 48 hours old');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.repair_visits (household_id, repair_id, logged_by_staff, arrived_phone_at, before_photo_url)
  values ('00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-0000000149d4', '00000000-0000-0000-0000-0000000149c2',
          now() + interval '1 hour', %L) $q$,
  pg_temp.photo('00000000-0000-0000-0000-0000000149f1', 'r4/b.webp'))) like '%repair_visit_phone_time%',
  'nor one in the future');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.repair_visits (household_id, repair_id, logged_by_staff, before_photo_url)
  values ('00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-0000000149d4', '00000000-0000-0000-0000-0000000149c1', %L) $q$,
  pg_temp.photo('00000000-0000-0000-0000-0000000149f1', 'r4/b.webp'))) like '%supervision_busy%',
  'Ari can''t log a second walk-in while supervising the first');
select pg_temp.ok((select count(*) = 1 from public.repair_visits where household_id = '00000000-0000-0000-0000-0000000149f1'),
  '... and nothing of it was kept');

-- ---- Ganti yang mengawasi ----------------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.repair_supervision (id, household_id, visit_id, staff_id, started_at, ended_at)
  values ('00000000-0000-0000-0000-00000149a5a1', '00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-00000149e001',
          '00000000-0000-0000-0000-0000000149c2', '2020-01-01', '2020-01-02') $q$) = '',
  'the staff phone hands the walk-in over to Syam');
select pg_temp.ok((select ended_at = now() from public.repair_supervision
                    where visit_id = '00000000-0000-0000-0000-00000149e001' and staff_id = '00000000-0000-0000-0000-0000000149c1'),
  '... Ari''s stretch closes at that moment');
select pg_temp.ok((select started_at = now() and ended_at is null from public.repair_supervision
                    where id = '00000000-0000-0000-0000-00000149a5a1'),
  '... Syam''s opens then, by the server''s clock');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.repair_supervision (id, household_id, visit_id, staff_id)
  values ('00000000-0000-0000-0000-00000149a5a1', '00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-00000149e001',
          '00000000-0000-0000-0000-0000000149c2') $q$) like '%repair_supervision_pkey%',
  'a resend of the hand-over is "already saved"');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.repair_supervision (household_id, visit_id, staff_id)
  values ('00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-00000149e001', '00000000-0000-0000-0000-0000000149c2') $q$)
  like '%supervision_same%', 'handing over to the person already supervising changes nothing');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.repair_supervision (household_id, visit_id, staff_id)
  values ('00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-00000149e001', '00000000-0000-0000-0000-0000000149c3') $q$)
  like '%supervision_person%', 'not to someone removed');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.repair_supervision (household_id, visit_id, staff_id)
  values ('00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-00000149e001', '00000000-0000-0000-0000-0000000149c9') $q$)
  like '%supervision_person%', 'not to another household''s staff');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.repair_supervision (household_id, visit_id, user_id)
  values ('00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-00000149e001', '00000000-0000-0000-0000-0000000149a1') $q$)
  like '%supervision_person%', 'a staff phone can''t put an owner on it by account');
select pg_temp.ok(pg_temp.err_as(:staff2, $q$
  insert into public.repair_supervision (household_id, visit_id, staff_id)
  values ('00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-00000149e001', '00000000-0000-0000-0000-0000000149c2') $q$)
  like '%supervision_household%', 'another household''s phone can''t touch it, and learns nothing');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  update public.repair_supervision set ended_at = null where visit_id = '00000000-0000-0000-0000-00000149e001' $q$)
  like '%permission denied%', 'nobody edits a stretch from a phone');
select pg_temp.ok(pg_temp.err_as(:a1, $q$
  delete from public.repair_supervision where visit_id = '00000000-0000-0000-0000-00000149e001' $q$)
  like '%permission denied%', '... nor deletes one, owners included');

-- In real life the hand-over and Selesai are minutes apart; inside this one
-- transaction now() never moves, so give the stretches their own times.
set local session_replication_role = replica;
update public.repair_supervision set started_at = now() - interval '1 hour', ended_at = now() - interval '30 minutes'
 where visit_id = '00000000-0000-0000-0000-00000149e001' and staff_id = '00000000-0000-0000-0000-0000000149c1';
update public.repair_supervision set started_at = now() - interval '30 minutes'
 where id = '00000000-0000-0000-0000-00000149a5a1';
set local session_replication_role = origin;

-- Ari is free again: her next walk-in is fine.
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.repair_visits (id, household_id, repair_id, logged_by_staff, before_photo_url)
  values ('00000000-0000-0000-0000-00000149e002', '00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-0000000149d4',
          '00000000-0000-0000-0000-0000000149c1', %L) $q$,
  pg_temp.photo('00000000-0000-0000-0000-0000000149f1', 'r4/b.webp'))) = '',
  'once handed over, Ari can log the next walk-in');

-- ---- What a staff phone may change -----------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  update public.repair_visits set arrived_at = now() - interval '1 hour' where id = '00000000-0000-0000-0000-00000149e001' $q$)
  like '%repair_visit_fixed_fields%', 'nobody changes the arrival time');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  update public.repair_visits set repair_id = '00000000-0000-0000-0000-0000000149d4' where id = '00000000-0000-0000-0000-00000149e001' $q$)
  like '%repair_visit_fixed_fields%', '... or the repair');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  update public.repair_visits set worker_name = 'Pak Joko' where id = '00000000-0000-0000-0000-00000149e001' $q$)
  like '%repair_visit_staff_finish_only%', 'a staff phone only finishes: no new name');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  update public.repair_visits set outcome = 'fixed' where id = '00000000-0000-0000-0000-00000149e001' $q$)
  like '%repair_visit_finish_photo%', 'Selesai needs the after photo');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  update public.repair_visits set after_photo_url = %L where id = '00000000-0000-0000-0000-00000149e001' $q$,
  pg_temp.photo('00000000-0000-0000-0000-0000000149f2', 'x.webp'))) like '%repair_visit_photo%',
  '... from this household''s folder');

-- Selesai.
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  update public.repair_visits
     set after_photo_url = %L, left_phone_at = now() - interval '1 minute', outcome = 'fixed', note = '  Karet diganti  ',
         left_at = '2020-01-01'
   where id = '00000000-0000-0000-0000-00000149e001' $q$,
  pg_temp.photo('00000000-0000-0000-0000-0000000149f1', 'r1/after.webp'))) = '',
  'the staff phone finishes the walk-in');
select pg_temp.ok((select left_at = now() and note = 'Karet diganti' and outcome = 'fixed'
                     from public.repair_visits where id = '00000000-0000-0000-0000-00000149e001'),
  '... the server stamps the leaving time; the note is trimmed');
select pg_temp.ok(not exists (select 1 from public.repair_supervision
                               where visit_id = '00000000-0000-0000-0000-00000149e001' and ended_at is null),
  '... and Syam''s stretch closes with it');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  update public.repair_visits
     set after_photo_url = %L, left_phone_at = (select left_phone_at from public.repair_visits where id = '00000000-0000-0000-0000-00000149e001'),
         outcome = 'fixed', note = 'Karet diganti'
   where id = '00000000-0000-0000-0000-00000149e001' $q$,
  pg_temp.photo('00000000-0000-0000-0000-0000000149f1', 'r1/after.webp'))) = '',
  'the same Selesai sent again is taken as one');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  update public.repair_visits set note = 'Ganti' where id = '00000000-0000-0000-0000-00000149e001' $q$)
  like '%repair_visit_finished%', 'after Selesai a staff phone changes nothing else');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.repair_supervision (household_id, visit_id, staff_id)
  values ('00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-00000149e001', '00000000-0000-0000-0000-0000000149c2') $q$)
  like '%supervision_visit_finished%', 'a finished walk-in can''t be handed over');

-- Batalkan a Selesai: within 5 minutes only.
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  update public.repair_visits set after_photo_url = null, left_phone_at = null, outcome = null, note = null
   where id = '00000000-0000-0000-0000-00000149e001' $q$) = '',
  'a staff phone takes back Selesai within 5 minutes');
select pg_temp.ok((select left_at is null and outcome is null from public.repair_visits where id = '00000000-0000-0000-0000-00000149e001')
                  and exists (select 1 from public.repair_supervision
                               where visit_id = '00000000-0000-0000-0000-00000149e001'
                                 and staff_id = '00000000-0000-0000-0000-0000000149c2' and ended_at is null),
  '... the walk-in is open again, and Syam''s stretch with it');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  update public.repair_visits set after_photo_url = %L, left_phone_at = now(), outcome = 'check'
   where id = '00000000-0000-0000-0000-00000149e001' $q$,
  pg_temp.photo('00000000-0000-0000-0000-0000000149f1', 'r1/after2.webp'))) = '',
  'and finished again');
set local session_replication_role = replica;
update public.repair_visits set left_at = now() - interval '10 minutes', arrived_at = now() - interval '2 hours'
 where id = '00000000-0000-0000-0000-00000149e001';
set local session_replication_role = origin;
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  update public.repair_visits set after_photo_url = null, left_phone_at = null, outcome = null, note = null
   where id = '00000000-0000-0000-0000-00000149e001' $q$) like '%repair_visit_finished%',
  'after 5 minutes it stays finished');

-- ---- Undo a walk-in --------------------------------------------------------------------------
select pg_temp.ok(pg_temp.count_as(:staff2, $q$
  with gone as (delete from public.repair_visits where id = '00000000-0000-0000-0000-00000149e002' returning 1)
  select count(*) from gone $q$) = 0, 'another household''s phone can''t delete it');
select pg_temp.ok(pg_temp.count_as(:staff, $q$
  with gone as (delete from public.repair_visits where id = '00000000-0000-0000-0000-00000149e002' returning 1)
  select count(*) from gone $q$) = 1, 'the phone that logged it takes it back within 5 minutes');
select pg_temp.ok(not exists (select 1 from public.repair_supervision where visit_id = '00000000-0000-0000-0000-00000149e002'),
  '... its stretch goes with it');
select pg_temp.ok(pg_temp.count_as(:staff, $q$
  with gone as (delete from public.repair_visits where id = '00000000-0000-0000-0000-00000149e001' returning 1)
  select count(*) from gone $q$) = 0, 'after 5 minutes a phone can''t delete one');

-- ---- Owners ------------------------------------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:a1, format($q$
  insert into public.repair_visits (id, household_id, repair_id, worker_name, logged_by_staff, before_photo_url)
  values ('00000000-0000-0000-0000-00000149e003', '00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-0000000149d4',
          'Tim developer', (select id from owner_row), %L) $q$,
  pg_temp.photo('00000000-0000-0000-0000-0000000149f1', 'r4/owner.webp'))) = '',
  'an owner logs a walk-in as themself ("Someone''s here")');
select pg_temp.ok(exists (select 1 from public.repair_supervision s join owner_row o on o.id = s.staff_id
                           where s.visit_id = '00000000-0000-0000-0000-00000149e003' and s.ended_at is null),
  '... and supervises it');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$
  insert into public.repair_visits (household_id, repair_id, logged_by_staff, before_photo_url)
  values ('00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-0000000149d1', '00000000-0000-0000-0000-0000000149c2', %L) $q$,
  pg_temp.photo('00000000-0000-0000-0000-0000000149f1', 'r1/o.webp'))) like '%repair_visit_staff%',
  'an owner logs in their own name, not a staff member''s');
select pg_temp.ok(pg_temp.err_as(:a1, $q$
  update public.repair_visits set outcome = 'fixed', note = 'Sudah dicek', worker_name = 'Pak Budi (AC)'
   where id = '00000000-0000-0000-0000-00000149e001' $q$) = '',
  'an owner edits the chip, the note and the name of a finished walk-in');
select pg_temp.ok((select left_at = now() - interval '10 minutes' from public.repair_visits where id = '00000000-0000-0000-0000-00000149e001'),
  '... the times stay');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$
  update public.repair_visits set before_photo_url = %L where id = '00000000-0000-0000-0000-00000149e001' $q$,
  pg_temp.photo('00000000-0000-0000-0000-0000000149f1', 'r1/other.webp'))) like '%repair_visit_fixed_fields%',
  'nobody swaps the before photo');
select pg_temp.ok(pg_temp.err_as(:a4, $q$
  update public.repair_visits set note = 'x' where id = '00000000-0000-0000-0000-00000149e001' $q$) like '%repair_visit_household%'
  or pg_temp.count_as(:a4, $q$ with c as (update public.repair_visits set note = 'x'
       where id = '00000000-0000-0000-0000-00000149e001' returning 1) select count(*) from c $q$) = 0,
  'another household''s owner changes nothing');
select pg_temp.ok((select note = 'Sudah dicek' from public.repair_visits where id = '00000000-0000-0000-0000-00000149e001'),
  '... the note is still the owner''s');

-- ---- "Mengawasi perbaikan" (D10) ---------------------------------------------------------------
insert into public.household_tasks (id, household_id, title, category, recurrence, due_date, due_time, status, assigned_to)
values ('00000000-0000-0000-0000-0000000149b9', '00000000-0000-0000-0000-0000000149f1', 'Pel teras', 'cleaning', 'none',
        (now() at time zone 'Asia/Jakarta')::date, '10:30', 'pending', '00000000-0000-0000-0000-0000000149c1');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.task_exceptions (id, household_id, chore_id, occurs_on, reason, staff_id, repair_visit_id)
  values ('00000000-0000-0000-0000-00000149ee01', '00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-0000000149b9',
          (now() at time zone 'Asia/Jakarta')::date, 'supervising_repair', '00000000-0000-0000-0000-0000000149c1',
          '00000000-0000-0000-0000-00000149e001') $q$) = '',
  'a staff phone says it was supervising a repair, linked to the walk-in, with no note');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.task_exceptions (household_id, chore_id, occurs_on, reason, note, repair_visit_id)
  values ('00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-0000000149b9',
          (now() at time zone 'Asia/Jakarta')::date, 'other', 'mengawasi', '00000000-0000-0000-0000-00000149e001') $q$)
  like '%task_exceptions_visit_reason%', 'only that reason names a visit');
insert into public.repair_visits (id, household_id, repair_id, logged_by_staff, before_photo_url)
values ('00000000-0000-0000-0000-00000149e009', '00000000-0000-0000-0000-0000000149f2', '00000000-0000-0000-0000-0000000149d3',
        '00000000-0000-0000-0000-0000000149c9', pg_temp.photo('00000000-0000-0000-0000-0000000149f2', 'r3/b.webp'));
delete from public.task_exceptions where id = '00000000-0000-0000-0000-00000149ee01';
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.task_exceptions (household_id, chore_id, occurs_on, reason, repair_visit_id)
  values ('00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-0000000149b9',
          (now() at time zone 'Asia/Jakarta')::date, 'supervising_repair', '00000000-0000-0000-0000-00000149e009') $q$)
  like '%task_exceptions_repair_visit_fkey%', 'never another household''s walk-in');
select pg_temp.ok(public.exception_reason_label('supervising_repair', false, 'id') = 'mengawasi perbaikan'
                  and public.exception_reason_label('supervising_repair', false, 'en') = 'supervising a repair'
                  and public.exception_reason_label('out_of_stock', false, 'en') = 'out of stock',
  'the evening summary''s labels know the new reason, the old ones unchanged');
insert into public.task_exceptions (id, household_id, chore_id, occurs_on, reason, repair_visit_id)
values ('00000000-0000-0000-0000-00000149ee02', '00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-0000000149b9',
        (now() at time zone 'Asia/Jakarta')::date, 'supervising_repair', '00000000-0000-0000-0000-00000149e003');
select pg_temp.ok(pg_temp.err_as(:a1, $q$ delete from public.repair_visits where id = '00000000-0000-0000-0000-00000149e003' $q$) = '',
  'an owner deletes a walk-in sooner');
select pg_temp.ok((select repair_visit_id is null and reason = 'supervising_repair'
                     from public.task_exceptions where id = '00000000-0000-0000-0000-00000149ee02'),
  '... the couldn''t-do record stays, unlinked');

-- ---- A staff report made with "Baru" can carry a walk-in -------------------------------------------
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.repairs (id, household_id, title, status, reported_by_staff)
  values ('00000000-0000-0000-0000-0000000149d6', '00000000-0000-0000-0000-0000000149f1', 'Stopkontak longgar', 'reported',
          '00000000-0000-0000-0000-0000000149c2') $q$) = '', '"Baru": a staff report');
select pg_temp.ok(pg_temp.err_as(:staff, format($q$
  insert into public.repair_visits (household_id, repair_id, logged_by_staff, before_photo_url)
  values ('00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-0000000149d6', '00000000-0000-0000-0000-0000000149c2', %L) $q$,
  pg_temp.photo('00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-0000000149d6/b.webp'))) = '',
  '... then a walk-in on it');
select pg_temp.ok(pg_temp.count_as(:staff, $q$
  with gone as (delete from public.repairs where id = '00000000-0000-0000-0000-0000000149d6' returning 1) select count(*) from gone $q$) = 1,
  'Batalkan takes back the report within 5 minutes');
select pg_temp.ok(not exists (select 1 from public.repair_visits where repair_id = '00000000-0000-0000-0000-0000000149d6'),
  '... and its walk-in goes with it');

-- ---- Photos: kept with the repair (D8), never swept as orphans ------------------------------------
select set_config('request.jwt.claims', '', true);
set local session_replication_role = replica;
insert into storage.objects (bucket_id, name, created_at, metadata) values
  ('household-logs', '00000000-0000-0000-0000-0000000149f1/repairs/r1/before.webp',  now() - interval '2 days',   '{"size": 1}'),
  ('household-logs', '00000000-0000-0000-0000-0000000149f1/repairs/r1/after2.webp',  now() - interval '2 days',   '{"size": 1}'),
  ('household-logs', '00000000-0000-0000-0000-0000000149f1/repairs/old/before.webp', now() - interval '950 days', '{"size": 1}'),
  ('household-logs', '00000000-0000-0000-0000-0000000149f1/repairs/stray.webp',      now() - interval '3 days',   '{"size": 1}');
insert into public.repairs (id, household_id, title, status, created_at, closed_at) values
  ('00000000-0000-0000-0000-0000000149d7', '00000000-0000-0000-0000-0000000149f1', 'Fixed 2½ years ago', 'fixed',
   now() - interval '950 days', now() - interval '900 days');
insert into public.repair_visits (household_id, repair_id, before_photo_url, arrived_at) values
  ('00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-0000000149d7',
   pg_temp.photo('00000000-0000-0000-0000-0000000149f1', 'old/before.webp'), now() - interval '950 days');
set local session_replication_role = origin;

create temp table secret as
  select coalesce(
    (select decrypted_secret from vault.decrypted_secrets where name = 'task_photo_retention_secret'),
    'test-secret-149') as s;
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'task_photo_retention_secret') then
    perform vault.create_secret('test-secret-149', 'task_photo_retention_secret', 'test');
  end if;
end $$;
create temp table due as
  select name from public.task_photos_due_for_pruning((select s from secret), 1000)
  where name like '00000000-0000-0000-0000-0000000149f1/%';
select pg_temp.ok((select array_agg(name order by name) from due)
                  = array['00000000-0000-0000-0000-0000000149f1/repairs/old/before.webp',
                          '00000000-0000-0000-0000-0000000149f1/repairs/stray.webp'],
  'due: a walk-in photo of a repair closed over 2 years ago, and a stray upload — never an open repair''s walk-in photos two days old (the repairs_due trap)');
select pg_temp.ok((select prosrc like '%repair_visits%' from pg_proc where proname = 'orphaned_household_photos'),
  'the orphan sweep counts walk-in photos as live references');

-- ---- The 90-day prune --------------------------------------------------------------------------------
set local session_replication_role = replica;
insert into public.repair_supervision (household_id, visit_id, staff_id, started_at, ended_at) values
  ('00000000-0000-0000-0000-0000000149f1', '00000000-0000-0000-0000-00000149e001', '00000000-0000-0000-0000-0000000149c1',
   now() - interval '100 days', now() - interval '99 days');
set local session_replication_role = origin;
select pg_temp.ok(public.prune_old_repair_supervision() = 1, 'stretches older than 90 days go');
select pg_temp.ok((select count(*) >= 2 from public.repair_supervision where visit_id = '00000000-0000-0000-0000-00000149e001'),
  '... the recent ones stay');
select pg_temp.ok((select count(*) = 1 from cron.job where jobname = 'prune-old-repair-supervision'), 'the nightly job is scheduled');

-- ---- Deleting a repair takes its walk-ins ------------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:a1, $q$ delete from public.repairs where id = '00000000-0000-0000-0000-0000000149d7' $q$) = '',
  'an owner deletes an old repair');
select pg_temp.ok(not exists (select 1 from public.repair_visits where repair_id = '00000000-0000-0000-0000-0000000149d7'),
  '... its walk-ins go with it (kept with the repair, D8)');

-- ---- The export --------------------------------------------------------------------------------------
create temp table exported (data jsonb);
grant insert on exported to authenticated;
select pg_temp.ok(pg_temp.err_as(:a1, $q$ insert into exported select public.export_household_data() $q$) = '',
  'an owner exports the household');
select pg_temp.ok((select jsonb_array_length(data -> 'repair_walk_ins') = 1
                          and data -> 'repair_walk_ins' -> 0 ->> 'worker_name' = 'Pak Budi (AC)'
                          and data -> 'repair_walk_ins' -> 0 ->> 'logged_by' = 'Ari'
                          and jsonb_array_length(data -> 'repair_supervision') >= 2
                          and data ? 'couldnt_do'
                     from exported),
  'the export lists the walk-ins (with who logged them) and who supervised');
select pg_temp.ok(pg_temp.err_as(:staff, $q$ select public.export_household_data() $q$) like '%admins_only%',
  'a staff phone still can''t export');

-- ---- Grants --------------------------------------------------------------------------------------------
select pg_temp.ok(
  not exists (
    select 1 from unnest(array[
      'public.repair_visits_guard()', 'public.repair_supervision_guard()', 'public.repair_visits_supervision()',
      'public.prune_old_repair_supervision()', 'public.repair_visit_photo_ok(text,uuid)',
      'public.exception_reason_label(text,boolean,text)', 'public.task_photos_due_for_pruning(text,integer)',
      'public.orphaned_household_photos(text,integer)'
    ]) f
    where has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute')
  ), 'no new or replaced function is callable from the API');
select pg_temp.ok(has_function_privilege('authenticated', 'public.export_household_data()', 'execute')
                  and not has_function_privilege('anon', 'public.export_household_data()', 'execute'),
  'the export stays for signed-in owners only');
select pg_temp.ok(not has_table_privilege('anon', 'public.repair_visits', 'select')
                  and not has_table_privilege('anon', 'public.repair_supervision', 'insert')
                  and not has_table_privilege('authenticated', 'public.repair_supervision', 'update')
                  and not has_table_privilege('authenticated', 'public.repair_supervision', 'delete')
                  and not has_table_privilege('authenticated', 'public.repair_visits', 'truncate'),
  'table grants: nothing for logged-out callers; no stretch edits for phones');
select pg_temp.ok(
  (select bool_and(proconfig = array['search_path=""']) from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('repair_visits_guard', 'repair_supervision_guard', 'repair_visits_supervision',
                      'prune_old_repair_supervision', 'repair_visit_photo_ok', 'exception_reason_label',
                      'task_photos_due_for_pruning', 'orphaned_household_photos', 'export_household_data')),
  'every new or replaced function has an empty search_path');
select pg_temp.ok(
  (select bool_and(relrowsecurity) from pg_class
    where oid in ('public.repair_visits'::regclass, 'public.repair_supervision'::regclass)),
  'row level security is on for both tables');

rollback;
