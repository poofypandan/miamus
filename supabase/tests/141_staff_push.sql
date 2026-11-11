-- Migration 141 checks: notifications on staff phones. Who may add a name to
-- a phone (D6); what a personal and a shared phone are told (D5); new,
-- moved and re-timed chores for today, once per save, never from a staff
-- phone or cron, never at night, never with the switch off, at most once in
-- 5 minutes; leave and suggestion answers (one push per suggestion); a
-- repair closed; an unlinked phone gets nothing; the admin overview, the
-- export and the grants.
-- LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/141_staff_push.sql
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
create temp table pushes (household uuid, title text, body text, url text, tag text, user_id uuid);
grant insert on pushes to authenticated;
create or replace function public.queue_push(
  p_household_id uuid, p_target_role text, p_title text, p_body text,
  p_url text default '/', p_tag text default null, p_user_id uuid default null, p_exclude_user_id uuid default null
) returns boolean language plpgsql as $$
begin
  insert into pg_temp.pushes values (p_household_id, p_title, p_body, p_url, p_tag, p_user_id);
  return true;
end $$;

-- Today in Jakarta, as the triggers read it.
create temp table d as select (now() at time zone 'Asia/Jakarta')::date as today;
create function pg_temp.today() returns date language sql as $$ select today from pg_temp.d $$;
create function pg_temp.at_hour(h int, m int default 0) returns timestamptz language sql as $$
  select (pg_temp.today() + make_time(h, m, 0)) at time zone 'Asia/Jakarta' $$;
-- Between cases: no pushes recorded, nobody buzzed recently.
create function pg_temp.fresh() returns void language sql as $$
  delete from pg_temp.pushes;
  update public.staff_push_people set last_task_push_at = null;
$$;

-- ---- The real quiet hours, then a stub so the rest runs at any hour ------------------
select pg_temp.ok(public.staff_push_quiet(pg_temp.at_hour(21)), '21.00 is quiet');
select pg_temp.ok(public.staff_push_quiet(pg_temp.at_hour(22)), '22.00 is quiet');
select pg_temp.ok(public.staff_push_quiet(pg_temp.at_hour(5, 59)), '05.59 is quiet');
select pg_temp.ok(not public.staff_push_quiet(pg_temp.at_hour(6)), '06.00 is not');
select pg_temp.ok(not public.staff_push_quiet(pg_temp.at_hour(20, 59)), '20.59 is not');
create temp table quiet (on_now boolean);
insert into quiet values (false);
grant select on quiet to authenticated;
create or replace function public.staff_push_quiet(p_now timestamptz default now())
returns boolean language sql stable set search_path = '' as $$ select on_now from pg_temp.quiet $$;

