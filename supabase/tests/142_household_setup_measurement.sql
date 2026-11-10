-- Migration 142 checks: the setup row and its writer (members only, known
-- keys, whole numbers added and capped, never negative); what was due on a
-- day and what was closed (S3); the north-star report per sign-up week
-- (S1, S2, S4, S5) with no names, emails or household ids; who may read it;
-- kakak_requests.job; the export; the grants.
-- LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/142_household_setup_measurement.sql
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
create or replace function public.queue_push(
  p_household_id uuid, p_target_role text, p_title text, p_body text,
  p_url text default '/', p_tag text default null, p_user_id uuid default null, p_exclude_user_id uuid default null
) returns boolean language plpgsql as $$ begin return true; end $$;

-- The report reads every household: start from none but ours.
delete from public.households;

create temp table d as select (now() at time zone 'Asia/Jakarta')::date as today;
create function pg_temp.today() returns date language sql as $$ select today from pg_temp.d $$;
-- A Jakarta wall-clock moment, n days back.
create function pg_temp.at(days_back int, h int, m int default 0) returns timestamptz language sql as $$
  select ((pg_temp.today() - days_back) + make_time(h, m, 0)) at time zone 'Asia/Jakarta' $$;

-- ---- Households ----------------------------------------------------------------------
-- f1: owner a1, made 30 days ago at 08.00, after asking for access at 06.00.
--     Sari (s1) added an hour later; staff phone p1. Two rooms in week 1.
-- f2: owner a9, made 25 days ago (no request: a platform admin's own).
-- pa: a platform admin with no household.
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, anon, now(), now()
from (values
  ('00000000-0000-0000-0000-0000000142a1', 'one142@test.local', false),
  ('00000000-0000-0000-0000-0000000142a9', 'nine142@test.local', false),
  ('00000000-0000-0000-0000-0000000142aa', 'admin142@test.local', false),
  ('00000000-0000-0000-0000-0000000142b1', null, true)
) as u(id, email, anon);
insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000142aa');
insert into public.households (id, name, owner_auth_id, created_at) values
  ('00000000-0000-0000-0000-0000000142f1', 'Rumah Melati', '00000000-0000-0000-0000-0000000142a1', pg_temp.at(30, 8)),
  ('00000000-0000-0000-0000-0000000142f2', 'Rumah Kenanga', '00000000-0000-0000-0000-0000000142a9', pg_temp.at(25, 9));
insert into public.household_access_requests (user_id, status, requested_at, decided_at) values
  ('00000000-0000-0000-0000-0000000142a1', 'approved', pg_temp.at(30, 6), pg_temp.at(30, 7));
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000142f1', '00000000-0000-0000-0000-0000000142a1', 'owner'),
  ('00000000-0000-0000-0000-0000000142f2', '00000000-0000-0000-0000-0000000142a9', 'owner');
insert into public.device_sessions (user_id, household_id) values
  ('00000000-0000-0000-0000-0000000142b1', '00000000-0000-0000-0000-0000000142f1');
insert into public.staff_profiles (id, household_id, name, created_at) values
  ('00000000-0000-0000-0000-0000000142c1', '00000000-0000-0000-0000-0000000142f1', 'Sari', pg_temp.at(30, 9));
insert into public.household_locations (household_id, name, kind, created_at) values
  ('00000000-0000-0000-0000-0000000142f1', 'Dapur', 'room', pg_temp.at(30, 9)),
  ('00000000-0000-0000-0000-0000000142f1', 'Teras', 'room', pg_temp.at(29, 9));

\set a1 '''00000000-0000-0000-0000-0000000142a1'''
\set a9 '''00000000-0000-0000-0000-0000000142a9'''
\set pa '''00000000-0000-0000-0000-0000000142aa'''
\set p1 '''00000000-0000-0000-0000-0000000142b1'''
\set f1 '''00000000-0000-0000-0000-0000000142f1'''

-- ---- The writer ----------------------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:a1, format(
  $q$ select public.record_household_setup(%L, jsonb_build_object(
        'active_seconds', 300, 'typed_fields', 4, 'path', 'template', 'home_type', 'garden',
        'started_at', %L, 'rooms_added', 1)) $q$, :f1, pg_temp.at(30, 9))) = '',
  'the owner records their own household');
