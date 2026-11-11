-- Migration 147 checks: the reviewed list in one call (owners only, all or
-- nothing, nothing duplicated, limits, assignees), staff in one go (a claim
-- works once, inside 7 days, for an empty name, from a staff phone with the
-- house code), who linked today, grants.
-- LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/147_starter_templates_and_staff_claim.sql
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

-- No pushes leave this test.
create or replace function public.queue_push(
  p_household_id uuid, p_target_role text, p_title text, p_body text,
  p_url text default '/', p_tag text default null, p_user_id uuid default null, p_exclude_user_id uuid default null
) returns boolean language plpgsql as $$ begin return true; end $$;

-- ---- Households ----------------------------------------------------------------------
-- f1: owner a1, staff phones p1 and p2 (not linked yet). f2: owner a9.
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, anon, now(), now()
from (values
  ('00000000-0000-0000-0000-0000000146a1', 'one146@test.local', false),
  ('00000000-0000-0000-0000-0000000146a9', 'nine146@test.local', false),
  ('00000000-0000-0000-0000-0000000146b1', null, true),
  ('00000000-0000-0000-0000-0000000146b2', null, true),
  ('00000000-0000-0000-0000-0000000146b3', null, true)
) as u(id, email, anon);
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000146f1', 'Rumah Melati', '00000000-0000-0000-0000-0000000146a1'),
  ('00000000-0000-0000-0000-0000000146f2', 'Rumah Kenanga', '00000000-0000-0000-0000-0000000146a9');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000146f1', '00000000-0000-0000-0000-0000000146a1', 'owner'),
  ('00000000-0000-0000-0000-0000000146f2', '00000000-0000-0000-0000-0000000146a9', 'owner');
-- p3 is already a linked staff phone of f1 (passes get_user_household_ids()).
insert into public.device_sessions (user_id, household_id) values
  ('00000000-0000-0000-0000-0000000146b3', '00000000-0000-0000-0000-0000000146f1');