-- ---- Households ----------------------------------------------------------------------
-- f1: admin a1 (with a roster row, m1); phone p1 (Sari's own), phone p2
-- (shared by Wati and Dewi). Sari s1, Wati s2, Dewi s3, Budi s4 (archived).
-- f2: admin a9.
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, anon, now(), now()
from (values
  ('00000000-0000-0000-0000-0000000141a1', 'one141@test.local', false),
  ('00000000-0000-0000-0000-0000000141a9', 'nine141@test.local', false),
  ('00000000-0000-0000-0000-0000000141b1', null, true),
  ('00000000-0000-0000-0000-0000000141b2', null, true)
) as u(id, email, anon);
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000141f1', 'Rumah Melati', '00000000-0000-0000-0000-0000000141a1'),
  ('00000000-0000-0000-0000-0000000141f2', 'Rumah Kenanga', '00000000-0000-0000-0000-0000000141a9');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000141f1', '00000000-0000-0000-0000-0000000141a1', 'owner'),
  ('00000000-0000-0000-0000-0000000141f2', '00000000-0000-0000-0000-0000000141a9', 'owner');
insert into public.device_sessions (user_id, household_id) values
  ('00000000-0000-0000-0000-0000000141b1', '00000000-0000-0000-0000-0000000141f1'),
  ('00000000-0000-0000-0000-0000000141b2', '00000000-0000-0000-0000-0000000141f1');
insert into public.staff_profiles (id, household_id, name, archived_at, user_id) values
  ('00000000-0000-0000-0000-0000000141c1', '00000000-0000-0000-0000-0000000141f1', 'Sari', null, null),
  ('00000000-0000-0000-0000-0000000141c2', '00000000-0000-0000-0000-0000000141f1', 'Wati', null, null),
  ('00000000-0000-0000-0000-0000000141c3', '00000000-0000-0000-0000-0000000141f1', 'Dewi', null, null),
  ('00000000-0000-0000-0000-0000000141c4', '00000000-0000-0000-0000-0000000141f1', 'Budi', now(), null);
-- The admin's roster row (106) is made with the membership; given a known id here.
insert into public.staff_profiles (id, household_id, name, user_id)
values ('00000000-0000-0000-0000-0000000141c9', '00000000-0000-0000-0000-0000000141f1', 'Ibu', '00000000-0000-0000-0000-0000000141a1')
on conflict (household_id, user_id) where user_id is not null do nothing;
update public.staff_profiles set id = '00000000-0000-0000-0000-0000000141c9'
 where household_id = '00000000-0000-0000-0000-0000000141f1' and user_id = '00000000-0000-0000-0000-0000000141a1';
update public.staff_profiles set pin = extensions.crypt(p, extensions.gen_salt('bf'))
  from (values ('00000000-0000-0000-0000-0000000141c1'::uuid, '1111'),
               ('00000000-0000-0000-0000-0000000141c2'::uuid, '2222'),
               ('00000000-0000-0000-0000-0000000141c3'::uuid, '3333')) as v(sid, p)
 where id = v.sid;
insert into public.push_subscriptions (user_id, household_id, subscription)
select u::uuid, '00000000-0000-0000-0000-0000000141f1'::uuid,
       jsonb_build_object('endpoint', 'https://fcm.googleapis.com/fcm/send/' || u,
                          'keys', jsonb_build_object('p256dh', 'k', 'auth', 'a'))
from (values ('00000000-0000-0000-0000-0000000141b1'), ('00000000-0000-0000-0000-0000000141b2')) as s(u);
-- PIN sign-ins: p1 only Sari; p2 Wati, then Dewi (the latest).
insert into public.staff_sign_in_attempts (user_id, household_id, staff_id, kind, success, created_at) values
  ('00000000-0000-0000-0000-0000000141b1', '00000000-0000-0000-0000-0000000141f1', '00000000-0000-0000-0000-0000000141c1', 'pin', true, now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000141b2', '00000000-0000-0000-0000-0000000141f1', '00000000-0000-0000-0000-0000000141c2', 'pin', true, now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000141b2', '00000000-0000-0000-0000-0000000141f1', '00000000-0000-0000-0000-0000000141c3', 'pin', true, now() - interval '1 day');

\set a1 '''00000000-0000-0000-0000-0000000141a1'''
\set a9 '''00000000-0000-0000-0000-0000000141a9'''
\set p1 '''00000000-0000-0000-0000-0000000141b1'''
\set p2 '''00000000-0000-0000-0000-0000000141b2'''
\set sari '''00000000-0000-0000-0000-0000000141c1'''
\set wati '''00000000-0000-0000-0000-0000000141c2'''
\set dewi '''00000000-0000-0000-0000-0000000141c3'''

-- ---- Who may add a name to a phone (D6) ----------------------------------------------
select pg_temp.ok(pg_temp.json_as(:p1, $q$ select public.set_my_push_person('00000000-0000-0000-0000-0000000141c1', true) $q$)
  ->> 'status' = 'ok', 'Sari, last to sign in on p1, adds herself without a PIN');
select pg_temp.ok(pg_temp.json_as(:p2, $q$ select public.set_my_push_person('00000000-0000-0000-0000-0000000141c2', true) $q$)
  ->> 'status' = 'pin_required', 'Wati on p2, where Dewi signed in last: the PIN is asked for');
select pg_temp.ok(pg_temp.json_as(:p2, $q$ select public.set_my_push_person('00000000-0000-0000-0000-0000000141c2', true, '9999') $q$)
  ->> 'status' = 'wrong_pin', '... a wrong PIN is refused (and counts as a try)');
select pg_temp.ok((select failed_pin_attempts = 1 from public.staff_profiles where id = :sari::uuid) is false
                  and (select failed_pin_attempts = 1 from public.staff_profiles where id = :wati::uuid),
  '... on Wati''s count, nobody else''s');
select pg_temp.ok(pg_temp.json_as(:p2, $q$ select public.set_my_push_person('00000000-0000-0000-0000-0000000141c2', true, '2222') $q$)
  ->> 'status' = 'ok', '... her PIN adds her');
select pg_temp.ok(pg_temp.json_as(:p2, $q$ select public.set_my_push_person('00000000-0000-0000-0000-0000000141c3', true) $q$)
  ->> 'status' = 'pin_required', 'Dewi next on p2: Wati''s PIN made Wati the last sign-in, so Dewi''s is asked for');
select pg_temp.ok(pg_temp.json_as(:p2, $q$ select public.set_my_push_person('00000000-0000-0000-0000-0000000141c3', true, '3333') $q$)
  ->> 'status' = 'ok', '... and adds her');
select pg_temp.ok(pg_temp.err_as(:p1, $q$ select public.set_my_push_person('00000000-0000-0000-0000-0000000141c4', true, '0000') $q$)
  like '%not_on_roster%', 'an archived person can''t be added');
select pg_temp.ok(pg_temp.err_as(:p1, $q$ select public.set_my_push_person('00000000-0000-0000-0000-0000000141c9', true) $q$)
  like '%not_on_roster%', 'nor an admin''s roster row');
select pg_temp.ok(pg_temp.err_as(:a1, $q$ select public.set_my_push_person('00000000-0000-0000-0000-0000000141c1', true) $q$)
  like '%staff_phones_only%', 'a Google account (an admin in staff view) is refused');
select pg_temp.ok(pg_temp.err_as(:a1, 'select public.my_phone_push_people()') like '%staff_phones_only%',
  '... and has no phone list');

select pg_temp.ok((select j -> 'people' = jsonb_build_array(jsonb_build_object('staff_id', :sari, 'name', 'Sari'))
                          and not (j ->> 'shared')::boolean and (j ->> 'household_on')::boolean
                     from (select pg_temp.json_as(:p1, 'select public.my_phone_push_people()') as j) x),
  'p1 notifies Sari, and is personal');
select pg_temp.ok((select jsonb_array_length(j -> 'people') = 2 and (j ->> 'shared')::boolean
                     from (select pg_temp.json_as(:p2, 'select public.my_phone_push_people()') as j) x),
  'p2 notifies Wati and Dewi, and is shared');

-- ---- The admin side --------------------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:p1, 'select public.staff_push_overview()') like '%admins_only%',
  'the overview is refused to a staff phone');
