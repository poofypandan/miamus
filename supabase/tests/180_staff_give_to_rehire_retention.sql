-- Migration 180 checks (staff onboarding, step 4): archive_staff_profile's
-- "give to"; restore reopens the 7-day claim window; Remove for good and the
-- nightly 12-month rule replace the name with "Mantan staf"; who may call
-- what (owners of that household only; never anon, PUBLIC or a staff phone).
-- LOCAL DATABASE ONLY. One transaction, rolled back. Run after 180 is
-- applied, or with it in the same transaction:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/180_staff_give_to_rehire_retention.sql
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

-- ---- Households ----------------------------------------------------------------------
-- f1: owner a1, staff phone p1, staff Sri (s1), Ari (s2), Wati (s3, left 13
-- months ago), the owner's own roster row (o1). f2: owner a9, staff Budi (s9).
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, anon, now(), now()
from (values
  ('00000000-0000-0000-0000-0000000180a1', 'one180@test.local', false),
  ('00000000-0000-0000-0000-0000000180a9', 'nine180@test.local', false),
  ('00000000-0000-0000-0000-0000000180b1', null, true)
) as u(id, email, anon);
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000180f1', 'Rumah Melati', '00000000-0000-0000-0000-0000000180a1'),
  ('00000000-0000-0000-0000-0000000180f2', 'Rumah Kenanga', '00000000-0000-0000-0000-0000000180a9');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000180f1', '00000000-0000-0000-0000-0000000180a1', 'owner'),
  ('00000000-0000-0000-0000-0000000180f2', '00000000-0000-0000-0000-0000000180a9', 'owner');
insert into public.device_sessions (user_id, household_id) values
  ('00000000-0000-0000-0000-0000000180b1', '00000000-0000-0000-0000-0000000180f1');
-- A new household gets a house code by itself; set a known one.
update public.household_join_codes set code = 'QQ8QQ8' where household_id = '00000000-0000-0000-0000-0000000180f1';
insert into public.staff_profiles (id, household_id, name, user_id, archived_at, created_at, has_pin, hidden_areas) values
  ('00000000-0000-0000-0000-0000000180c1', '00000000-0000-0000-0000-0000000180f1', 'Sri', null, null, now() - interval '30 days', true, '{home,pets,repairs}'),
  ('00000000-0000-0000-0000-0000000180c2', '00000000-0000-0000-0000-0000000180f1', 'Ari', null, null, now() - interval '60 days', true, '{}'),
  ('00000000-0000-0000-0000-0000000180c3', '00000000-0000-0000-0000-0000000180f1', 'Wati', null, now() - interval '13 months', now() - interval '20 months', false, '{}'),
  ('00000000-0000-0000-0000-0000000180c4', '00000000-0000-0000-0000-0000000180f1', 'Yanti', null, now() - interval '2 months', now() - interval '6 months', false, '{}'),
  ('00000000-0000-0000-0000-0000000180c9', '00000000-0000-0000-0000-0000000180f2', 'Budi', null, null, now() - interval '60 days', true, '{}');
-- The owner's own roster row is made with the membership (106): give it a known id.
update public.staff_profiles set id = '00000000-0000-0000-0000-0000000180e1', name = 'Dewi'
 where household_id = '00000000-0000-0000-0000-0000000180f1' and user_id = '00000000-0000-0000-0000-0000000180a1';
insert into public.household_tasks (id, household_id, title, status, due_date, recurrence, assigned_to, completed_by, before_photo_url, after_photo_url) values
  ('00000000-0000-0000-0000-000000018071', '00000000-0000-0000-0000-0000000180f1', 'Cuci piring', 'pending', current_date + 1, 'daily', '00000000-0000-0000-0000-0000000180c1', null, null, null),
  ('00000000-0000-0000-0000-000000018072', '00000000-0000-0000-0000-0000000180f1', 'Bersihkan kulkas', 'pending', current_date + 3, 'none', '00000000-0000-0000-0000-0000000180c1', null, null, null),
  ('00000000-0000-0000-0000-000000018073', '00000000-0000-0000-0000-0000000180f1', 'Pel dapur', 'completed', current_date - 1, 'none', '00000000-0000-0000-0000-0000000180c1', '00000000-0000-0000-0000-0000000180c1', 'b.jpg', 'a.jpg');