select pg_temp.ok((select active_seconds = 300 and typed_fields = 4 and path = 'template' and home_type = 'garden'
                          and run_by = 'owner' and rooms_added = 1 and started_at = pg_temp.at(30, 9)
                     from public.household_setup where household_id = :f1::uuid),
  '... and the row says so (run_by defaults to owner)');
select pg_temp.ok(pg_temp.err_as(:a1, format(
  $q$ select public.record_household_setup(%L, jsonb_build_object(
        'active_seconds', 120, 'started_at', %L, 'finished_at', %L)) $q$,
  :f1, pg_temp.at(30, 10), pg_temp.at(30, 11))) = '', 'a second screen adds its share');
select pg_temp.ok((select active_seconds = 420 and typed_fields = 4 and path = 'template'
                          and started_at = pg_temp.at(30, 9) and finished_at = pg_temp.at(30, 11)
                     from public.household_setup where household_id = :f1::uuid),
  '... numbers add up, the first start stays, untouched fields stay');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.record_household_setup(%L, '{"voice_notes": 100000}') $q$, :f1)) = '',
  '100,000 at once is allowed');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.record_household_setup(%L, '{"voice_notes": 7}') $q$, :f1)) = '',
  '... and 7 more is accepted');
select pg_temp.ok((select voice_notes = 100000 from public.household_setup where household_id = :f1::uuid),
  '... but the total stops at 100,000');

select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.record_household_setup(%L, '{"typed_fields": 1, "names": 1}') $q$, :f1))
                  like '%unknown_field%', 'an unknown key is refused');
select pg_temp.ok((select typed_fields = 4 from public.household_setup where household_id = :f1::uuid),
  '... and the whole call with it');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.record_household_setup(%L, '{"typed_fields": -1}') $q$, :f1))
                  like '%invalid_value%', 'a negative number is refused');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.record_household_setup(%L, '{"typed_fields": 1.5}') $q$, :f1))
                  like '%invalid_value%', 'so is a fraction');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.record_household_setup(%L, '{"typed_fields": "3"}') $q$, :f1))
                  like '%invalid_value%', 'and a number as text');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.record_household_setup(%L, '{"typed_fields": 100001}') $q$, :f1))
                  like '%invalid_value%', 'and more than 100,000 at once');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.record_household_setup(%L, '{"home_type": "castle"}') $q$, :f1))
                  like '%invalid_value%', 'an unknown home type is refused');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.record_household_setup(%L, '{"path": null}') $q$, :f1))
                  like '%invalid_value%', 'a null is refused');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.record_household_setup(%L, '{"finished_at": "soon"}') $q$, :f1))
                  like '%invalid_value%', 'a time that isn''t one is refused');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.record_household_setup(%L, jsonb_build_object('finished_at', %L)) $q$,
                                            :f1, now() + interval '2 days')) like '%invalid_value%',
  'a time in the future is refused');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.record_household_setup(%L, jsonb_build_object('started_at', %L)) $q$,
                                            :f1, pg_temp.at(40, 8))) like '%invalid_value%',
  'and one long before the household existed');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.record_household_setup(%L, '[1]') $q$, :f1))
                  like '%invalid_fields%', 'a list instead of an object is refused');

select pg_temp.ok(pg_temp.err_as(:a9, format($q$ select public.record_household_setup(%L, '{"typed_fields": 1}') $q$, :f1))
                  like '%members_only%', 'another household''s owner is refused');
select pg_temp.ok(pg_temp.err_as(:pa, format($q$ select public.record_household_setup(%L, '{"typed_fields": 1}') $q$, :f1))
                  like '%members_only%', 'so is a platform admin who isn''t a member');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.record_household_setup(%L, '{"typed_fields": 1}') $q$, :f1))
                  like '%not_authenticated%', 'a staff phone (anonymous) is refused');
select pg_temp.ok(pg_temp.err_as(null, format($q$ select public.record_household_setup(%L, '{"typed_fields": 1}') $q$, :f1))
                  like '%permission denied%', 'anon can''t call it at all');
select pg_temp.ok(pg_temp.err_as(:a1, 'select * from public.household_setup') like '%permission denied%',
  'no client reads the table directly');
select pg_temp.ok((select typed_fields = 4 from public.household_setup where household_id = :f1::uuid),
  'none of those changed anything');