select pg_temp.ok(pg_temp.err_as(:p1, 'select public.set_household_staff_push(false)') like '%admins_only%',
  '... and so is the switch');
select pg_temp.ok(pg_temp.err_as(:p1, format('select public.staff_will_be_notified(array[%L]::uuid[])', :sari)) like '%admins_only%',
  '... and the toast''s question');
select pg_temp.ok((select (j ->> 'enabled')::boolean
                          and j -> 'people' @> jsonb_build_array(jsonb_build_object('staff_id', :sari, 'phones_on', 1))
                          and jsonb_array_length(j -> 'phones') = 2
                          and j -> 'phones' @> jsonb_build_array(jsonb_build_object('names', jsonb_build_array('Wati', 'Dewi')))
                     from (select pg_temp.json_as(:a1, 'select public.staff_push_overview()') as j) x),
  'the admin sees the switch, Sari on one phone, and Wati and Dewi on the shared one');
select pg_temp.ok((select jsonb_array_length(j -> 'people') = 0
                     from (select pg_temp.json_as(:a9, 'select public.staff_push_overview()') as j) x),
  'another household''s admin sees none of it');
select pg_temp.ok(pg_temp.json_as(:a1, format('select to_jsonb(public.staff_will_be_notified(array[%L, %L, %L]::uuid[]))',
                                             :sari, :wati, '00000000-0000-0000-0000-0000000141c4'))
                  @> jsonb_build_array(:sari, :wati)
                  and jsonb_array_length(pg_temp.json_as(:a1, format(
                    'select to_jsonb(public.staff_will_be_notified(array[%L, %L, %L]::uuid[]))',
                    :sari, :wati, '00000000-0000-0000-0000-0000000141c4'))) = 2,
  'Sari and Wati would be notified; archived Budi would not');

-- ---- New chores for today ---------------------------------------------------------------
select pg_temp.fresh();
select pg_temp.ok(pg_temp.err_as(:a1, format($q$
  insert into public.household_tasks (household_id, title, due_date, due_time, assigned_to)
  values ('00000000-0000-0000-0000-0000000141f1', 'Siram tanaman', %L, '15:00', '00000000-0000-0000-0000-0000000141c1') $q$,
  pg_temp.today())) = '', 'the admin adds today''s chore for Sari');
select pg_temp.ok((select count(*) = 1 and bool_and(user_id = :p1::uuid and title = 'Tugas baru'
                          and body = 'Siram tanaman · 15.00'
                          and tag = 'tugas-' || :sari || '-' || pg_temp.today()
                          and url = '/staff?untuk=' || :sari)
                     from pushes), '... one push to her phone, with the time');

select pg_temp.fresh();
select pg_temp.ok(pg_temp.err_as(:a1, format($q$
  insert into public.household_tasks (household_id, title, due_date, assigned_to) values
    ('00000000-0000-0000-0000-0000000141f1', 'Pel kamar 1', %1$L, '00000000-0000-0000-0000-0000000141c1'),
    ('00000000-0000-0000-0000-0000000141f1', 'Pel kamar 2', %1$L, '00000000-0000-0000-0000-0000000141c1'),
    ('00000000-0000-0000-0000-0000000141f1', 'Pel kamar 3', %1$L, '00000000-0000-0000-0000-0000000141c1') $q$,
  pg_temp.today())) = '', 'three rooms at once for Sari');
select pg_temp.ok((select count(*) = 1 and bool_and(body = 'Pel kamar 1, Pel kamar 2, Pel kamar 3, dan 1 lagi') from pushes),
  '... one push, listing this save and the chore added just before');

delete from pushes;
select pg_temp.ok(pg_temp.err_as(:a1, format($q$
  insert into public.household_tasks (household_id, title, due_date, assigned_to)
  values ('00000000-0000-0000-0000-0000000141f1', 'Lap jendela', %L, '00000000-0000-0000-0000-0000000141c1') $q$,
  pg_temp.today())) = '', 'another chore for Sari a moment later');
select pg_temp.ok((select count(*) = 0 from pushes), '... no second buzz within 5 minutes');