insert into public.task_entities (id, household_id, entity_type, name) values
  ('00000000-0000-0000-0000-000000018061', '00000000-0000-0000-0000-0000000180f1', 'pet', 'Mocha');
insert into public.master_schedules (id, entity_id, title, module, frequency_type, staff_id) values
  ('00000000-0000-0000-0000-000000018051', '00000000-0000-0000-0000-000000018061', 'Jalan pagi', 'pet', 'fixed_time', '00000000-0000-0000-0000-0000000180c1');

\set a1 '''00000000-0000-0000-0000-0000000180a1'''
\set a9 '''00000000-0000-0000-0000-0000000180a9'''
\set p1 '''00000000-0000-0000-0000-0000000180b1'''
\set sri '''00000000-0000-0000-0000-0000000180c1'''
\set ari '''00000000-0000-0000-0000-0000000180c2'''
\set wati '''00000000-0000-0000-0000-0000000180c3'''
\set yanti '''00000000-0000-0000-0000-0000000180c4'''
\set dewi '''00000000-0000-0000-0000-0000000180e1'''
\set budi '''00000000-0000-0000-0000-0000000180c9'''

-- ---- Give to ---------------------------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:a1, format('select public.archive_staff_profile(%L, %L)', :sri, :sri)) like '%give_to_not_staff%',
  'give_to can''t be the person leaving');
select pg_temp.ok(pg_temp.err_as(:a1, format('select public.archive_staff_profile(%L, %L)', :sri, :dewi)) like '%give_to_not_staff%',
  '... nor an owner''s row');
select pg_temp.ok(pg_temp.err_as(:a1, format('select public.archive_staff_profile(%L, %L)', :sri, :yanti)) like '%give_to_not_staff%',
  '... nor someone who left');
select pg_temp.ok(pg_temp.err_as(:a1, format('select public.archive_staff_profile(%L, %L)', :sri, :budi)) like '%give_to_not_staff%',
  '... nor another household''s staff');
select pg_temp.ok((select archived_at is null and has_pin from public.staff_profiles where id = :sri),
  '... and a refused call changes nothing');
select pg_temp.ok(pg_temp.err_as(:p1, format('select public.archive_staff_profile(%L, %L)', :sri, :ari)) <> '',
  'a staff phone of the same household can''t remove anyone');
select pg_temp.ok(pg_temp.err_as(:a9, format('select public.archive_staff_profile(%L, %L)', :sri, :ari)) <> '',
  'another household''s owner can''t either');
select pg_temp.ok(pg_temp.err_as(null, format('select public.archive_staff_profile(%L, %L)', :sri, :ari)) like '%permission denied%',
  'anon can''t call it');

select pg_temp.ok(pg_temp.err_as(:a1, format('select public.archive_staff_profile(%L, %L)', :sri, :ari)) = '',
  'the owner removes Sri, giving her work to Ari');
select pg_temp.ok((select archived_at is not null and not has_pin and pin is null from public.staff_profiles where id = :sri),
  '... Sri is archived, her PIN cleared');
select pg_temp.ok((select assigned_to = :ari::uuid from public.household_tasks where id = '00000000-0000-0000-0000-000000018071'),
  '... her repeating chore is Ari''s');
select pg_temp.ok((select assigned_to = :ari::uuid from public.household_tasks where id = '00000000-0000-0000-0000-000000018072'),
  '... and her unfinished one');
select pg_temp.ok((select assigned_to = :sri::uuid and completed_by = :sri::uuid from public.household_tasks where id = '00000000-0000-0000-0000-000000018073'),
  '... finished work keeps her name');
select pg_temp.ok((select staff_id = :ari::uuid from public.master_schedules where id = '00000000-0000-0000-0000-000000018051'),
  '... and the pet routine made for her is Ari''s');
select pg_temp.ok((select prosrc like '%Other staff phones stay signed in%' and prosrc like '%HP staf lain tetap masuk%'
                          and prosrc not like '%before you share it%' and prosrc not like '%sebelum dibagikan%'
                     from pg_proc where oid = 'public.archive_staff_profile(uuid, uuid)'::regprocedure),
  'the owners'' push no longer asks them to share the new code');