-- ---- What was due yesterday, and what was closed (S3) ---------------------------------
-- k1 daily from 5 days ago: yesterday's written day is done. k2 a one-off
-- yesterday, marked couldn't. k3 a one-off yesterday, still open. k4
-- cancelled. k5 Sari's one-off yesterday, while she was on leave with her
-- chores paused. Mochi: food at 08.00 and 18.00, logged at 08.05 only.
insert into public.household_tasks (id, household_id, title, recurrence, due_date, status, assigned_to, created_at) values
  ('00000000-0000-0000-0000-0000000142d1', :f1, 'Sapu', 'daily', pg_temp.today() - 5, 'pending', null, now() - interval '6 days'),
  ('00000000-0000-0000-0000-0000000142d2', :f1, 'Pel', 'none', pg_temp.today() - 1, 'pending', null, now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000142d3', :f1, 'Kaca', 'none', pg_temp.today() - 1, 'pending', null, now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000142d4', :f1, 'Batal', 'none', pg_temp.today() - 1, 'cancelled', null, now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000142d5', :f1, 'Cuci', 'none', pg_temp.today() - 1, 'pending',
   '00000000-0000-0000-0000-0000000142c1', now() - interval '2 days');
insert into public.household_tasks (household_id, title, parent_task_id, due_date, status, completed_by, completed_at,
                                    before_photo_url, after_photo_url, created_at)
values (:f1, 'Sapu', '00000000-0000-0000-0000-0000000142d1', pg_temp.today() - 1, 'completed',
        '00000000-0000-0000-0000-0000000142c1', pg_temp.at(1, 9), 'x/b.jpg', 'x/a.jpg', now() - interval '1 day');
insert into public.task_exceptions (household_id, chore_id, occurs_on, reason)
values (:f1, '00000000-0000-0000-0000-0000000142d2', pg_temp.today() - 1, 'out_of_stock');
insert into public.leave_requests (household_id, staff_id, start_date, end_date, status, fallback_action)
values (:f1, '00000000-0000-0000-0000-0000000142c1', pg_temp.today() - 1, pg_temp.today() - 1, 'approved', 'pause');
insert into public.task_entities (id, household_id, entity_type, name, created_at)
values ('00000000-0000-0000-0000-0000000142e1', :f1, 'pet', 'Mochi', now() - interval '3 days');
insert into public.master_schedules (id, entity_id, title, module, frequency_type, fixed_times, is_active, created_at)
values ('00000000-0000-0000-0000-000000014201', '00000000-0000-0000-0000-0000000142e1', 'Makan', 'pet', 'fixed_time',
        array['08:00'::time, '18:00'::time], true, now() - interval '3 days');
insert into public.task_logs (schedule_id, entity_id, module, completed_at, staff_id)
values ('00000000-0000-0000-0000-000000014201', '00000000-0000-0000-0000-0000000142e1', 'pet', pg_temp.at(1, 8, 5),
        '00000000-0000-0000-0000-0000000142c1');

select pg_temp.ok((select due = 5 and closed = 3 from public.north_star_day(pg_temp.today() - 1) where household_id = :f1::uuid),
  'yesterday: 3 chores and 2 routine slots due (not the cancelled one, not Sari''s paused one); 3 closed');
select pg_temp.ok((select due = 3 and closed = 0 from public.north_star_day(pg_temp.today() - 2) where household_id = :f1::uuid),
  'the day before: the daily chore and both slots, none closed');
select pg_temp.ok(not exists (select 1 from public.north_star_day(pg_temp.today() - 1) where household_id <> :f1::uuid),
  'a household with nothing due isn''t listed');

-- ---- Staff finishes, Kakak use --------------------------------------------------------
-- f1: Sari's first finish 2 hours after the household was made (same day);
-- three more in week 4 (days 21–27): one roster member, three finishes.
insert into public.household_tasks (household_id, title, due_date, status, completed_by, completed_at,
                                    before_photo_url, after_photo_url, created_at)
select :f1::uuid, 'Selesai', pg_temp.today() - back, 'completed', '00000000-0000-0000-0000-0000000142c1'::uuid,
       pg_temp.at(back, 10), 'x/b.jpg', 'x/a.jpg', pg_temp.at(back, 9)
