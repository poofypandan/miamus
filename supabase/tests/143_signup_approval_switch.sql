-- Migration 143 checks: the switch is OFF by default and nothing about
-- signing up changes (ask, wait for the operator); switched on, a new Google
-- account sees 'open' and creates its household with no wait (approved
-- automatically, the operator told); the daily cap and the switch fall back
-- to manual approval without writing anything; old app builds asking first
-- are approved too; rejected,
-- pending, anonymous and second-household accounts are refused as before;
-- platform admins unaffected; the global lock; the approvals list; grants.
-- LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/143_signup_approval_switch.sql
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
create function pg_temp.text_as(uid uuid, stmt text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute stmt into v;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return v;
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

-- Nobody else's automatic approvals today count against these checks.
delete from public.household_access_requests where auto;

-- ---- People -------------------------------------------------------------------------------
-- pa: platform admin (Indonesian), member of fa with a push device.
-- n1–n4: new Google accounts. rj: rejected. pd: pending. o1: already in a
-- household (a co-owner), no request. s1: a staff phone.
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at, raw_user_meta_data)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, anon, now(), now(),
       jsonb_build_object('full_name', nm)
from (values
  ('00000000-0000-0000-0000-0000000143aa', 'admin143@test.local', false, 'Admin'),
  ('00000000-0000-0000-0000-0000000143a1', 'n1@test.local', false, 'Sam Lee'),
  ('00000000-0000-0000-0000-0000000143a2', 'n2@test.local', false, 'Dewi'),
  ('00000000-0000-0000-0000-0000000143a3', 'n3@test.local', false, 'Budi'),
  ('00000000-0000-0000-0000-0000000143a4', 'n4@test.local', false, 'Rina'),
  ('00000000-0000-0000-0000-0000000143a5', 'rj@test.local', false, 'Rejected'),
  ('00000000-0000-0000-0000-0000000143a6', 'pd@test.local', false, 'Pending'),
  ('00000000-0000-0000-0000-0000000143a7', 'o1@test.local', false, 'Co Owner'),
  ('00000000-0000-0000-0000-0000000143a8', 'n5@test.local', false, 'Wati'),
  ('00000000-0000-0000-0000-0000000143b1', null, true, null)
) as u(id, email, anon, nm);
insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000143aa');
insert into public.user_preferences (user_id, locale) values
  ('00000000-0000-0000-0000-0000000143aa', 'id'),
  ('00000000-0000-0000-0000-0000000143a2', 'id');
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000143fa', 'Rumah Admin', '00000000-0000-0000-0000-0000000143aa');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000143fa', '00000000-0000-0000-0000-0000000143aa', 'owner'),
  ('00000000-0000-0000-0000-0000000143fa', '00000000-0000-0000-0000-0000000143a7', 'admin');
insert into public.device_sessions (user_id, household_id) values
  ('00000000-0000-0000-0000-0000000143b1', '00000000-0000-0000-0000-0000000143fa');
insert into public.push_subscriptions (user_id, household_id, subscription)
values ('00000000-0000-0000-0000-0000000143aa', '00000000-0000-0000-0000-0000000143fa',
        jsonb_build_object('endpoint', 'https://fcm.googleapis.com/fcm/send/admin143',
                           'keys', jsonb_build_object('p256dh', 'k', 'auth', 'a')));