-- The one-argument call older app builds make still works, and gives to Anyone.
update public.household_tasks set assigned_to = :ari::uuid, status = 'pending' where id = '00000000-0000-0000-0000-000000018072';
select pg_temp.ok(pg_temp.err_as(:a1, format('select public.archive_staff_profile(%L)', :ari)) = '',
  'archive_staff_profile(staff) alone still works');
select pg_temp.ok((select assigned_to is null from public.household_tasks where id = '00000000-0000-0000-0000-000000018072'),
  '... and sends the work to Anyone, as before');
select pg_temp.ok((select count(*) = 1 from pg_proc where proname = 'archive_staff_profile' and pronamespace = 'public'::regnamespace),
  'one archive_staff_profile (the 1-argument form is gone, so calls are never ambiguous)');

-- ---- Bringing someone back -------------------------------------------------------------
-- Whether the join page would let the welcome link claim this name. Removing
-- someone rotates the house code (146), so the current one is read first.
create function pg_temp.claimable(who uuid) returns boolean language plpgsql as $$
declare v boolean; c text;
begin
  select code into c from public.household_join_codes where household_id = '00000000-0000-0000-0000-0000000180f1';
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000180b1', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select r.claimable into v from public.house_code_roster(c) r where r.id = who;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;
select pg_temp.ok(pg_temp.err_as(:a1, format('select public.restore_staff_profile(%L)', :yanti)) = '',
  'the owner brings Yanti back (added 6 months ago)');
select pg_temp.ok((select archived_at is null and claimable_from > now() - interval '1 minute' and not has_pin from public.staff_profiles where id = :yanti),
  '... claimable_from is now, and the PIN stays cleared');
select pg_temp.ok(pg_temp.claimable(:yanti),
  '... so the welcome link can claim her name again');
update public.staff_profiles set claimable_from = now() - interval '8 days' where id = :yanti;
select pg_temp.ok(not pg_temp.claimable(:yanti),
  '... for 7 days, as for someone new');