select pg_temp.fresh();
select pg_temp.ok(pg_temp.err_as(:a1, format($q$
  insert into public.household_tasks (id, household_id, title, due_date, assigned_to)
  values ('00000000-0000-0000-0000-0000000141d1', '00000000-0000-0000-0000-0000000141f1', 'Cuci mobil', %L,
          '00000000-0000-0000-0000-0000000141c1') $q$,
  pg_temp.today() + 1)) = '', 'a chore for Sari tomorrow');
select pg_temp.ok((select count(*) = 0 from pushes), '... no push (D2)');

select pg_temp.fresh();
select pg_temp.ok(pg_temp.err_as(:a1, format($q$
  insert into public.household_tasks (id, household_id, title, due_date, due_time)
  values ('00000000-0000-0000-0000-0000000141d2', '00000000-0000-0000-0000-0000000141f1', 'Buang sampah', %L, '17:00') $q$,
  pg_temp.today())) = '', 'a chore for anyone today');
select pg_temp.ok((select count(*) = 2 from pushes), '... every phone with notifications on (D3)');
select pg_temp.ok((select title = 'Tugas baru untuk semua' and body = 'Buang sampah · 17.00' and url = '/staff'
                     from pushes where user_id = :p1::uuid), '... the personal phone gets the details');
select pg_temp.ok((select title = 'Tugas baru untuk semua' and body = 'Buka Miamus untuk melihat.'
                     from pushes where user_id = :p2::uuid), '... the shared phone gets none');

select pg_temp.fresh();
select pg_temp.ok(pg_temp.err_as(:a1, format($q$
  insert into public.household_tasks (household_id, title, due_date, assigned_to)
  values ('00000000-0000-0000-0000-0000000141f1', 'Setrika', %L, '00000000-0000-0000-0000-0000000141c2') $q$,
  pg_temp.today())) = '', 'a chore for Wati, whose phone is shared');
select pg_temp.ok((select count(*) = 1 and bool_and(user_id = :p2::uuid and title = 'Untuk Wati'
                          and body = 'Ada tugas baru hari ini.' and body not like '%Setrika%')
                     from pushes), '... says only whose it is (D5)');

select pg_temp.fresh();
select pg_temp.ok(pg_temp.err_as(:a1, format($q$
  insert into public.household_tasks (household_id, title, due_date, assigned_to, recurrence)
  values ('00000000-0000-0000-0000-0000000141f1', 'Sapu halaman', %L, '00000000-0000-0000-0000-0000000141c1', 'daily') $q$,
  pg_temp.today())) = '', 'a daily repeat for Sari starting today');
select pg_temp.ok((select count(*) = 1 from pushes), '... pushes her');
select pg_temp.fresh();
select pg_temp.ok(pg_temp.err_as(:a1, format($q$
  insert into public.household_tasks (household_id, title, due_date, assigned_to, recurrence)
  values ('00000000-0000-0000-0000-0000000141f1', 'Kuras kolam', %L, '00000000-0000-0000-0000-0000000141c1', 'weekly') $q$,
  pg_temp.today() + 1)) = '', 'a weekly repeat for Sari starting tomorrow');
select pg_temp.ok((select count(*) = 0 from pushes), '... does not');

select pg_temp.fresh();
select pg_temp.ok(pg_temp.err_as(:a1, format($q$
  insert into public.household_tasks (household_id, parent_task_id, title, due_date, assigned_to)
  select household_id, id, title, %L, assigned_to from public.household_tasks where title = 'Sapu halaman' $q$,
  pg_temp.today())) = '', 'the admin writes today''s row of that repeat (skipping or finishing it)');
select pg_temp.ok((select count(*) = 0 from pushes), '... no push: it already showed');

select pg_temp.fresh();
select pg_temp.ok(pg_temp.err_as(:a1, format($q$
  insert into public.household_tasks (household_id, title, due_date, assigned_to)
  values ('00000000-0000-0000-0000-0000000141f1', 'Belanja', %L, '00000000-0000-0000-0000-0000000141c9') $q$,
  pg_temp.today())) = '', 'the admin gives a chore to themselves');
select pg_temp.ok((select count(*) = 0 from pushes), '... no staff push');

-- Not from a staff phone, cron, at night, or with the switch off.
select pg_temp.fresh();
select pg_temp.ok(pg_temp.err_as(:p1, $q$
  update public.household_tasks set assigned_to = '00000000-0000-0000-0000-0000000141c1'
   where id = '00000000-0000-0000-0000-0000000141d2' $q$) = '', 'Sari takes the chore for anyone ("Saya kerjakan")');
select pg_temp.ok((select count(*) = 0 from pushes), '... a staff phone never pushes');
update public.household_tasks set assigned_to = null where id = '00000000-0000-0000-0000-0000000141d2';

insert into public.household_tasks (household_id, title, due_date, assigned_to)
values ('00000000-0000-0000-0000-0000000141f1', 'Dari cron', pg_temp.today(), '00000000-0000-0000-0000-0000000141c1');
select pg_temp.ok((select count(*) = 0 from pushes), 'a chore written with no session (cron, migration) never pushes');

