-- Migration 118 checks: removing someone releases their repeating chores and
-- keeps who did the first day. LOCAL DATABASE ONLY. Run from the repo root;
-- one transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/118_archive_releases_repeating_chores.sql
-- Every line printed starts with "ok"; a failure stops with "FAIL: …".
\set ON_ERROR_STOP on
\pset footer off
begin;

create function pg_temp.ok(cond boolean, label text) returns text language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  return 'ok  ' || label;
end $$;

insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000118a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin118@test.local', false, now(), now());
insert into public.households (id, name, owner_auth_id)
values ('00000000-0000-0000-0000-0000000118f1', 'Rumah 118', '00000000-0000-0000-0000-0000000118a1');
insert into public.household_members (household_id, user_id, role)
values ('00000000-0000-0000-0000-0000000118f1', '00000000-0000-0000-0000-0000000118a1', 'owner');
-- Sari leaves now (through the function); Joko left before 118 (backfill);
-- Wati stays.
insert into public.staff_profiles (id, household_id, name, archived_at) values
  ('00000000-0000-0000-0000-0000000118e1', '00000000-0000-0000-0000-0000000118f1', 'Sari', null),
  ('00000000-0000-0000-0000-0000000118e2', '00000000-0000-0000-0000-0000000118f1', 'Joko', now() - interval '10 days'),
  ('00000000-0000-0000-0000-0000000118e3', '00000000-0000-0000-0000-0000000118f1', 'Wati', null);

-- Completed chores need proof photos (104's trigger); this test is about
-- assignees, so triggers are off just for these rows.
set local session_replication_role = replica;
-- Columns: id, title, recurrence, status, assigned_to, completed_by.
insert into public.household_tasks (id, household_id, title, recurrence, status, assigned_to, completed_by, due_date)
select v.id::uuid, '00000000-0000-0000-0000-0000000118f1', v.title, v.recurrence, v.status,
       v.assigned::uuid, v.done_by::uuid, current_date - 3
  from (values
    -- Sari's
    ('00000000-0000-0000-0000-00000001180a', 'S daily, first day done, no completed_by', 'daily',   'completed', '00000000-0000-0000-0000-0000000118e1', null),
    ('00000000-0000-0000-0000-00000001180b', 'S weekly, first day done by Wati',          'weekly',  'completed', '00000000-0000-0000-0000-0000000118e1', '00000000-0000-0000-0000-0000000118e3'),
    ('00000000-0000-0000-0000-00000001180c', 'S monthly, pending',                        'monthly', 'pending',   '00000000-0000-0000-0000-0000000118e1', null),
    ('00000000-0000-0000-0000-00000001180d', 'S one-off, done',                           'none',    'completed', '00000000-0000-0000-0000-0000000118e1', '00000000-0000-0000-0000-0000000118e1'),
    ('00000000-0000-0000-0000-00000001180e', 'S daily, cancelled',                        'daily',   'cancelled', '00000000-0000-0000-0000-0000000118e1', null),
    ('00000000-0000-0000-0000-00000001180f', 'S one-off, pending',                        'none',    'pending',   '00000000-0000-0000-0000-0000000118e1', null),
    -- Joko's (already archived)
    ('00000000-0000-0000-0000-00000001181a', 'J daily, first day done',                   'daily',   'completed', '00000000-0000-0000-0000-0000000118e2', null),
    ('00000000-0000-0000-0000-00000001181b', 'J one-off, done',                           'none',    'completed', '00000000-0000-0000-0000-0000000118e2', '00000000-0000-0000-0000-0000000118e2'),
    -- Wati's
    ('00000000-0000-0000-0000-00000001182a', 'W daily, first day done',                   'daily',   'completed', '00000000-0000-0000-0000-0000000118e3', null)
  ) as v(id, title, recurrence, status, assigned, done_by);
set local session_replication_role = origin;

-- ---------------------------------------------------------------- backfill (re-runs 118 as written)
\i supabase/migrations/118_archive_releases_repeating_chores.sql
select pg_temp.ok((select assigned_to is null and completed_by = '00000000-0000-0000-0000-0000000118e2' from public.household_tasks where id = '00000000-0000-0000-0000-00000001181a'),
  'backfill: repeat held by someone already removed is released, first day keeps their name');
select pg_temp.ok((select assigned_to = '00000000-0000-0000-0000-0000000118e2' from public.household_tasks where id = '00000000-0000-0000-0000-00000001181b'),
  'backfill: their finished one-off is untouched');
select pg_temp.ok((select count(*) = 6 from public.household_tasks where assigned_to = '00000000-0000-0000-0000-0000000118e1'),
  'backfill: nothing of active staff touched');

-- ---------------------------------------------------------------- archiving through the function
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000118a1', 'role', 'authenticated')::text, true) \g /dev/null
select public.archive_staff_profile('00000000-0000-0000-0000-0000000118e1') \g /dev/null
reset role;

select pg_temp.ok((select assigned_to is null and completed_by = '00000000-0000-0000-0000-0000000118e1' from public.household_tasks where id = '00000000-0000-0000-0000-00000001180a'),
  'repeat whose first day is done: released, first day keeps her name');
select pg_temp.ok((select assigned_to is null and completed_by = '00000000-0000-0000-0000-0000000118e3' from public.household_tasks where id = '00000000-0000-0000-0000-00000001180b'),
  'repeat done by someone else: released, completed_by left as it was');
select pg_temp.ok((select assigned_to is null and completed_by is null from public.household_tasks where id = '00000000-0000-0000-0000-00000001180c'),
  'pending repeat: released, nobody marked as having done it');
select pg_temp.ok((select assigned_to = '00000000-0000-0000-0000-0000000118e1' from public.household_tasks where id = '00000000-0000-0000-0000-00000001180d'),
  'finished one-off: untouched (it is the record)');
select pg_temp.ok((select assigned_to = '00000000-0000-0000-0000-0000000118e1' from public.household_tasks where id = '00000000-0000-0000-0000-00000001180e'),
  'cancelled repeat: untouched');
select pg_temp.ok((select assigned_to is null from public.household_tasks where id = '00000000-0000-0000-0000-00000001180f'),
  'pending one-off: released (as in 109)');
select pg_temp.ok((select assigned_to = '00000000-0000-0000-0000-0000000118e3' from public.household_tasks where id = '00000000-0000-0000-0000-00000001182a'),
  'someone else''s repeat: untouched');
select pg_temp.ok((select archived_at is not null and pin is null and not has_pin from public.staff_profiles where id = '00000000-0000-0000-0000-0000000118e1'),
  'still archives and clears the PIN (109)');

rollback;