-- And the claim itself (147's check, now counting from claimable_from).
insert into public.staff_claim_links (token, household_id) values ('CLAIMQQQQQ', '00000000-0000-0000-0000-0000000180f1');
create function pg_temp.claim(who uuid) returns text language plpgsql as $$
declare r jsonb; c text;
begin
  select code into c from public.household_join_codes where household_id = '00000000-0000-0000-0000-0000000180f1';
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000180b1', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.claim_staff_with_house_code(c, who, '2468', 'CLAIMQQQQQ');
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return r ->> 'status';
end $$;
select pg_temp.ok(pg_temp.claim(:yanti) = 'not_claimable', '... after 7 days the link can''t claim her');
update public.staff_profiles set claimable_from = now() where id = :yanti;
select pg_temp.ok(pg_temp.claim(:yanti) = 'ok', '... inside the window it can, though she was added 6 months ago');
select pg_temp.ok((select has_pin from public.staff_profiles where id = :yanti), '... and she has her own PIN');
select pg_temp.ok(pg_temp.err_as(:a1, format('select public.restore_staff_profile(%L)', :yanti)) <> '',
  'restoring someone still working is refused (it would reopen their claim window; security review, PR #172)');
select pg_temp.ok(pg_temp.err_as(:p1, format('select public.restore_staff_profile(%L)', :sri)) <> '',
  'a staff phone can''t bring anyone back');
select pg_temp.ok(pg_temp.err_as(null, format('select public.restore_staff_profile(%L)', :sri)) like '%permission denied%',
  '... nor anon');

-- ---- 12 months, then "Former staff" ----------------------------------------------------
insert into public.staff_push_people (device_user_id, staff_id, household_id)
values ('00000000-0000-0000-0000-0000000180b1', :sri, '00000000-0000-0000-0000-0000000180f1');
select pg_temp.ok(pg_temp.err_as(:a1, format('select public.forget_staff_profile(%L)', :ari)) = '',
  'Remove for good: the owner forgets Ari (archived)');
select pg_temp.ok((select name = 'Mantan staf' and forgotten_at is not null and hidden_areas = '{}' and pin is null
                     from public.staff_profiles where id = :ari),
  '... the name is Mantan staf and the row is cleared');
select pg_temp.ok(pg_temp.err_as(:a1, format('select public.restore_staff_profile(%L)', :ari)) <> '',
  '... and a forgotten person can''t be brought back');
select pg_temp.ok(pg_temp.err_as(:a1, format('select public.forget_staff_profile(%L)', :yanti)) <> '',
  'someone still working can''t be forgotten');
select pg_temp.ok(pg_temp.err_as(:a1, format('select public.forget_staff_profile(%L)', :dewi)) <> '',
  '... nor an owner''s row');
select pg_temp.ok(pg_temp.err_as(:a9, format('select public.forget_staff_profile(%L)', :sri)) <> '',
  'another household''s owner can''t forget anyone here');
select pg_temp.ok(pg_temp.err_as(:p1, format('select public.forget_staff_profile(%L)', :sri)) <> '',
  '... nor a staff phone');
select pg_temp.ok(pg_temp.err_as(null, format('select public.forget_staff_profile(%L)', :sri)) like '%permission denied%',
  '... nor anon');

select pg_temp.ok(public.forget_former_staff() = 1,
  'every night: one person archived 12 months ago or more');
select pg_temp.ok((select name = 'Mantan staf' and forgotten_at is not null from public.staff_profiles where id = :wati),
  '... Wati (left 13 months ago) is Mantan staf');
select pg_temp.ok((select name = 'Sri' and forgotten_at is null from public.staff_profiles where id = :sri),
  '... Sri (left today) keeps her name');
select pg_temp.ok((select count(*) = 1 from public.staff_push_people where staff_id = :sri),
  '... and her notification choices');
select pg_temp.ok(public.forget_former_staff() = 0,
  '... and a second run finds nobody');
select pg_temp.ok((select count(*) = 1 from cron.job where jobname = 'forget-former-staff' and command = 'select public.forget_former_staff();')
                  or not exists (select 1 from pg_extension where extname = 'pg_cron'),
  'scheduled every night (when pg_cron is there)');

-- ---- Settings and grants ---------------------------------------------------------------
select pg_temp.ok(bool_and(prosecdef), 'all five are security definer')
  from pg_proc where oid in ('public.archive_staff_profile(uuid, uuid)'::regprocedure, 'public.restore_staff_profile(uuid)'::regprocedure,
                             'public.forget_staff_profile(uuid)'::regprocedure, 'public.forget_staff_row(uuid)'::regprocedure,
                             'public.forget_former_staff()'::regprocedure);
select pg_temp.ok(not exists (
    select 1 from pg_proc p, aclexplode(p.proacl) a
     where p.oid in ('public.archive_staff_profile(uuid, uuid)'::regprocedure, 'public.restore_staff_profile(uuid)'::regprocedure,
                     'public.forget_staff_profile(uuid)'::regprocedure, 'public.forget_staff_row(uuid)'::regprocedure,
                     'public.forget_former_staff()'::regprocedure,
                     'public.claim_staff_with_house_code(text, uuid, text, text)'::regprocedure, 'public.house_code_roster(text)'::regprocedure)
       and (a.grantee = 0 or a.grantee = 'anon'::regrole) and a.privilege_type = 'EXECUTE'),
  'none is callable by PUBLIC or anon');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.forget_former_staff()', 'execute')
                  and not has_function_privilege('authenticated', 'public.forget_staff_row(uuid)', 'execute'),
  'the nightly job and its helper aren''t callable from the app');
select pg_temp.ok(has_function_privilege('authenticated', 'public.archive_staff_profile(uuid, uuid)', 'execute')
                  and has_function_privilege('authenticated', 'public.restore_staff_profile(uuid)', 'execute')
                  and has_function_privilege('authenticated', 'public.forget_staff_profile(uuid)', 'execute'),
  'the owner actions are callable by signed-in users (each checks caller_admin_household)');
select pg_temp.ok(has_column_privilege('authenticated', 'public.staff_profiles', 'claimable_from', 'select')
                  and not has_column_privilege('authenticated', 'public.staff_profiles', 'claimable_from', 'update')
                  and not has_column_privilege('authenticated', 'public.staff_profiles', 'forgotten_at', 'update'),
  'the new columns are readable, written only by the functions');

rollback;