update quiet set on_now = true;
select pg_temp.ok(pg_temp.err_as(:a1, format($q$
  insert into public.household_tasks (household_id, title, due_date, assigned_to)
  values ('00000000-0000-0000-0000-0000000141f1', 'Malam', %L, '00000000-0000-0000-0000-0000000141c1') $q$,
  pg_temp.today())) = '', 'an admin adds a chore for Sari at 22.00');
select pg_temp.ok((select count(*) = 0 from pushes), '... nothing in quiet hours (D4)');
select pg_temp.ok(jsonb_array_length(pg_temp.json_as(:a1, format('select to_jsonb(public.staff_will_be_notified(array[%L]::uuid[]))', :sari))) = 0,
  '... and the toast says nobody will be notified');
update quiet set on_now = false;

select pg_temp.ok(pg_temp.err_as(:a1, 'select public.set_household_staff_push(false)') = '', 'the owner switches staff pushes off');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$
  insert into public.household_tasks (household_id, title, due_date, assigned_to)
  values ('00000000-0000-0000-0000-0000000141f1', 'Mati', %L, '00000000-0000-0000-0000-0000000141c1') $q$,
  pg_temp.today())) = '', 'a chore for Sari');
select pg_temp.ok((select count(*) = 0 from pushes), '... nothing with the switch off (D8)');
select pg_temp.ok(not (pg_temp.json_as(:p1, 'select public.my_phone_push_people()') ->> 'household_on')::boolean,
  '... and the phone can tell');
select pg_temp.ok(pg_temp.err_as(:a1, 'select public.set_household_staff_push(true)') = '', 'switched back on');

-- ---- Changed chores ----------------------------------------------------------------------
select pg_temp.fresh();
select pg_temp.ok(pg_temp.err_as(:a1, format($q$
  update public.household_tasks set due_date = %L, due_time = '14:00'
   where id = '00000000-0000-0000-0000-0000000141d1' $q$, pg_temp.today())) = '',
  'the admin moves Sari''s chore from tomorrow onto today');
select pg_temp.ok((select count(*) = 1 and bool_and(user_id = :p1::uuid and title = 'Tugas untuk Anda'
                          and body = 'Cuci mobil · hari ini 14.00') from pushes), '... "Tugas untuk Anda"');

select pg_temp.fresh();
select pg_temp.ok(pg_temp.err_as(:a1, $q$
  update public.household_tasks set due_time = '16:00' where id = '00000000-0000-0000-0000-0000000141d1' $q$) = '',
  'the admin changes its time');
select pg_temp.ok((select count(*) = 1 and bool_and(title = 'Jam tugas diubah' and body = 'Cuci mobil: sekarang 16.00')
                     from pushes), '... "Jam tugas diubah"');

select pg_temp.fresh();
select pg_temp.ok(pg_temp.err_as(:a1, $q$
  update public.household_tasks set notes = 'pakai sabun' where id = '00000000-0000-0000-0000-0000000141d1' $q$) = '',
  'the admin edits its note');
select pg_temp.ok((select count(*) = 0 from pushes), '... no push');

select pg_temp.fresh();
select pg_temp.ok(pg_temp.err_as(:a1, $q$
  update public.household_tasks set assigned_to = '00000000-0000-0000-0000-0000000141c2'
   where id = '00000000-0000-0000-0000-0000000141d1' $q$) = '', 'the admin moves it to Wati');
select pg_temp.ok((select count(*) = 1 and bool_and(user_id = :p2::uuid and title = 'Untuk Wati') from pushes),
  '... Wati''s (shared) phone hears; Sari isn''t told it was taken (D1)');

select pg_temp.fresh();
select pg_temp.ok(pg_temp.err_as(:a1, $q$
  update public.household_tasks set status = 'completed', completed_at = now(),
         before_photo_url = 'x/b.jpg', after_photo_url = 'x/a.jpg'
   where id = '00000000-0000-0000-0000-0000000141d1' $q$) = '', 'the admin marks it done');
select pg_temp.ok(pg_temp.err_as(:a1, $q$
  update public.household_tasks set status = 'pending', completed_at = null
   where id = '00000000-0000-0000-0000-0000000141d1' $q$) = '', '... then not done');
select pg_temp.ok((select count(*) = 0 from pushes), '... neither pushes');

-- Leave applies, as on Today: Dewi away today with "pause" takes her chore off.
insert into public.leave_requests (household_id, staff_id, start_date, end_date, status, fallback_action)
values ('00000000-0000-0000-0000-0000000141f1', '00000000-0000-0000-0000-0000000141c3', pg_temp.today(), pg_temp.today(),
        'approved', 'pause');
select pg_temp.fresh();
select pg_temp.ok(pg_temp.err_as(:a1, format($q$
  insert into public.household_tasks (household_id, title, due_date, assigned_to)
  values ('00000000-0000-0000-0000-0000000141f1', 'Cuti', %L, '00000000-0000-0000-0000-0000000141c3') $q$,
  pg_temp.today())) = '', 'a chore for Dewi, who is on leave today (pause)');