from (values (30), (8), (7), (6)) as v(back);
-- f1: three quick Kakak requests in week 3 (and earlier, so she was tried).
-- f2: two quick and one setup request in week 3: tried, not a repeat.
insert into public.kakak_requests (household_id, user_id, created_at, job) values
  (:f1, :a1, pg_temp.at(15, 9), 'quick'), (:f1, :a1, pg_temp.at(15, 10), 'quick'), (:f1, :a1, pg_temp.at(14, 9), 'quick'),
  ('00000000-0000-0000-0000-0000000142f2', :a9, pg_temp.at(10, 9), 'quick'),
  ('00000000-0000-0000-0000-0000000142f2', :a9, pg_temp.at(9, 9), 'quick'),
  ('00000000-0000-0000-0000-0000000142f2', :a9, pg_temp.at(8, 9), 'setup');

-- f2 started setup and left half-way: not counted in the setup medians.
insert into public.household_setup (household_id, started_at, active_seconds, typed_fields)
values ('00000000-0000-0000-0000-0000000142f2', pg_temp.at(25, 10), 20, 0);
-- A room stamped before f1 existed (old or imported data) isn't "added by hand".
insert into public.household_locations (household_id, name, kind, created_at)
values (:f1, 'Gudang', 'room', pg_temp.at(31, 9));