insert into public.household_access_requests (user_id, status, requested_at, decided_at) values
  ('00000000-0000-0000-0000-0000000143a5', 'rejected', now() - interval '2 days', now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000143a6', 'pending', now() - interval '1 day', null);

\set pa '''00000000-0000-0000-0000-0000000143aa'''
\set n1 '''00000000-0000-0000-0000-0000000143a1'''
\set n2 '''00000000-0000-0000-0000-0000000143a2'''
\set n3 '''00000000-0000-0000-0000-0000000143a3'''
\set n4 '''00000000-0000-0000-0000-0000000143a4'''
\set rj '''00000000-0000-0000-0000-0000000143a5'''
\set pd '''00000000-0000-0000-0000-0000000143a6'''
\set o1 '''00000000-0000-0000-0000-0000000143a7'''
\set s1 '''00000000-0000-0000-0000-0000000143b1'''

\set n5 '''00000000-0000-0000-0000-0000000143a8'''

-- ---- Off by default: the owner approves every new household (2026-11-10) -------------------
select pg_temp.ok((select column_default = 'false' from information_schema.columns
                    where table_schema = 'public' and table_name = 'signup_config' and column_name = 'auto_approve'),
  'the switch defaults to off');
select pg_temp.ok((select not auto_approve and daily_auto_cap = 25 from public.signup_config),
  'the one row says off, with the cap ready for later');
select pg_temp.ok(pg_temp.text_as(:n5, 'select public.my_household_access()') = 'none',
  'off: a new account is not open, so the screen shows Request access');
select pg_temp.ok(pg_temp.err_as(:n5, $q$ select public.create_household('Rumah Wati', false) $q$) like '%household_not_approved%',
  '... creating is refused');
select pg_temp.ok(not exists (select 1 from public.household_access_requests where user_id = :n5::uuid),
  '... and nothing is written');
select pg_temp.ok(pg_temp.text_as(:n5, 'select public.request_household_access()') = 'pending',
  '... asking files a pending request');
select pg_temp.ok((select count(*) = 1 from pg_temp.pushes where user_id = :pa::uuid and title = 'New household request'),
  '... and the operator is pushed to approve it');
select pg_temp.ok(pg_temp.err_as(:pa, format('select public.decide_household_access(%L, true)', :n5)) = '',
  'the operator approves');
select pg_temp.ok(pg_temp.err_as(:n5, $q$ select public.create_household('Rumah Wati', false) $q$) = '',
  '... and only then can the household be created');
select pg_temp.ok(not exists (select 1 from pg_temp.pushes where title in ('New household', 'Rumah baru')),
  '... with no "just joined" push for a hand approval');

-- ---- Switched on by a platform admin, for the checks below ----------------------------------
update public.signup_config set auto_approve = true, daily_auto_cap = 25;
delete from pg_temp.pushes;

-- ---- What the screen is told -----------------------------------------------------------------
select pg_temp.ok(pg_temp.text_as(:n1, 'select public.my_household_access()') = 'open', 'a new account is open');
select pg_temp.ok(pg_temp.text_as(:pa, 'select public.my_household_access()') = 'admin', 'a platform admin is admin');
select pg_temp.ok(pg_temp.text_as(:rj, 'select public.my_household_access()') = 'rejected', 'rejected stays rejected');
select pg_temp.ok(pg_temp.text_as(:pd, 'select public.my_household_access()') = 'pending', 'pending stays pending');
select pg_temp.ok(pg_temp.text_as(:s1, 'select public.my_household_access()') = 'none', 'a staff phone is never open');

-- ---- No wait --------------------------------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:n1, $q$ select public.create_household('Rumah Sam', true) $q$) = '',
  'a new account creates its household straight away');
select pg_temp.ok((select status = 'approved' and auto and decided_by is null and decided_at is not null
                     from public.household_access_requests where user_id = :n1::uuid),
  '... approved automatically, by nobody');
select pg_temp.ok(exists (select 1 from public.households h join public.household_members m on m.household_id = h.id
                           where h.owner_auth_id = :n1::uuid and h.name = 'Rumah Sam' and h.has_pets
                             and m.user_id = :n1::uuid and m.role = 'owner'),
  '... with its owner membership and the sign-up answer');
select pg_temp.ok((select count(*) = 1 from pg_temp.pushes
                    where user_id = :pa::uuid and title = 'Rumah baru' and body = 'Sam Lee baru bergabung.'
                      and url = '/dashboard/approvals' and tag = 'household-joined-00000000-0000-0000-0000-0000000143a1'),
  'the platform admin is told who joined, in their language');
select pg_temp.ok(exists (select 1 from pg_locks
                           where locktype = 'advisory' and granted and pid = pg_backend_pid()
                             and objid::bigint = (hashtext('auto_approve')::bigint & 4294967295)),
  'the global auto-approval lock was taken (held to the end of the transaction)');