select pg_temp.ok((select count(*) = 0 from pushes), '... no push');
select pg_temp.ok(jsonb_array_length(pg_temp.json_as(:a1, format(
                    'select to_jsonb(public.staff_will_be_notified(array[%L]::uuid[], true))', :dewi))) = 0,
  '... and the toast doesn''t claim she''ll be told (review fix)');
select pg_temp.ok(pg_temp.json_as(:a1, format('select to_jsonb(public.staff_will_be_notified(array[%L]::uuid[]))', :dewi))
                  @> jsonb_build_array(:dewi),
  '... while an answer to her own request still reaches her');

-- Covering: Tono away today, his chores to Rina (her own phone, p3). The
-- list of recent chores follows the cover too (review fix).
insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at)
values ('00000000-0000-0000-0000-0000000141b3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now());
insert into public.device_sessions (user_id, household_id, last_seen_at)
values ('00000000-0000-0000-0000-0000000141b3', '00000000-0000-0000-0000-0000000141f1', now() - interval '3 days');
insert into public.staff_profiles (id, household_id, name) values
  ('00000000-0000-0000-0000-0000000141c5', '00000000-0000-0000-0000-0000000141f1', 'Rina'),
  ('00000000-0000-0000-0000-0000000141c6', '00000000-0000-0000-0000-0000000141f1', 'Tono');
insert into public.push_subscriptions (user_id, household_id, subscription)
values ('00000000-0000-0000-0000-0000000141b3', '00000000-0000-0000-0000-0000000141f1',
        jsonb_build_object('endpoint', 'https://fcm.googleapis.com/fcm/send/p3', 'keys', jsonb_build_object('p256dh', 'k', 'auth', 'a')));
insert into public.staff_sign_in_attempts (user_id, household_id, staff_id, kind, success)
values ('00000000-0000-0000-0000-0000000141b3', '00000000-0000-0000-0000-0000000141f1', '00000000-0000-0000-0000-0000000141c5', 'pin', true);
select pg_temp.ok(pg_temp.json_as('00000000-0000-0000-0000-0000000141b3',
                    $q$ select public.set_my_push_person('00000000-0000-0000-0000-0000000141c5', true) $q$) ->> 'status' = 'ok',
  'Rina turns notifications on, on her own phone');
insert into public.leave_requests (household_id, staff_id, start_date, end_date, status, fallback_action, fallback_assignee_id)
values ('00000000-0000-0000-0000-0000000141f1', '00000000-0000-0000-0000-0000000141c6', pg_temp.today(), pg_temp.today(),
        'approved', 'reassign', '00000000-0000-0000-0000-0000000141c5');
select pg_temp.fresh();
select pg_temp.ok(pg_temp.err_as(:a1, format($q$
  insert into public.household_tasks (household_id, title, due_date, assigned_to)
  values ('00000000-0000-0000-0000-0000000141f1', 'Tutup gorden', %L, '00000000-0000-0000-0000-0000000141c6') $q$,
  pg_temp.today())) = '', 'a chore for Tono, who is away with Rina covering');
select pg_temp.ok((select count(*) = 1 and bool_and(user_id = '00000000-0000-0000-0000-0000000141b3'::uuid
                          and title = 'Tugas baru' and body = 'Tutup gorden') from pushes),
  '... Rina hears it');
select pg_temp.fresh();
select pg_temp.ok(pg_temp.err_as(:a1, format($q$
  insert into public.household_tasks (household_id, title, due_date, assigned_to)
  values ('00000000-0000-0000-0000-0000000141f1', 'Buka jendela', %L, '00000000-0000-0000-0000-0000000141c6') $q$,
  pg_temp.today())) = '', 'another chore for Tono');
select pg_temp.ok((select count(*) = 1 and bool_and(body = 'Buka jendela dan Tutup gorden') from pushes),
  '... Rina''s push lists the one before it too');
select pg_temp.ok(jsonb_array_length(pg_temp.json_as(:a1, format(
                    'select to_jsonb(public.staff_will_be_notified(array[%L, %L]::uuid[], true))',
                    '00000000-0000-0000-0000-0000000141c5', '00000000-0000-0000-0000-0000000141c6'))) = 1,
  '... and the toast check counts Rina, not Tono');

-- ---- Leave answered ------------------------------------------------------------------------
insert into public.leave_requests (id, household_id, staff_id, start_date, end_date) values
  ('00000000-0000-0000-0000-0000000141e1', '00000000-0000-0000-0000-0000000141f1', '00000000-0000-0000-0000-0000000141c1',
   pg_temp.today() + 10, pg_temp.today() + 12),
  ('00000000-0000-0000-0000-0000000141e2', '00000000-0000-0000-0000-0000000141f1', '00000000-0000-0000-0000-0000000141c1',
   pg_temp.today() + 20, pg_temp.today() + 20);
select pg_temp.fresh();
select pg_temp.ok(pg_temp.err_as(:a1, $q$
  update public.leave_requests set status = 'approved', fallback_action = 'reassign',
         fallback_assignee_id = '00000000-0000-0000-0000-0000000141c2'
   where id = '00000000-0000-0000-0000-0000000141e1' $q$) = '', 'Sari''s leave approved, Wati covering');
select pg_temp.ok((select count(*) = 2 from pushes), '... one push each');
select pg_temp.ok((select title = 'Cuti disetujui'
                          and body = public.push_date_range_label(pg_temp.today() + 10, pg_temp.today() + 12, 'id') || '.'
                          and tag = 'cuti-00000000-0000-0000-0000-0000000141e1'
                     from pushes where user_id = :p1::uuid), '... Sari: "Cuti disetujui" with the dates');
select pg_temp.ok((select title = 'Untuk Wati' and body = 'Ada tugas tambahan untuk Anda.'
                          and tag = 'cuti-ganti-00000000-0000-0000-0000-0000000141e1'
                     from pushes where user_id = :p2::uuid), '... Wati (shared phone): whose, no details');

select pg_temp.fresh();
select pg_temp.ok(pg_temp.err_as(:a1, $q$
  update public.leave_requests set status = 'rejected' where id = '00000000-0000-0000-0000-0000000141e2' $q$) = '',
  'Sari''s other leave not approved');
select pg_temp.ok((select count(*) = 1 and bool_and(user_id = :p1::uuid and title = 'Cuti tidak disetujui'
                          and body like '%. Buka Miamus untuk melihat.') from pushes), '... Sari only');

-- ---- Schedule suggestions answered ---------------------------------------------------------
insert into public.task_entities (id, household_id, entity_type, name, status) values
  ('00000000-0000-0000-0000-0000000141e9', '00000000-0000-0000-0000-0000000141f1', 'pet', 'Mochi', 'home');
insert into public.routine_proposals (id, pet_id, title, category, time, status, batch_id, staff_id)
select id::uuid, '00000000-0000-0000-0000-0000000141e9', 'Makan', 'meal', t::time, 'pending', b, '00000000-0000-0000-0000-0000000141c1'
from (values
  ('00000000-0000-0000-0000-00000141a001', '07:00', 'b-141-1'),
  ('00000000-0000-0000-0000-00000141a002', '12:00', 'b-141-1'),
  ('00000000-0000-0000-0000-00000141a003', '18:00', 'b-141-1'),
  ('00000000-0000-0000-0000-00000141a004', '07:00', 'b-141-2'),
  ('00000000-0000-0000-0000-00000141a005', '12:00', 'b-141-2'),
  ('00000000-0000-0000-0000-00000141a006', '18:00', 'b-141-2')
) as p(id, t, b);
select pg_temp.fresh();
select pg_temp.ok(pg_temp.err_as(:a1, $q$
  update public.routine_proposals set status = 'approved'
   where id in ('00000000-0000-0000-0000-00000141a001', '00000000-0000-0000-0000-00000141a002') $q$) = '',
  'two of a suggestion''s three rows approved');
select pg_temp.ok((select count(*) = 0 from pushes), '... no push while one is still open');
select pg_temp.ok(pg_temp.err_as(:a1, $q$
  update public.routine_proposals set status = 'rejected' where id = '00000000-0000-0000-0000-00000141a003' $q$) = '',
  '... the last one rejected');
select pg_temp.ok((select count(*) = 1 and bool_and(title = 'Usulan jadwal dijawab' and body = '2 disetujui, 1 ditolak.'
                          and tag = 'usulan-b-141-1') from pushes), '... one push for the suggestion, both counts');
select pg_temp.fresh();
select pg_temp.ok(pg_temp.err_as(:a1, $q$
  update public.routine_proposals set status = 'approved' where batch_id = 'b-141-2' $q$) = '',
  'a whole suggestion approved at once');
select pg_temp.ok((select count(*) = 1 and bool_and(title = 'Usulan jadwal disetujui' and body = '3 usulan untuk Mochi.')
                     from pushes), '... one push');

-- ---- A repair closed ------------------------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:p1, $q$
  insert into public.repairs (id, household_id, title, status, reported_by_staff) values
    ('00000000-0000-0000-0000-0000000141aa', '00000000-0000-0000-0000-0000000141f1', 'Keran bocor', 'reported',
     '00000000-0000-0000-0000-0000000141c1'),
    ('00000000-0000-0000-0000-0000000141ab', '00000000-0000-0000-0000-0000000141f1', 'Lampu teras', 'reported',
     '00000000-0000-0000-0000-0000000141c1') $q$) = '', 'Sari reports two repairs');
