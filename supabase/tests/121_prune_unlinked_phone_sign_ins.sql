-- Migration 121 checks: unlinked, unused phone sign-ins are removed; nothing
-- else is. LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/121_prune_unlinked_phone_sign_ins.sql
\set ON_ERROR_STOP on
\pset footer off
begin;

create function pg_temp.ok(cond boolean, label text) returns text language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  return 'ok  ' || label;
end $$;

insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at, last_sign_in_at) values
  -- an owner (Google), long unused
  ('00000000-0000-0000-0000-0000000121a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin121@test.local', false, now() - interval '90 days', now(), now() - interval '90 days'),
  -- a linked phone, long unused: kept
  ('00000000-0000-0000-0000-0000000121b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now() - interval '90 days', now(), now() - interval '90 days'),
  -- an unlinked phone, unused for 8 days: removed
  ('00000000-0000-0000-0000-0000000121b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now() - interval '60 days', now(), now() - interval '8 days'),
  -- an unlinked phone, signed in 2 days ago (mid-way through linking): kept
  ('00000000-0000-0000-0000-0000000121b3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now() - interval '60 days', now(), now() - interval '2 days'),
  -- an unlinked phone that never signed in again, created 10 days ago: removed
  ('00000000-0000-0000-0000-0000000121b4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now() - interval '10 days', now(), null);
insert into public.households (id, name, owner_auth_id)
values ('00000000-0000-0000-0000-0000000121f1', 'Rumah 121', '00000000-0000-0000-0000-0000000121a1');
insert into public.household_members (household_id, user_id, role)
values ('00000000-0000-0000-0000-0000000121f1', '00000000-0000-0000-0000-0000000121a1', 'owner');
insert into public.device_sessions (user_id, household_id)
values ('00000000-0000-0000-0000-0000000121b1', '00000000-0000-0000-0000-0000000121f1');

select pg_temp.ok(public.prune_unlinked_phone_sign_ins() >= 2, 'prune removes something');
select pg_temp.ok(not exists (select 1 from auth.users where id in ('00000000-0000-0000-0000-0000000121b2', '00000000-0000-0000-0000-0000000121b4')),
  'unlinked phones unused for 7+ days are removed');
select pg_temp.ok(exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000121b1'),
  'a linked phone is kept, however long unused');
select pg_temp.ok(exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000121b3'),
  'a phone that signed in recently is kept');
select pg_temp.ok(exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000121a1'),
  'a Google account is never touched');
select pg_temp.ok((select count(*) = 1 from cron.job where jobname = 'prune-unlinked-phone-sign-ins'),
  'the nightly job is scheduled');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.prune_unlinked_phone_sign_ins()', 'execute'),
  'signed-in clients cannot call it');

rollback;
