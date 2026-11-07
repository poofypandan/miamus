-- Migration 125 checks: the fifteen rewritten policies decide exactly as
-- before — who can see and change what on each table they cover.
-- LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/125_rls_auth_uid_once.sql
\set ON_ERROR_STOP on
\pset footer off
begin;

create function pg_temp.ok(cond boolean, label text) returns text language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  return 'ok  ' || label;
end $$;
create function pg_temp.act(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

select pg_temp.ok((select count(*) = 0 from pg_policies where schemaname = 'public'
                    and regexp_replace(coalesce(qual, '') || coalesce(with_check, ''),
                                       '\( SELECT auth\.uid\(\) AS uid\)', '', 'g') ~ 'auth\.uid\(\)'),
  'no policy calls auth.uid() once per row any more');

-- A: admin a1 and staff phone b1. B: admin a2.
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000125a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a125@test.local', false, now(), now()),
  ('00000000-0000-0000-0000-0000000125a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b125@test.local', false, now(), now()),
  ('00000000-0000-0000-0000-0000000125b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now(), now());
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000125f1', 'Rumah A', '00000000-0000-0000-0000-0000000125a1'),
  ('00000000-0000-0000-0000-0000000125f2', 'Rumah B', '00000000-0000-0000-0000-0000000125a2');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000125f1', '00000000-0000-0000-0000-0000000125a1', 'owner'),
  ('00000000-0000-0000-0000-0000000125f2', '00000000-0000-0000-0000-0000000125a2', 'owner');
insert into public.device_sessions (user_id, household_id)
values ('00000000-0000-0000-0000-0000000125b1', '00000000-0000-0000-0000-0000000125f1');
insert into public.staff_profiles (id, household_id, name)
values ('00000000-0000-0000-0000-0000000125e1', '00000000-0000-0000-0000-0000000125f1', 'Sari');
insert into public.leave_requests (id, household_id, staff_id, start_date, end_date)
values ('00000000-0000-0000-0000-0000000125c1', '00000000-0000-0000-0000-0000000125f1',
        '00000000-0000-0000-0000-0000000125e1', current_date + 1, current_date + 2);
insert into public.owner_invites (household_id, token, expires_at)
values ('00000000-0000-0000-0000-0000000125f1', 'tok-owner-125', now() + interval '1 day');
insert into public.staff_invites (household_id, token, expires_at)
values ('00000000-0000-0000-0000-0000000125f1', 'tok-staff-125', now() + interval '1 day');

-- --- The admin of A ----------------------------------------------------------------
set local role authenticated;
select pg_temp.act('00000000-0000-0000-0000-0000000125a1');
select pg_temp.ok((select count(*) = 1 from public.household_members), 'an admin sees only their own membership');
select pg_temp.ok((select count(*) = 1 from public.households), 'and only their own household');
select pg_temp.ok((select count(*) = 1 from public.owner_invites) and (select count(*) = 1 from public.staff_invites),
  'and their household''s invites');
insert into public.household_locations (household_id, name) values ('00000000-0000-0000-0000-0000000125f1', 'Dapur');
select pg_temp.ok((select count(*) = 1 from public.household_locations where name = 'Dapur'), 'an admin adds a room');
update public.leave_requests set status = 'rejected' where id = '00000000-0000-0000-0000-0000000125c1';
select pg_temp.ok((select status = 'rejected' from public.leave_requests where id = '00000000-0000-0000-0000-0000000125c1'),
  'an admin decides leave');
insert into public.push_subscriptions (household_id, subscription)
values ('00000000-0000-0000-0000-0000000125f1',
        '{"endpoint": "https://fcm.googleapis.com/fcm/send/x125", "keys": {"p256dh": "k", "auth": "a"}}');
select pg_temp.ok((select count(*) = 1 from public.push_subscriptions), 'an admin registers their own phone for pushes');

-- --- The staff phone of A ------------------------------------------------------------
select pg_temp.act('00000000-0000-0000-0000-0000000125b1');
select pg_temp.ok((select count(*) = 1 from public.device_sessions), 'a staff phone sees its own link');
select pg_temp.ok((select count(*) = 0 from public.household_members), 'and no memberships');
select pg_temp.ok((select count(*) = 0 from public.push_subscriptions), 'and not the admin''s push subscription');
select pg_temp.ok((select count(*) = 0 from public.owner_invites) and (select count(*) = 0 from public.staff_invites),
  'and no invites');
do $$ begin
  insert into public.household_locations (household_id, name) values ('00000000-0000-0000-0000-0000000125f1', 'Gudang');
  raise exception 'FAIL: staff phone added a room';
exception when insufficient_privilege then null; end $$;
select pg_temp.ok(true, 'a staff phone cannot add a room');
update public.leave_requests set status = 'approved' where id = '00000000-0000-0000-0000-0000000125c1';
delete from public.leave_requests where id = '00000000-0000-0000-0000-0000000125c1';
reset role;
select pg_temp.ok((select status = 'rejected' from public.leave_requests where id = '00000000-0000-0000-0000-0000000125c1'),
  'a staff phone can neither decide nor delete leave');

-- --- The admin of B --------------------------------------------------------------------
set local role authenticated;
select pg_temp.act('00000000-0000-0000-0000-0000000125a2');
select pg_temp.ok((select count(*) = 1 from public.households where id = '00000000-0000-0000-0000-0000000125f2')
                  and (select count(*) = 0 from public.households where id = '00000000-0000-0000-0000-0000000125f1'),
  'another household''s admin sees only their own household');
select pg_temp.ok((select count(*) = 0 from public.household_locations) and (select count(*) = 0 from public.owner_invites),
  'and none of A''s rooms or invites');
delete from public.household_locations where household_id = '00000000-0000-0000-0000-0000000125f1';
reset role;
select pg_temp.ok((select count(*) = 1 from public.household_locations where name = 'Dapur'),
  'and cannot delete A''s rooms');

rollback;