select pg_temp.fresh();
select pg_temp.ok(pg_temp.err_as(:a1, $q$
  update public.repairs set status = 'open' where id = '00000000-0000-0000-0000-0000000141ab' $q$) = '',
  'the admin accepts one');
select pg_temp.ok((select count(*) = 0 from pushes), '... no push yet (Dijadwalkan shows it)');
select pg_temp.ok(pg_temp.err_as(:a1, $q$
  update public.repairs set status = 'fixed' where id = '00000000-0000-0000-0000-0000000141ab' $q$) = '',
  '... then marks it fixed');
select pg_temp.ok((select count(*) = 1 and bool_and(user_id = :p1::uuid and title = 'Sudah diperbaiki' and body = 'Lampu teras'
                          and tag = 'perbaikan-00000000-0000-0000-0000-0000000141ab') from pushes),
  '... "Sudah diperbaiki"');
select pg_temp.fresh();
select pg_temp.ok(pg_temp.err_as(:a1, $q$
  update public.repairs set status = 'dismissed', dismiss_reason = 'Terlalu mahal'
   where id = '00000000-0000-0000-0000-0000000141aa' $q$) = '', 'the admin dismisses the other, with a reason');
select pg_temp.ok((select count(*) = 1 and bool_and(title = 'Laporan sudah dicek'
                          and body = 'Keran bocor: tidak perlu diperbaiki.' and body not like '%mahal%') from pushes),
  '... the reporter hears it, without the reason');