-- ---- The report ------------------------------------------------------------------------
create temp table r as select public.north_star_report(8) as j;
select pg_temp.ok((select (j #>> '{summary,households}')::int = 2 from r), 'two households in the window');
select pg_temp.ok((select (j #>> '{summary,first_finish_minutes}')::numeric = 120 from r),
  'S1: the first staff finish came 120 minutes after the household was made');
select pg_temp.ok((select (j #>> '{summary,same_day}')::int = 1 and (j #>> '{summary,same_day_of}')::int = 2 from r),
  '... on the same day, for one of two');
select pg_temp.ok((select (j #>> '{summary,signup_minutes}')::numeric = 120 from r),
  'the wait from asking to the household: 120 minutes');
select pg_temp.ok((select (j #>> '{summary,setup_households}')::int = 1 and (j #>> '{summary,setup_minutes}')::numeric = 7
                          and (j #>> '{summary,typed_fields}')::numeric = 4 from r),
  'setup: one finished household, 7 active minutes, 4 typed fields (f2''s unfinished one isn''t counted)');
select pg_temp.ok((select (j #>> '{summary,hand_items_14d}')::numeric = 1.5 and (j #>> '{summary,hand_items_14d_of}')::int = 2 from r),
  'S2 before: f1 added 4 by hand in 14 days (2 rooms, Sari, a chore; not the older room) less 1 from setup, f2 none; the median is 1.5');
select pg_temp.ok((select (j #>> '{summary,s4_active}')::int = 1 and (j #>> '{summary,s4_of}')::int = 1 from r),
  'S4: f1 is active in week 4; f2 is too young to count');
select pg_temp.ok((select (j #>> '{summary,s5_repeat}')::int = 1 and (j #>> '{summary,s5_of}')::int = 2 from r),
  'S5: both tried Kakak; only f1 came back 3 times (setup requests don''t count)');
select pg_temp.ok((select (j #>> '{summary,s3_due}')::int = 15 and (j #>> '{summary,s3_closed}')::int = 5 from r),
  'S3, last 7 days: 5 daily chores, 2 open one-offs, Sari''s 2 finished ones and 6 slots due; 5 closed');
select pg_temp.ok((select jsonb_array_length(j -> 'weeks') = 8
                          and (j #>> '{weeks,0,week_start}')::date = pg_temp.today() - (extract(isodow from pg_temp.today())::int - 1)
                     from r),
  'eight weeks, newest first, each starting on a Monday');
select pg_temp.ok((select sum((w ->> 'households')::int) = 2 from r, jsonb_array_elements(j -> 'weeks') w),
  'each household in exactly one week');
select pg_temp.ok((select (w #>> '{paths,template}')::int = 1 from r, jsonb_array_elements(j -> 'weeks') w
                    where (w ->> 'setup_households')::int = 1),
  'its week shows the template path');
select pg_temp.ok((select j::text !~* '(melati|kenanga|sari|mochi|@test\.local|0000000142)' from r),
  'no names, emails or ids anywhere in it');
select pg_temp.ok((select jsonb_array_length(public.north_star_report(99) -> 'weeks') = 26
                          and jsonb_array_length(public.north_star_report(0) -> 'weeks') = 1),
  'weeks are kept between 1 and 26');

-- ---- Who may read it --------------------------------------------------------------------
select pg_temp.ok((select (pg_temp.json_as(:pa, 'select public.platform_north_star(8)') #>> '{summary,households}')::int = 2),
  'a platform admin reads the report');
select pg_temp.ok(pg_temp.err_as(:a1, 'select public.platform_north_star(8)') like '%platform_admins_only%',
  'an owner is refused');
select pg_temp.ok(pg_temp.err_as(:p1, 'select public.platform_north_star(8)') like '%platform_admins_only%',
  'a staff phone is refused');
select pg_temp.ok(pg_temp.err_as(null, 'select public.platform_north_star(8)') like '%permission denied%',
  'anon can''t call it');
select pg_temp.ok(pg_temp.err_as(:pa, 'select public.north_star_report(8)') like '%permission denied%',
  'nobody calls the internal report from the app, not even a platform admin');
select pg_temp.ok(pg_temp.err_as(:pa, format('select * from public.north_star_day(%L)', pg_temp.today() - 1))
                  like '%permission denied%', '... nor the day counts');

-- ---- kakak_requests.job -----------------------------------------------------------------
insert into public.kakak_requests (id, household_id) values ('00000000-0000-0000-0000-00000014200a', :f1);
select pg_temp.ok((select job = 'quick' from public.kakak_requests where id = '00000000-0000-0000-0000-00000014200a'),
  'a request is quick unless it says otherwise');
select pg_temp.ok((select pg_get_constraintdef(oid) like '%quick%setup%' from pg_constraint
                     where conname = 'kakak_requests_job_check' and conrelid = 'public.kakak_requests'::regclass),
  'the job check lists quick and setup');
do $$ begin
  insert into public.kakak_requests (household_id, job) values ('00000000-0000-0000-0000-0000000142f1', 'other');
  raise exception 'FAIL: an unknown job was accepted';
exception when check_violation then null;
end $$;
select 'ok  an unknown job is refused';

-- ---- The export ---------------------------------------------------------------------------
select pg_temp.ok((select (j #>> '{setup,typed_fields}')::int = 4 and (j #>> '{setup,path}') = 'template'
                          and not (j -> 'setup') ? 'household_id'
                          and j ? 'staff_notifications' and (j #>> '{my_notifications}') is not null
                     from (select pg_temp.json_as(:a1, 'select public.export_household_data()') as j) x),
  'the export carries the setup counts, and keeps 141''s staff notifications');
select pg_temp.ok((select (j #>> '{setup,finished_at}') is null and (j #>> '{setup,active_seconds}')::int = 20
                     from (select pg_temp.json_as(:a9, 'select public.export_household_data()') as j) x),
  'f2 exports its own unfinished row');
select pg_temp.ok(pg_temp.err_as(:p1, 'select public.export_household_data()') like '%admins_only%',
  'a staff phone still can''t export');

-- ---- Grants ---------------------------------------------------------------------------------
select pg_temp.ok(not has_function_privilege('anon', 'public.record_household_setup(uuid, jsonb)', 'execute')
                  and not has_function_privilege('anon', 'public.platform_north_star(integer)', 'execute')
                  and not has_function_privilege('anon', 'public.north_star_report(integer)', 'execute')
                  and not has_function_privilege('anon', 'public.north_star_day(date)', 'execute')
                  and not has_function_privilege('anon', 'public.export_household_data()', 'execute'),
  'anon executes none of them');
select pg_temp.ok(has_function_privilege('authenticated', 'public.record_household_setup(uuid, jsonb)', 'execute')
                  and has_function_privilege('authenticated', 'public.platform_north_star(integer)', 'execute')
                  and not has_function_privilege('authenticated', 'public.north_star_report(integer)', 'execute')
                  and not has_function_privilege('authenticated', 'public.north_star_day(date)', 'execute'),
  'authenticated gets the writer and the guarded report only');
select pg_temp.ok(has_function_privilege('service_role', 'public.north_star_report(integer)', 'execute'),
  'service_role may read the report');
select pg_temp.ok(not has_table_privilege('authenticated', 'public.household_setup', 'select')
                  and not has_table_privilege('anon', 'public.household_setup', 'select')
                  and (select relrowsecurity from pg_class where oid = 'public.household_setup'::regclass),
  'the table: RLS on, no client grants');
select pg_temp.ok((select prosecdef and proconfig @> array['search_path=""']
                     from pg_proc where oid = 'public.record_household_setup(uuid, jsonb)'::regprocedure)
                  and (select prosecdef and proconfig @> array['search_path=""']
                     from pg_proc where oid = 'public.platform_north_star(integer)'::regprocedure),
  'both definer functions pin an empty search_path');

-- ---- A household made today that already has a first finish (review fix) -------------------
insert into public.households (id, name, created_at)
values ('00000000-0000-0000-0000-0000000142f3', 'Rumah Anggrek', (pg_temp.today() + time '00:00') at time zone 'Asia/Jakarta');
insert into public.staff_profiles (id, household_id, name)
values ('00000000-0000-0000-0000-0000000142c3', '00000000-0000-0000-0000-0000000142f3', 'Wati');
insert into public.household_tasks (household_id, title, due_date, status, completed_by, completed_at, before_photo_url, after_photo_url)
values ('00000000-0000-0000-0000-0000000142f3', 'Sapu', pg_temp.today(), 'completed', '00000000-0000-0000-0000-0000000142c3',
        now(), 'x/b.jpg', 'x/a.jpg');
select pg_temp.ok((select (j #>> '{summary,same_day}')::int = 2 and (j #>> '{summary,same_day_of}')::int = 3
                     from (select public.north_star_report(8) as j) x),
  'a household made today with a first finish counts on both sides: 2 of 3, never more than all');

-- ---- Interval routines and an off-pattern written day (review fix) --------------------------
-- Potty every 4 hours 08.00–16.00 (3 slots), logged at 12.05 yesterday; a
-- routine with a zero interval has no slots and breaks nothing; a weekly
-- chore from 8 days ago (due yesterday, open) with a written day 2 days
-- ago, off its pattern, done.
insert into public.master_schedules (entity_id, title, module, frequency_type, start_time, end_time, interval_hours, is_active, created_at)
values ('00000000-0000-0000-0000-0000000142e1', 'Pipis', 'pet', 'interval', '08:00', '16:00', 4, true, now() - interval '3 days'),
       ('00000000-0000-0000-0000-0000000142e1', 'Rusak', 'pet', 'interval', '08:00', '16:00', 0, true, now() - interval '3 days');
insert into public.task_logs (schedule_id, entity_id, module, completed_at)
select id, entity_id, 'pet', pg_temp.at(1, 12, 5) from public.master_schedules where title = 'Pipis'
   and entity_id = '00000000-0000-0000-0000-0000000142e1';
insert into public.household_tasks (id, household_id, title, recurrence, due_date, status, created_at)
values ('00000000-0000-0000-0000-0000000142d6', :f1, 'Kaca jendela', 'weekly', pg_temp.today() - 8, 'pending', now() - interval '9 days');
insert into public.household_tasks (household_id, title, parent_task_id, due_date, status, completed_at, before_photo_url, after_photo_url)
values (:f1, 'Kaca jendela', '00000000-0000-0000-0000-0000000142d6', pg_temp.today() - 2, 'completed', pg_temp.at(2, 9),
        'x/b.jpg', 'x/a.jpg');
select pg_temp.ok((select due = 9 and closed = 4 from public.north_star_day(pg_temp.today() - 1) where household_id = :f1::uuid),
  'yesterday adds 3 interval slots (1 closed) and the weekly chore (open): 9 due, 4 closed');
select pg_temp.ok((select due = 7 and closed = 1 from public.north_star_day(pg_temp.today() - 2) where household_id = :f1::uuid),
  'two days ago adds 3 open slots and the written day off the pattern (done): 7 due, 1 closed');

-- ---- Deleted with the household -------------------------------------------------------------
delete from public.households where id = :f1::uuid;
select pg_temp.ok(not exists (select 1 from public.household_setup where household_id = :f1::uuid),
  'the setup row goes with its household');

rollback;
