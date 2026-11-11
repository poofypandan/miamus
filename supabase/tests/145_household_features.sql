-- Migration 145 checks: feature switches (no row = on; owners only; staff
-- phones read but never write; unknown features and null refused), the four
-- pushes that respect them (and that everything else still sends), grants.
-- LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/145_household_features.sql
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
-- A count read as a session.
create function pg_temp.count_as(uid uuid, stmt text) returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute stmt into n;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return n;
end $$;

-- Pushes captured instead of sent (replaced for this transaction only).
create temp table pushes (household_id uuid, title text, body text);
grant all on pushes to public;
create or replace function public.queue_push(
  p_household_id uuid, p_target_role text, p_title text, p_body text,
  p_url text default '/', p_tag text default null, p_user_id uuid default null, p_exclude_user_id uuid default null
) returns boolean language plpgsql as $$
begin
  insert into pg_temp.pushes values (p_household_id, p_title, p_body);
  return true;
end $$;
create or replace function public.queue_owner_push(
  p_household_id uuid, p_title_en text, p_body_en text, p_title_id text, p_body_id text,
  p_url text default '/', p_tag text default null, p_exclude_user_id uuid default null
) returns boolean language plpgsql as $$
begin
  insert into pg_temp.pushes values (p_household_id, p_title_en, p_body_en);
  return true;
end $$;

-- ---- Households ----------------------------------------------------------------------
-- f1: owner a1, staff phone p1, Sari (s1). f2: owner a9.
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, anon, now(), now()
from (values
  ('00000000-0000-0000-0000-0000000145a1', 'one145@test.local', false),
  ('00000000-0000-0000-0000-0000000145a9', 'nine145@test.local', false),
  ('00000000-0000-0000-0000-0000000145b1', null, true)
) as u(id, email, anon);
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000145f1', 'Rumah Melati', '00000000-0000-0000-0000-0000000145a1'),
  ('00000000-0000-0000-0000-0000000145f2', 'Rumah Kenanga', '00000000-0000-0000-0000-0000000145a9');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000145f1', '00000000-0000-0000-0000-0000000145a1', 'owner'),
  ('00000000-0000-0000-0000-0000000145f2', '00000000-0000-0000-0000-0000000145a9', 'owner');
insert into public.device_sessions (user_id, household_id) values
  ('00000000-0000-0000-0000-0000000145b1', '00000000-0000-0000-0000-0000000145f1');
insert into public.staff_profiles (id, household_id, name) values
  ('00000000-0000-0000-0000-0000000145c1', '00000000-0000-0000-0000-0000000145f1', 'Sari');
-- Both owners have a phone set up for notifications (notify_chores_due needs one).
insert into public.push_subscriptions (household_id, user_id, subscription)
select h, u, jsonb_build_object('endpoint', 'https://fcm.googleapis.com/fcm/send/' || u, 'keys', jsonb_build_object('p256dh', 'k', 'auth', 'a'))
from (values
  ('00000000-0000-0000-0000-0000000145f1'::uuid, '00000000-0000-0000-0000-0000000145a1'::uuid),
  ('00000000-0000-0000-0000-0000000145f2'::uuid, '00000000-0000-0000-0000-0000000145a9'::uuid)
) as s(h, u);

\set a1 '''00000000-0000-0000-0000-0000000145a1'''
\set a9 '''00000000-0000-0000-0000-0000000145a9'''
\set p1 '''00000000-0000-0000-0000-0000000145b1'''
\set f1 '''00000000-0000-0000-0000-0000000145f1'''
\set f2 '''00000000-0000-0000-0000-0000000145f2'''

-- ---- Defaults ------------------------------------------------------------------------
select pg_temp.ok(public.household_feature_defaults() = '{"repairs": true, "bills": true, "food": true}'::jsonb,
  'the defaults: repairs, bills and food on');
select pg_temp.ok(public.household_feature_on(:f1, 'repairs') and public.household_feature_on(:f1, 'bills')
                  and public.household_feature_on(:f1, 'food'),
  'no row = on, for each of the three');
select pg_temp.ok(not public.household_feature_on(:f1, 'closet'), 'an unknown feature reads as off');

-- ---- The writer ----------------------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.set_household_feature(%L, 'repairs', false) $q$, :f1)) = '',
  'the owner switches Repairs off');
select pg_temp.ok(not public.household_feature_on(:f1, 'repairs') and public.household_feature_on(:f1, 'food'),
  '... it reads off; the others stay on');