select pg_temp.ok(pg_temp.err_as(:n1, $q$ select public.create_household('Rumah Dua', false) $q$) like '%already_has_household%',
  'a second household is still refused');
select pg_temp.ok(pg_temp.text_as(:n1, 'select public.my_household_access()') = 'approved',
  'the account now reads approved');

-- ---- Over the cap: back to waiting, nothing written ------------------------------------------
update public.signup_config set daily_auto_cap = 1;
delete from pg_temp.pushes;
select pg_temp.ok(pg_temp.text_as(:n2, 'select public.my_household_access()') = 'none',
  'with today''s one place taken, a new account is no longer open');
select pg_temp.ok(pg_temp.err_as(:n2, $q$ select public.create_household('Rumah Dewi', false) $q$) like '%household_not_approved%',
  '... creating is refused');
select pg_temp.ok(not exists (select 1 from public.household_access_requests where user_id = :n2::uuid)
                  and not exists (select 1 from public.households where owner_auth_id = :n2::uuid),
  '... and nothing was written');
select pg_temp.ok(pg_temp.text_as(:n2, 'select public.request_household_access()') = 'pending',
  'the screen then files the request: pending');
select pg_temp.ok((select count(*) = 1 from pg_temp.pushes where user_id = :pa::uuid and title = 'New household request'),
  '... and the operator gets today''s request push');
select pg_temp.ok((select not auto from public.household_access_requests where user_id = :n2::uuid),
  '... a manual request, not automatic');
-- Yesterday's automatic approvals don't count.
update public.household_access_requests set decided_at = now() - interval '1 day', requested_at = now() - interval '1 day'
 where user_id = :n1::uuid;
select pg_temp.ok(pg_temp.text_as(:n4, 'select public.my_household_access()') = 'open',
  'the cap is per Jakarta day: yesterday''s approval leaves today''s place free');

-- ---- The switch -------------------------------------------------------------------------------
update public.signup_config set auto_approve = false, daily_auto_cap = 25;
select pg_temp.ok(pg_temp.text_as(:n3, 'select public.my_household_access()') = 'none', 'switched off: not open');
select pg_temp.ok(pg_temp.err_as(:n3, $q$ select public.create_household('Rumah Budi', false) $q$) like '%household_not_approved%',
  '... creating is refused');
select pg_temp.ok(not exists (select 1 from public.household_access_requests where user_id = :n3::uuid),
  '... nothing written: today''s flow exactly');
update public.signup_config set auto_approve = true;
delete from pg_temp.pushes;
select pg_temp.ok(pg_temp.text_as(:n3, 'select public.request_household_access()') = 'approved',
  'switched on, an old app build asking first is approved straight away');
select pg_temp.ok((select auto and status = 'approved' from public.household_access_requests where user_id = :n3::uuid)
                  and not exists (select 1 from pg_temp.pushes where title = 'New household request'),
  '... automatically, with no request push');
select pg_temp.ok(pg_temp.err_as(:n3, $q$ select public.create_household('Rumah Budi', false) $q$) = '',
  '... then creates its household');
select pg_temp.ok(exists (select 1 from pg_temp.pushes where body = 'Budi baru bergabung.'),
  '... and the operator hears it joined');

-- ---- Refused as before ------------------------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:rj, $q$ select public.create_household('Rumah X', false) $q$) like '%household_not_approved%',
  'a rejected account is refused');
select pg_temp.ok((select status = 'rejected' and not auto from public.household_access_requests where user_id = :rj::uuid),
  '... and stays rejected');
select pg_temp.ok(pg_temp.err_as(:pd, $q$ select public.create_household('Rumah Y', false) $q$) like '%household_not_approved%',
  'a pending account is refused');
select pg_temp.ok(pg_temp.text_as(:pd, 'select public.request_household_access()') = 'pending',
  '... and stays manual');
select pg_temp.ok(pg_temp.err_as(:s1, $q$ select public.create_household('Rumah Z', false) $q$) like '%anonymous_cannot_create_household%',
  'a staff phone can''t create');