delete from public.household_join_codes where household_id = '00000000-0000-0000-0000-0000000146f1';
insert into public.household_join_codes (household_id, code) values ('00000000-0000-0000-0000-0000000146f1', 'K7PM2Q');
-- The owner's own roster entry (bills go to "me"), and f2's Rina.
-- (Joining a household made the owner's roster entry; give it a known id.)
update public.staff_profiles set id = '00000000-0000-0000-0000-0000000146e1'
 where household_id = '00000000-0000-0000-0000-0000000146f1' and user_id = '00000000-0000-0000-0000-0000000146a1';
insert into public.staff_profiles (household_id, name, user_id)
select '00000000-0000-0000-0000-0000000146f1', 'Ibu Melati', '00000000-0000-0000-0000-0000000146a1'
 where not exists (select 1 from public.staff_profiles where id = '00000000-0000-0000-0000-0000000146e1');
update public.staff_profiles set id = '00000000-0000-0000-0000-0000000146e1'
 where household_id = '00000000-0000-0000-0000-0000000146f1' and user_id = '00000000-0000-0000-0000-0000000146a1';
insert into public.staff_profiles (id, household_id, name, user_id) values
  ('00000000-0000-0000-0000-0000000146e9', '00000000-0000-0000-0000-0000000146f2', 'Rina', null);

\set a1 '''00000000-0000-0000-0000-0000000146a1'''
\set a9 '''00000000-0000-0000-0000-0000000146a9'''
\set p1 '''00000000-0000-0000-0000-0000000146b1'''
\set p2 '''00000000-0000-0000-0000-0000000146b2'''
\set p3 '''00000000-0000-0000-0000-0000000146b3'''
\set f1 '''00000000-0000-0000-0000-0000000146f1'''

create temp table d as select (now() at time zone 'Asia/Jakarta')::date::text as today;
grant select on d to public;
-- A small house: two floors, Kamar Utama with its bathroom inside, a garden;
-- Sari (kitchen); four chores and a bill for the owner.
create temp table drafts (name text primary key, body jsonb);
grant select on drafts to public;
insert into drafts values ('house', jsonb_build_object(
  'v', 1,
  'floors', jsonb_build_array(jsonb_build_object('key', 'f:1', 'name', 'LT1'), jsonb_build_object('key', 'f:2', 'name', 'LT2')),
  'rooms', jsonb_build_array(
    jsonb_build_object('key', 'r:kitchen', 'name', 'Dapur', 'parent', 'f:1'),
    jsonb_build_object('key', 'r:bed1', 'name', 'Kamar Utama', 'parent', 'f:2'),
    jsonb_build_object('key', 'r:bath1', 'name', 'Kamar Mandi', 'parent', 'r:bed1'),
    jsonb_build_object('key', 'r:garden', 'name', 'Taman', 'parent', null)),
  'staff', jsonb_build_array(jsonb_build_object('key', 's1', 'name', ' Mbak  Sari ')),
  'chores', jsonb_build_array(
    jsonb_build_object('title', 'Sapu dan pel lantai', 'place', 'f:1', 'recurrence', 'daily', 'interval', 1,
                       'due_date', (select today from d), 'category', 'cleaning', 'assignee', null, 'remind', null),
    jsonb_build_object('title', 'Cuci piring', 'place', 'r:kitchen', 'recurrence', 'daily', 'interval', 1,
                       'due_date', (select today from d), 'category', 'cleaning', 'assignee', jsonb_build_object('staff', 's1'), 'remind', null),
    jsonb_build_object('title', 'Sikat kamar mandi dan toilet', 'place', 'r:bath1', 'recurrence', 'weekly', 'interval', 1,
                       'due_date', (select today from d), 'category', 'cleaning', 'assignee', null, 'remind', null),
    jsonb_build_object('title', 'Potong rumput', 'place', 'r:garden', 'recurrence', 'weekly', 'interval', 2,
                       'due_date', (select today from d), 'category', 'maintenance', 'assignee', null, 'remind', null),
    jsonb_build_object('title', 'Listrik PLN', 'place', null, 'recurrence', 'monthly', 'interval', 1,
                       'due_date', (select today from d), 'category', 'bill',
                       'assignee', jsonb_build_object('me', true), 'remind', 3),
    -- Upkeep from the bills list: a maintenance chore, counted as a bill.
    jsonb_build_object('title', 'Servis AC', 'place', null, 'recurrence', 'monthly', 'interval', 3,
                       'due_date', (select today from d), 'category', 'maintenance', 'assignee', null, 'remind', 1,
                       'from_bills', true))
));

create function pg_temp.apply_sql(draft text, household text default '00000000-0000-0000-0000-0000000146f1') returns text language sql as $$
  select format('select public.apply_household_setup(%L, (select body from pg_temp.drafts where name = %L))', household, draft) $$;

-- ---- Applying ------------------------------------------------------------------------
select pg_temp.ok((select prosecdef = false from pg_proc where proname = 'apply_household_setup'),
  'apply_household_setup is security invoker (the tables'' own RLS still applies)');
create temp table first_apply as select pg_temp.json_as(:a1, pg_temp.apply_sql('house')) as j;
select pg_temp.ok((select j - 'staff' from first_apply)
                  = '{"rooms_added": 4, "chores_added": 4, "bills_added": 2, "staff_added": 1, "skipped": 0}'::jsonb
                  and (select j -> 'staff' ->> 's1' from first_apply)
                      = (select id::text from public.staff_profiles where household_id = :f1::uuid and name = 'Mbak Sari'),
  'the owner adds the list in one call, and is told what was added (upkeep from the bills list counts as a bill)');
select pg_temp.ok((select count(*) = 6 from public.household_locations where household_id = :f1::uuid),
  '... two floors and four rooms');
select pg_temp.ok((select p.name = 'Kamar Utama' from public.household_locations r join public.household_locations p on p.id = r.parent_id
                    where r.household_id = :f1::uuid and r.name = 'Kamar Mandi'),
  '... the bathroom inside its bedroom');
select pg_temp.ok((select l.name = 'LT2' from public.household_locations r join public.household_locations l on l.id = r.parent_id
                    where r.household_id = :f1::uuid and r.name = 'Kamar Utama'),
  '... the bedroom on LT2');
select pg_temp.ok((select s.name = 'Mbak Sari' from public.household_tasks t join public.staff_profiles s on s.id = t.assigned_to
                    where t.household_id = :f1::uuid and t.title = 'Cuci piring'),
  '... a chore to the person with its job, the name tidied');
select pg_temp.ok((select assigned_to = '00000000-0000-0000-0000-0000000146e1'::uuid and remind_days_before = 3 and category = 'bill'
                     from public.household_tasks where household_id = :f1::uuid and title = 'Listrik PLN'),
  '... the bill "for you" to the owner''s own roster entry, found by the database, with its reminder');
select pg_temp.ok((select recurrence = 'weekly' and recurrence_interval = 2 and l.name = 'Taman'
                     from public.household_tasks t join public.household_locations l on l.id = t.location_id
                    where t.household_id = :f1::uuid and t.title = 'Potong rumput'),
  '... every 2 weeks, in the garden');
select pg_temp.ok((select l.kind = 'floor' from public.household_tasks t join public.household_locations l on l.id = t.location_id
                    where t.household_id = :f1::uuid and t.title = 'Sapu dan pel lantai'),
  '... a whole-floor chore points at the floor');

-- The same list again (a second tap, or the Starter list later): nothing twice.
select pg_temp.ok(pg_temp.json_as(:a1, pg_temp.apply_sql('house')) - 'staff'
                  = '{"rooms_added": 0, "chores_added": 0, "bills_added": 0, "staff_added": 0, "skipped": 6}'::jsonb,
  'applying the same list again adds nothing (rooms by name, chores by title, place and repeat, staff by name)');
select pg_temp.ok((select count(*) = 6 from public.household_locations where household_id = :f1::uuid)
                  and (select count(*) = 6 from public.household_tasks where household_id = :f1::uuid)
                  and (select count(*) = 2 from public.staff_profiles where household_id = :f1::uuid),
  '... the counts stay put');

-- A chore that ended is not "the same chore": it can be added again.
update public.household_tasks set recurrence_until = (now() at time zone 'Asia/Jakarta')::date - 2
 where household_id = :f1::uuid and title = 'Potong rumput';
select pg_temp.ok((pg_temp.json_as(:a1, pg_temp.apply_sql('house')) ->> 'chores_added')::int = 1,
  'a chore whose repeat ended is added again');

-- All or nothing: a bad chore at the end leaves nothing behind.
insert into drafts values ('broken', jsonb_build_object('v', 1,
  'rooms', jsonb_build_array(jsonb_build_object('key', 'r:new', 'name', 'Gudang', 'parent', null)),
  'chores', jsonb_build_array(
    jsonb_build_object('title', 'Rapikan gudang', 'place', 'r:new', 'recurrence', 'monthly', 'interval', 1,
                       'due_date', (select today from d), 'category', 'cleaning', 'assignee', null, 'remind', null),
    jsonb_build_object('title', 'Bad', 'place', null, 'recurrence', 'hourly', 'interval', 1,
                       'due_date', (select today from d), 'category', 'cleaning', 'assignee', null, 'remind', null))));
select pg_temp.ok(pg_temp.err_as(:a1, pg_temp.apply_sql('broken')) like '%invalid_chore%', 'a bad repeat is refused');
select pg_temp.ok(not exists (select 1 from public.household_locations where household_id = :f1::uuid and name = 'Gudang')
                  and not exists (select 1 from public.household_tasks where household_id = :f1::uuid and title = 'Rapikan gudang'),
  '... and the whole call with it: no room, no chore');

-- Who may.
select pg_temp.ok(pg_temp.err_as(:p3, pg_temp.apply_sql('house')) like '%not_admin%',
  'a linked staff phone of that household is refused');
select pg_temp.ok(pg_temp.err_as(:a9, pg_temp.apply_sql('house')) like '%not_admin%',
  'another household''s owner is refused');
select pg_temp.ok(pg_temp.err_as(null, pg_temp.apply_sql('house')) like '%permission denied%',
  'anon cannot call it');

-- Limits and checks.
insert into drafts values ('too-many', jsonb_build_object('v', 1, 'rooms',
  (select jsonb_agg(jsonb_build_object('key', 'r' || n, 'name', 'Kamar ' || n, 'parent', null)) from generate_series(1, 61) n)));
select pg_temp.ok(pg_temp.err_as(:a1, pg_temp.apply_sql('too-many')) like '%too_many%', 'more than 60 rooms is refused');
insert into drafts values ('foreign', jsonb_build_object('v', 1, 'chores', jsonb_build_array(
  jsonb_build_object('title', 'Antar Rina', 'place', null, 'recurrence', 'none', 'interval', 1,
                     'due_date', (select today from d), 'category', 'errand',
                     'assignee', jsonb_build_object('profile', '00000000-0000-0000-0000-0000000146e9'), 'remind', null))));
select pg_temp.ok(pg_temp.err_as(:a1, pg_temp.apply_sql('foreign')) like '%invalid_assignee%',
  'a chore can''t go to another household''s person');
-- A member with no roster entry: "for you" is refused, never turned into Anyone.
update public.staff_profiles set archived_at = now() where id = '00000000-0000-0000-0000-0000000146e1';
insert into drafts values ('mine', jsonb_build_object('v', 1, 'chores', jsonb_build_array(
  jsonb_build_object('title', 'Air PDAM', 'place', null, 'recurrence', 'monthly', 'interval', 1,
                     'due_date', (select today from d), 'category', 'bill', 'assignee', jsonb_build_object('me', true), 'remind', 3))));
select pg_temp.ok(pg_temp.err_as(:a1, pg_temp.apply_sql('mine')) like '%no_owner_profile%',
  'a bill for the owner with no roster entry is refused, not given to anyone');
update public.staff_profiles set archived_at = null where id = '00000000-0000-0000-0000-0000000146e1';
select pg_temp.ok((select count(*) = 0 from public.household_tasks where household_id = :f1::uuid and title = 'Air PDAM'),
  '... and nothing was saved');
insert into drafts values ('far', jsonb_build_object('v', 1, 'chores', jsonb_build_array(
  jsonb_build_object('title', 'Nanti', 'place', null, 'recurrence', 'none', 'interval', 1,
                     'due_date', '2099-01-01', 'category', 'errand', 'assignee', null, 'remind', null))));
select pg_temp.ok(pg_temp.err_as(:a1, pg_temp.apply_sql('far')) like '%invalid_chore%', 'a first day years away is refused');
insert into drafts values ('no-interval', jsonb_build_object('v', 1, 'chores', jsonb_build_array(
  jsonb_build_object('title', 'Tanpa ulang', 'place', null, 'recurrence', 'daily',
                     'due_date', (select today from d), 'category', 'cleaning', 'assignee', null, 'remind', null))));
select pg_temp.ok(pg_temp.err_as(:a1, pg_temp.apply_sql('no-interval')) like '%invalid_chore%',
  'a chore with no interval is refused as invalid_chore, not a raw database error');
insert into drafts values ('orphan', jsonb_build_object('v', 1, 'rooms', jsonb_build_array(
  jsonb_build_object('key', 'r:x', 'name', 'X', 'parent', 'f:9'))));
select pg_temp.ok(pg_temp.err_as(:a1, pg_temp.apply_sql('orphan')) like '%invalid_room_parent%', 'a parent not in the list is refused');
insert into drafts values ('v2', jsonb_build_object('v', 2));
select pg_temp.ok(pg_temp.err_as(:a1, pg_temp.apply_sql('v2')) like '%invalid_draft%', 'an unknown draft version is refused');
insert into drafts values ('taken', jsonb_build_object('v', 1, 'floors', jsonb_build_array(
  jsonb_build_object('key', 'f:x', 'name', 'Taman'))));
select pg_temp.ok(pg_temp.err_as(:a1, pg_temp.apply_sql('taken')) like '%place_name_taken%',
  'a floor named like an existing top-level room is refused, not merged');

-- ---- Staff in one go -------------------------------------------------------------------
insert into public.staff_profiles (id, household_id, name, created_at, has_pin, archived_at) values
  ('00000000-0000-0000-0000-0000000146c2', :f1, 'Budi', now() - interval '8 days', false, null),
  ('00000000-0000-0000-0000-0000000146c3', :f1, 'Joko', now(), false, now()),
  ('00000000-0000-0000-0000-0000000146c4', :f1, 'Yanti', now(), true, null);
\set sari '(select id from public.staff_profiles where name = ''Mbak Sari'')'

-- The claim code the owner's WhatsApp link carries (audit L5).
create temp table claim (token text);
grant all on claim to public;
insert into claim select pg_temp.json_as(:a1, format($q$ select to_jsonb(public.staff_claim_link(%L)) $q$, :f1)) #>> '{}';
select pg_temp.ok((select token ~ '^[A-Z2-9]{10}$' from claim), 'the owner gets a 10-character claim code');
select pg_temp.ok(pg_temp.json_as(:a1, format($q$ select to_jsonb(public.staff_claim_link(%L)) $q$, :f1)) #>> '{}' = (select token from claim),
  '... the same one again within a day, so every send carries the same link');
select pg_temp.ok(pg_temp.err_as(:p3, format($q$ select public.staff_claim_link(%L) $q$, :f1)) like '%not_admin%',
  'a staff phone can''t make one');
select pg_temp.ok(pg_temp.err_as(:a9, format($q$ select public.staff_claim_link(%L) $q$, :f1)) like '%not_admin%',
  'nor another household''s owner');

-- The house code alone can't claim (audit L5: former staff may still know it).
select pg_temp.ok(pg_temp.json_as(:p1, format($q$ select public.claim_staff_with_house_code('K7PM2Q', %L, '1234', null) $q$, :sari)) ->> 'status' = 'no_claim_link',
  'without the claim code a name can''t be claimed');
select pg_temp.ok(pg_temp.json_as(:p1, format($q$ select public.claim_staff_with_house_code('K7PM2Q', %L, '1234', 'ABCDEFGHJK') $q$, :sari)) ->> 'status' = 'no_claim_link',
  '... nor with a wrong one');
select pg_temp.ok((select count(*) = 2 from public.staff_sign_in_attempts where user_id = :p1::uuid and kind = 'code' and not success),
  '... each counts as a wrong code toward this phone''s limit');
delete from public.staff_sign_in_attempts where user_id = :p1::uuid;

select pg_temp.ok(pg_temp.json_as(:p1, format($q$ select public.claim_staff_with_house_code('k7p-m2q', %L, '1234', (select token from pg_temp.claim)) $q$, :sari)) ->> 'status' = 'ok',
  'a staff phone with the house code claims Sari (added today, no PIN) and makes a PIN');
select pg_temp.ok(exists (select 1 from public.staff_profiles where name = 'Mbak Sari' and has_pin), '... Sari has a PIN now');
select pg_temp.ok(exists (select 1 from public.device_sessions where user_id = :p1::uuid and household_id = :f1::uuid),
  '... the phone is linked to the household');
select pg_temp.ok((select extensions.crypt('1234', pin) = pin from public.staff_profiles where name = 'Mbak Sari'),
  '... the PIN is stored hashed');
select pg_temp.ok(exists (select 1 from public.staff_sign_in_attempts where user_id = :p1::uuid and kind = 'claim' and success),
  '... and the claim is recorded');
select pg_temp.ok(pg_temp.json_as(:p2, format($q$ select public.claim_staff_with_house_code('K7PM2Q', %L, '9999', (select token from pg_temp.claim)) $q$, :sari)) ->> 'status' = 'not_claimable',
  'a second phone can''t take Sari''s name once claimed');
select pg_temp.ok(pg_temp.json_as(:p2, $q$ select public.claim_staff_with_house_code('K7PM2Q', '00000000-0000-0000-0000-0000000146c2', '1111', (select token from pg_temp.claim)) $q$) ->> 'status' = 'not_claimable',
  'a name added more than 7 days ago can''t be claimed (PIN sign-in only)');
select pg_temp.ok(pg_temp.json_as(:p2, $q$ select public.claim_staff_with_house_code('K7PM2Q', '00000000-0000-0000-0000-0000000146c3', '1111', (select token from pg_temp.claim)) $q$) ->> 'status' = 'not_claimable',
  'nor an archived person');
select pg_temp.ok(pg_temp.json_as(:p2, $q$ select public.claim_staff_with_house_code('K7PM2Q', '00000000-0000-0000-0000-0000000146c4', '1111', (select token from pg_temp.claim)) $q$) ->> 'status' = 'not_claimable',
  'nor someone who already has a PIN');
select pg_temp.ok(pg_temp.json_as(:p2, $q$ select public.claim_staff_with_house_code('K7PM2Q', '00000000-0000-0000-0000-0000000146e9', '1111', (select token from pg_temp.claim)) $q$) ->> 'status' = 'not_claimable',
  'nor another household''s person');
select pg_temp.ok(pg_temp.json_as(:p2, $q$ select public.claim_staff_with_house_code('K7PM2Q', '00000000-0000-0000-0000-0000000146e1', '1111', (select token from pg_temp.claim)) $q$) ->> 'status' = 'not_claimable',
  'nor an owner''s own roster entry');
select pg_temp.ok(not exists (select 1 from public.device_sessions where user_id = :p2::uuid),
  '... none of them linked the phone');
select pg_temp.ok(pg_temp.json_as(:p2, $q$ select public.claim_staff_with_house_code('AAAAAA', '00000000-0000-0000-0000-0000000146c2', '1111', (select token from pg_temp.claim)) $q$) ->> 'status' = 'wrong_code',
  'a wrong code says so');
select pg_temp.ok(exists (select 1 from public.staff_sign_in_attempts where user_id = :p2::uuid and kind = 'code' and not success),
  '... and counts toward the house code''s limit');
select pg_temp.ok(pg_temp.json_as(:p2, $q$ select public.claim_staff_with_house_code('K7PM2Q', '00000000-0000-0000-0000-0000000146c2', '12a4', (select token from pg_temp.claim)) $q$) ->> 'status' = 'bad_pin',
  'a PIN must be four digits');
select pg_temp.ok(pg_temp.err_as(:a1, $q$ select public.claim_staff_with_house_code('K7PM2Q', '00000000-0000-0000-0000-0000000146c2', '1111', (select token from pg_temp.claim)) $q$)
                  like '%staff_phones_only%', 'a Google account can''t claim (staff phones only)');
select pg_temp.ok(pg_temp.err_as(null, $q$ select public.claim_staff_with_house_code('K7PM2Q', '00000000-0000-0000-0000-0000000146c2', '1111', (select token from pg_temp.claim)) $q$)
                  like '%permission denied%', 'anon cannot call it');

-- Ten wrong codes in an hour lock this phone's house-code tries, claims included.
insert into public.staff_sign_in_attempts (user_id, kind, success)
select :p2::uuid, 'code', false from generate_series(1, 10);
insert into public.staff_profiles (id, household_id, name) values ('00000000-0000-0000-0000-0000000146c5', :f1, 'Dewi');
select pg_temp.ok(pg_temp.json_as(:p2, $q$ select public.claim_staff_with_house_code('K7PM2Q', '00000000-0000-0000-0000-0000000146c5', '1111', (select token from pg_temp.claim)) $q$) ->> 'status' = 'too_many_attempts',
  'the house code''s limit applies to claims');

-- The roster says who can still claim (house_code_roster, re-created from 117).
create temp table roster as select * from public.house_code_roster('K7PM2Q') limit 0;
grant all on roster to public;
select pg_temp.err_as('00000000-0000-0000-0000-0000000146b1', $q$ insert into pg_temp.roster select * from public.house_code_roster('K7PM2Q') $q$);
select pg_temp.ok((select claimable from roster where name = 'Dewi') and not (select claimable from roster where name = 'Budi')
                  and not (select claimable from roster where name = 'Mbak Sari'),
  'the roster marks Dewi (added today, no PIN) claimable; not Budi (8 days) or Sari (has a PIN now)');
select pg_temp.ok(not exists (select 1 from roster where name in ('Joko', 'Ibu Melati')),
  '... and still leaves out archived people and owners');

-- A claim code older than 7 days no longer works.
update public.staff_claim_links set created_at = now() - interval '8 days' where token = (select token from claim);
insert into public.staff_profiles (id, household_id, name) values ('00000000-0000-0000-0000-0000000146c6', :f1, 'Wati');
select pg_temp.ok(pg_temp.json_as(:p3, $q$ select public.claim_staff_with_house_code('K7PM2Q', '00000000-0000-0000-0000-0000000146c6', '1111', (select token from pg_temp.claim)) $q$) ->> 'status' = 'no_claim_link',
  'a claim code older than 7 days is refused');
update public.staff_claim_links set created_at = now() where token = (select token from claim);

-- At most 20 claims an hour per household (audit L5).
insert into public.staff_sign_in_attempts (user_id, household_id, kind, success)
select '00000000-0000-0000-0000-0000000146b3', :f1, 'claim', false from generate_series(1, 20);
select pg_temp.ok(pg_temp.json_as(:p3, $q$ select public.claim_staff_with_house_code('K7PM2Q', '00000000-0000-0000-0000-0000000146c6', '1111', (select token from pg_temp.claim)) $q$) ->> 'status' = 'too_many_attempts',
  'the 21st claim in an hour for a household is refused');
delete from public.staff_sign_in_attempts where household_id = :f1::uuid and kind = 'claim' and not success;

-- ---- Not Sari? Undo (audit L5) ---------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:p3, format($q$ select public.undo_staff_claim(%L, %L) $q$, :f1, :sari)) like '%not_admin%',
  'a staff phone can''t undo a claim');
