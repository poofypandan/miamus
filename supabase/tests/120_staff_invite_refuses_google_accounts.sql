-- Migration 120 checks: a staff invite can't be redeemed by a Google account.
-- LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/120_staff_invite_refuses_google_accounts.sql
-- Every line printed starts with "ok"; a failure stops with "FAIL: …".
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

-- The owner (Google) and a staff phone (anonymous).
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000120a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin120@test.local', false, now(), now()),
  ('00000000-0000-0000-0000-0000000120b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now(), now());
insert into public.households (id, name, owner_auth_id)
values ('00000000-0000-0000-0000-0000000120f1', 'Rumah 120', '00000000-0000-0000-0000-0000000120a1');
insert into public.household_members (household_id, user_id, role)
values ('00000000-0000-0000-0000-0000000120f1', '00000000-0000-0000-0000-0000000120a1', 'owner');
insert into public.staff_invites (household_id, token, expires_at)
values ('00000000-0000-0000-0000-0000000120f1', 'invite-120', now() + interval '1 day');

set local role authenticated;

select pg_temp.act('00000000-0000-0000-0000-0000000120a1');
do $$ begin
  perform public.redeem_staff_invite('invite-120');
  raise exception 'FAIL: a Google account redeemed a staff invite';
exception when insufficient_privilege then null; end $$;
select pg_temp.ok(true, 'a Google account is refused');

reset role;
select pg_temp.ok((select used_at is null from public.staff_invites where token = 'invite-120'),
  'the invite is left unused');
select pg_temp.ok(not exists (select 1 from public.device_sessions where user_id = '00000000-0000-0000-0000-0000000120a1'),
  'the Google account is not filed as a staff phone');

set local role authenticated;
select pg_temp.act('00000000-0000-0000-0000-0000000120b1');
select pg_temp.ok(public.redeem_staff_invite('invite-120') = '00000000-0000-0000-0000-0000000120f1',
  'the staff phone redeems the same invite');
reset role;
select pg_temp.ok(exists (select 1 from public.device_sessions where user_id = '00000000-0000-0000-0000-0000000120b1'),
  'and is linked to the household');

rollback;