-- ---- Turning off, unlinking, the export ------------------------------------------------------
select pg_temp.ok(pg_temp.json_as(:p2, $q$ select public.set_my_push_person('00000000-0000-0000-0000-0000000141c3', false) $q$)
  ->> 'status' = 'ok', 'Dewi turns hers off on p2 (no PIN needed)');
select pg_temp.ok(jsonb_array_length(pg_temp.json_as(:p2, 'select public.my_phone_push_people()') -> 'people') = 1,
  '... p2 now notifies only Wati');

update public.device_sessions set last_seen_at = now() - interval '1 day' where user_id = :p2::uuid;
select pg_temp.ok((select e -> 'staff_notifications' @> jsonb_build_array(jsonb_build_object('phone', 'HP 1', 'staff', 'Sari'))
                          and e -> 'linked_phones' -> 0 ->> 'phone' = 'HP 1'
                          and e::text not like '%fcm.googleapis.com%'
                          and (e -> 'household' ->> 'staff_push')::boolean
                     from (select pg_temp.json_as(:a1, 'select public.export_household_data()') as e) x),
  'the export lists who gets notifications on which phone, never an endpoint');
update public.device_sessions set last_seen_at = now() - interval '2 days' where user_id = :p1::uuid;
select pg_temp.ok((select e -> 'staff_notifications' @> jsonb_build_array(jsonb_build_object('phone', 'HP 2', 'staff', 'Sari'))
                          and e -> 'staff_notifications' @> jsonb_build_array(jsonb_build_object('phone', 'HP 1', 'staff', 'Wati'))
                     from (select pg_temp.json_as(:a1, 'select public.export_household_data()') as e) x),
  '... numbered as Linked staff phones lists them, last sign-in first (review fix)');

delete from public.device_sessions where user_id = :p1::uuid;
select pg_temp.ok((select count(*) = 0 from public.staff_push_people where device_user_id = :p1::uuid),
  'unlinking p1 deletes its list');
select pg_temp.fresh();
select pg_temp.ok(pg_temp.err_as(:a1, format($q$
  insert into public.household_tasks (household_id, title, due_date, assigned_to)
  values ('00000000-0000-0000-0000-0000000141f1', 'Setelah dihapus', %L, '00000000-0000-0000-0000-0000000141c1') $q$,
  pg_temp.today())) = '', 'a chore for Sari after her phone was unlinked');
select pg_temp.ok((select count(*) = 0 from pushes), '... no push');

-- ---- Grants -------------------------------------------------------------------------------
select pg_temp.ok(not has_function_privilege('anon', 'public.my_phone_push_people()', 'execute')
                  and not has_function_privilege('anon', 'public.set_my_push_person(uuid, boolean, text)', 'execute')
                  and not has_function_privilege('anon', 'public.staff_push_overview()', 'execute')
                  and not has_function_privilege('anon', 'public.set_household_staff_push(boolean)', 'execute')
                  and not has_function_privilege('anon', 'public.staff_will_be_notified(uuid[], boolean)', 'execute'),
  'logged-out callers reach none of the new functions');
select pg_temp.ok(has_function_privilege('authenticated', 'public.my_phone_push_people()', 'execute')
                  and has_function_privilege('authenticated', 'public.set_my_push_person(uuid, boolean, text)', 'execute')
                  and has_function_privilege('authenticated', 'public.staff_push_overview()', 'execute'),
  'signed-in sessions reach the ones they call');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.queue_staff_push(uuid, uuid, text, text, text, text, text, boolean)', 'execute')
                  and not has_function_privilege('authenticated', 'public.queue_staff_task_push(uuid, uuid, uuid[], text, date)', 'execute')
                  and not has_function_privilege('authenticated', 'public.phone_is_shared(uuid)', 'execute')
                  and not has_function_privilege('authenticated', 'public.staff_push_phone_household()', 'execute')
                  and not has_function_privilege('authenticated', 'public.notify_staff_tasks_added()', 'execute')
                  and not has_function_privilege('authenticated', 'public.notify_staff_repair_closed()', 'execute'),
  'nobody but the database queues a staff push');
select pg_temp.ok(not has_table_privilege('authenticated', 'public.staff_push_people', 'select')
                  and not has_table_privilege('anon', 'public.staff_push_people', 'select'),
  'the phone lists are read only through the functions');

rollback;