select pg_temp.ok(pg_temp.err_as(:a9, format($q$ select public.undo_staff_claim(%L, %L) $q$, :f1, :sari)) like '%not_admin%',
  'nor another household''s owner');
select pg_temp.ok(pg_temp.json_as(:a1, format($q$ select jsonb_agg(name) from public.staff_claims_today(%L) $q$, :f1)) = '["Mbak Sari"]'::jsonb,
  'before Undo: Today says Sari''s phone is linked');
select pg_temp.ok(pg_temp.json_as(:a1, format($q$ select to_jsonb(public.undo_staff_claim(%L, %L)) $q$, :f1, :sari)) = 'true'::jsonb,
  'the owner undoes Sari''s claim');
select pg_temp.ok(not (select has_pin from public.staff_profiles where name = 'Mbak Sari')
                  and (select pin is null from public.staff_profiles where name = 'Mbak Sari'),
  '... the PIN is cleared');
select pg_temp.ok(not exists (select 1 from public.device_sessions where user_id = :p1::uuid),
  '... and the phone that made it is removed');
select pg_temp.ok(pg_temp.json_as(:a1, format($q$ select coalesce(jsonb_agg(name), '[]') from public.staff_claims_today(%L) $q$, :f1)) = '[]'::jsonb,
  '... and the Today line goes');