select pg_temp.ok((select set_by = :a1::uuid and set_at is not null from public.household_features
                    where household_id = :f1::uuid and feature = 'repairs'),
  '... with who and when');
select pg_temp.ok(not public.household_feature_on(:f1, 'repairs') and public.household_feature_on(:f2, 'repairs'),
  '... only for that household');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.set_household_feature(%L, 'repairs', true) $q$, :f1)) = '',
  'and back on');
select pg_temp.ok(public.household_feature_on(:f1, 'repairs')
                  and (select count(*) = 1 from public.household_features where household_id = :f1::uuid),
  '... one row per feature, updated in place');

select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.set_household_feature(%L, 'food', false) $q$, :f1))
                  like '%not_admin%', 'a staff phone of that household is refused');
select pg_temp.ok(pg_temp.err_as(:a9, format($q$ select public.set_household_feature(%L, 'food', false) $q$, :f1))
                  like '%not_admin%', 'another household''s owner is refused');
select pg_temp.ok(pg_temp.err_as(null, format($q$ select public.set_household_feature(%L, 'food', false) $q$, :f1))
                  like '%permission denied%', 'anon cannot even call it');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.set_household_feature(%L, 'closet', false) $q$, :f1))
                  like '%unknown_feature%', 'an unknown feature is refused');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.set_household_feature(%L, null, false) $q$, :f1))
                  like '%unknown_feature%', 'so is no feature');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.set_household_feature(%L, 'food', null) $q$, :f1))
                  like '%bad_value%', 'and a null switch');
select pg_temp.ok(public.household_feature_on(:f1, 'food'), '... none of them changed anything');

select pg_temp.ok(pg_temp.err_as(:a1, format($q$ insert into public.household_features (household_id, feature, enabled)
                                                 values (%L, 'food', false) $q$, :f1)) like '%permission denied%',
  'no direct writes, even for the owner');

-- ---- Reads ---------------------------------------------------------------------------
select public.set_household_feature(:f1, 'food', false)
  from (select set_config('request.jwt.claims', json_build_object('sub', :a1::uuid, 'role', 'authenticated')::text, true)) s;
select pg_temp.ok(pg_temp.count_as(:p1, 'select count(*) from public.household_features where enabled = false') = 1,
  'the household''s staff phone reads the switch (to hide its buttons)');
select pg_temp.ok(pg_temp.count_as(:a9, 'select count(*) from public.household_features') = 0,
  'another household''s owner reads nothing');
select pg_temp.ok(pg_temp.err_as(null, 'select count(*) from public.household_features') like '%permission denied%',
  'anon reads nothing');

-- ---- Pushes --------------------------------------------------------------------------
-- f1: Food off (above), Bills off, Repairs off. f2: everything on.
select public.set_household_feature(:f1, 'bills', false), public.set_household_feature(:f1, 'repairs', false)
  from (select set_config('request.jwt.claims', json_build_object('sub', :a1::uuid, 'role', 'authenticated')::text, true)) s;
select set_config('request.jwt.claims', '', true);

-- Chores with a reminder today: a bill and a cleaning chore in each household.
insert into public.household_tasks (household_id, title, category, due_date, remind_days_before) values
  (:f1, 'Bayar listrik', 'bill', (now() at time zone 'Asia/Jakarta')::date, 0),
  (:f1, 'Sapu teras', 'cleaning', (now() at time zone 'Asia/Jakarta')::date, 0),
  (:f2, 'Bayar air', 'bill', (now() at time zone 'Asia/Jakarta')::date, 0),
  (:f2, 'Siram tanaman', 'cleaning', (now() at time zone 'Asia/Jakarta')::date, 0);
truncate pushes;
select public.notify_chores_due();
select pg_temp.ok((select body from pushes where household_id = :f1::uuid) like '%Sapu teras%'
                  and (select body from pushes where household_id = :f1::uuid) not like '%Bayar listrik%',
  'Bills off: the morning reminder leaves out the bill, keeps the other chore');
select pg_temp.ok((select body from pushes where household_id = :f2::uuid) like '%Bayar air%'
                  and (select body from pushes where household_id = :f2::uuid) like '%Siram tanaman%',
  'Bills on: both');
-- The evening summary's chores (chore_days_open, re-created from 139).
select pg_temp.ok((select array_agg(title order by title) from public.chore_days_open((now() at time zone 'Asia/Jakarta')::date)
                    where household_id = :f1::uuid) = array['Sapu teras'],
  'Bills off: the evening summary leaves out the open bill, keeps the other chore');