select pg_temp.ok(pg_temp.err_as(:s1, 'select public.request_household_access()') like '%anonymous_cannot_request_household%',
  '... or ask');
select pg_temp.ok(not exists (select 1 from public.household_access_requests where user_id = :s1::uuid),
  '... and nothing is written for it');
select pg_temp.ok(pg_temp.err_as(:o1, $q$ select public.create_household('Rumah Lain', false) $q$) like '%already_has_household%',
  'someone already in a household is refused');
select pg_temp.ok(not exists (select 1 from public.household_access_requests where user_id = :o1::uuid),
  '... and the automatic approval rolls back with it');
delete from pg_temp.pushes;
select pg_temp.ok(pg_temp.err_as(:pa, $q$ select public.create_household('Rumah Admin Dua', false) $q$) = '',
  'a platform admin still creates');
select pg_temp.ok(not exists (select 1 from public.household_access_requests where user_id = :pa::uuid)
                  and not exists (select 1 from pg_temp.pushes),
  '... with no request and no push');

-- ---- The approvals list -----------------------------------------------------------------------
select pg_temp.ok((select count(*) = 1 from (
                     select pg_temp.text_as(:pa, $q$ select auto::text || '|' || locale from public.list_household_access_requests()
                                                     where email = 'n3@test.local' $q$) as v) x where v = 'true|en'),
  'the list says which approvals were automatic, with the account''s language');
select pg_temp.ok(pg_temp.text_as(:pa, $q$ select auto::text || '|' || locale from public.list_household_access_requests()
                                          where email = 'n2@test.local' $q$) = 'false|id',
  '... and a manual one, in Indonesian');
select pg_temp.ok(pg_temp.err_as(:n1, 'select * from public.list_household_access_requests()') like '%not_platform_admin%',
  'anyone else is refused the list');

-- ---- Grants and config -----------------------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:n1, 'select * from public.signup_config') like '%permission denied%',
  'no client reads the switch');
select pg_temp.ok(pg_temp.err_as(:n4, 'select public.signup_auto_approve(auth.uid())') like '%permission denied%',
  'nobody approves themselves through the internal function');
select pg_temp.ok(not exists (select 1 from public.household_access_requests where user_id = :n4::uuid),
  '... nothing written');
select pg_temp.ok(not has_function_privilege('anon', 'public.my_household_access()', 'execute')
                  and not has_function_privilege('anon', 'public.request_household_access()', 'execute')
                  and not has_function_privilege('anon', 'public.list_household_access_requests()', 'execute')
                  and not has_function_privilege('anon', 'public.create_household(text, boolean)', 'execute')
                  and not has_function_privilege('anon', 'public.signup_auto_open()', 'execute')
                  and not has_function_privilege('anon', 'public.signup_auto_approve(uuid)', 'execute')
                  and not has_function_privilege('anon', 'public.notify_household_joined(uuid, text)', 'execute'),
  'anon executes none of them');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.signup_auto_open()', 'execute')
                  and not has_function_privilege('authenticated', 'public.signup_auto_approve(uuid)', 'execute')
                  and not has_function_privilege('authenticated', 'public.notify_household_joined(uuid, text)', 'execute')
                  and has_function_privilege('authenticated', 'public.create_household(text, boolean)', 'execute')
                  and has_function_privilege('authenticated', 'public.my_household_access()', 'execute'),
  'authenticated gets the public four, never the internal three');
select pg_temp.ok((select count(*) = 1 from public.signup_config), 'one config row');
select pg_temp.ok((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc
                    where oid in ('public.signup_auto_open()'::regprocedure, 'public.signup_auto_approve(uuid)'::regprocedure,
                                  'public.notify_household_joined(uuid, text)'::regprocedure,
                                  'public.my_household_access()'::regprocedure, 'public.request_household_access()'::regprocedure,
                                  'public.list_household_access_requests()'::regprocedure,
                                  'public.create_household(text, boolean)'::regprocedure)),
  'every definer function pins an empty search_path');

rollback;