select pg_temp.ok(pg_temp.json_as(:a1, format($q$ select to_jsonb(public.undo_staff_claim(%L, %L)) $q$, :f1, :sari)) = 'false'::jsonb,
  'a second Undo finds nothing to undo');
select pg_temp.ok(pg_temp.json_as(:p3, format($q$ select public.claim_staff_with_house_code('K7PM2Q', %L, '4321', (select token from pg_temp.claim)) $q$, :sari)) ->> 'status' = 'ok',
  'the name can be claimed again from the link, by the right phone');
select pg_temp.ok(pg_temp.json_as(:a1, $q$ select to_jsonb(public.undo_staff_claim('00000000-0000-0000-0000-0000000146f1', '00000000-0000-0000-0000-0000000146c4')) $q$) = 'false'::jsonb,
  'Undo never touches a PIN that wasn''t made by a claim (Yanti)');
select pg_temp.ok((select has_pin from public.staff_profiles where name = 'Yanti'), '... Yanti keeps hers');

-- ---- Who linked today ------------------------------------------------------------------
select pg_temp.ok(pg_temp.json_as(:a1, format($q$ select jsonb_agg(name) from public.staff_claims_today(%L) $q$, :f1)) = '["Mbak Sari"]'::jsonb,
  'the owner sees who linked today: Sari');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select * from public.staff_claims_today(%L) $q$, :f1)) like '%not_admin%',
  'a staff phone can''t read it');