select pg_temp.ok((select array_agg(title order by title) from public.chore_days_open((now() at time zone 'Asia/Jakarta')::date)
                    where household_id = :f2::uuid) = array['Bayar air', 'Siram tanaman'],
  'Bills on: both are still open in the summary');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.chore_days_open(date)', 'execute')
                  and has_function_privilege('service_role', 'public.chore_days_open(date)', 'execute'),
  'chore_days_open keeps its grants');

-- Food to eat today, in both households.
insert into public.food_items (household_id, name, expires_on) values
  (:f1, 'Rendang', (now() at time zone 'Asia/Jakarta')::date),
  (:f2, 'Opor', (now() at time zone 'Asia/Jakarta')::date);
truncate pushes;
select public.notify_food_expiring();
select pg_temp.ok((select count(*) from pushes where household_id = :f1::uuid) = 0
                  and (select count(*) from pushes where household_id = :f2::uuid) = 1,
  'Food off: no morning food push; Food on: one');

-- Food from a staff phone: saved either way, a push only with Food on.
truncate pushes;
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ insert into public.food_items (household_id, name) values (%L, 'Kue dari tetangga') $q$, :f1)) = '',
  'Food off: a staff phone can still save food (off hides, never locks)');
select pg_temp.ok((select count(*) from pushes) = 0, '... without a push to the owner');
select public.set_household_feature(:f1, 'food', true)
  from (select set_config('request.jwt.claims', json_build_object('sub', :a1::uuid, 'role', 'authenticated')::text, true)) s;
select set_config('request.jwt.claims', '', true);
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ insert into public.food_items (household_id, name) values (%L, 'Martabak') $q$, :f1)) = '',
  'Food back on: saved');
select pg_temp.ok((select count(*) from pushes where body like '%Martabak%') = 1, '... and the owner is told');

-- An urgent repair from a staff phone: saved either way, a push only with Repairs on.
truncate pushes;
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ insert into public.repairs (household_id, title, urgent, status, reported_by_staff) values (%L, 'Pipa bocor', true, 'reported', '00000000-0000-0000-0000-0000000145c1') $q$, :f1)) = '',
  'Repairs off: an urgent report from a stale screen is still saved');
select pg_temp.ok((select count(*) from pushes) = 0, '... without a push');
select public.set_household_feature(:f1, 'repairs', true)
  from (select set_config('request.jwt.claims', json_build_object('sub', :a1::uuid, 'role', 'authenticated')::text, true)) s;
select set_config('request.jwt.claims', '', true);
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ insert into public.repairs (household_id, title, urgent, status, reported_by_staff) values (%L, 'Lampu mati', true, 'reported', '00000000-0000-0000-0000-0000000145c1') $q$, :f1)) = '',
  'Repairs back on: saved');
select pg_temp.ok((select count(*) from pushes where body like '%Lampu mati%') = 1, '... and the urgent push goes');

-- ---- Grants --------------------------------------------------------------------------
select pg_temp.ok(not has_function_privilege('anon', 'public.set_household_feature(uuid, text, boolean)', 'execute')
                  and not has_function_privilege('anon', 'public.household_feature_on(uuid, text)', 'execute')
                  and not has_function_privilege('anon', 'public.household_feature_defaults()', 'execute'),
  'anon executes none of the new functions');
select pg_temp.ok(has_function_privilege('authenticated', 'public.set_household_feature(uuid, text, boolean)', 'execute'),
  'authenticated may call the writer (the owner check is inside)');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.notify_chores_due(date)', 'execute')
                  and not has_function_privilege('authenticated', 'public.notify_food_expiring()', 'execute')
                  and not has_function_privilege('anon', 'public.notify_food_from_staff()', 'execute')
                  and not has_function_privilege('anon', 'public.notify_urgent_repair()', 'execute'),
  'the re-created push functions keep their grants');
select pg_temp.ok((select relrowsecurity from pg_class where oid = 'public.household_features'::regclass)
                  and not has_table_privilege('authenticated', 'public.household_features', 'insert')
                  and not has_table_privilege('authenticated', 'public.household_features', 'update')
                  and not has_table_privilege('authenticated', 'public.household_features', 'delete')
                  and not has_table_privilege('anon', 'public.household_features', 'select'),
  'the table: RLS on, select only for clients');

rollback;