select pg_temp.ok(pg_temp.err_as(:a9, format($q$ select * from public.staff_claims_today(%L) $q$, :f1)) like '%not_admin%',
  'nor another household''s owner');

-- ---- Grants --------------------------------------------------------------------------
select pg_temp.ok(not has_function_privilege('anon', 'public.house_code_roster(text)', 'execute')
                  and has_function_privilege('authenticated', 'public.house_code_roster(text)', 'execute'),
  'house_code_roster keeps its grants');
select pg_temp.ok(not has_function_privilege('anon', 'public.staff_claim_link(uuid)', 'execute')
                  and not has_function_privilege('anon', 'public.undo_staff_claim(uuid, uuid)', 'execute')
                  and not has_table_privilege('authenticated', 'public.staff_claim_links', 'select')
                  and not has_table_privilege('anon', 'public.staff_claim_links', 'select'),
  'claim codes: anon executes neither function, and no client reads the table');
select pg_temp.ok(not has_function_privilege('anon', 'public.apply_household_setup(uuid, jsonb)', 'execute')
                  and not has_function_privilege('anon', 'public.claim_staff_with_house_code(text, uuid, text, text)', 'execute')
                  and not has_function_privilege('anon', 'public.staff_claims_today(uuid)', 'execute'),
  'anon executes none of the new functions');
select pg_temp.ok(has_function_privilege('authenticated', 'public.apply_household_setup(uuid, jsonb)', 'execute')
                  and has_function_privilege('authenticated', 'public.claim_staff_with_house_code(text, uuid, text, text)', 'execute')
                  and has_function_privilege('authenticated', 'public.staff_claims_today(uuid)', 'execute'),
  'authenticated may call them (the checks are inside)');
select pg_temp.ok(not has_table_privilege('authenticated', 'public.staff_sign_in_attempts', 'select'),
  'sign-in attempts stay unreadable to clients');

rollback;
