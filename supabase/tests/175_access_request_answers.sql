-- Migration 175 checks: the two Request access answers are stored (trimmed,
-- empty as null), length limits hold, an old app build calling with no
-- arguments still files its request, an existing request keeps its answers,
-- automatic approval stores them too, the push never carries them, only
-- platform admins read them, the nightly prune clears them after 12 months
-- and leaves the request, and the grants.
-- LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/175_access_request_answers.sql
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

-- Manual approval, whatever the local switch says; nobody else's automatic
-- approvals today count.
update public.signup_config set auto_approve = false, daily_auto_cap = 25;
delete from public.household_access_requests where auto;

-- ---- People -------------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at, raw_user_meta_data)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, anon, now(), now(),
       jsonb_build_object('full_name', nm)
from (values
  ('00000000-0000-0000-0000-0000000175aa', 'admin175@test.local', false, 'Admin'),
  ('00000000-0000-0000-0000-0000000175a1', 'a1@test.local', false, 'Sam Lee'),
  ('00000000-0000-0000-0000-0000000175a2', 'a2@test.local', false, 'Dewi'),
  ('00000000-0000-0000-0000-0000000175a3', 'a3@test.local', false, 'Budi'),
  ('00000000-0000-0000-0000-0000000175a4', 'a4@test.local', false, 'Rina'),
  ('00000000-0000-0000-0000-0000000175a5', 'a5@test.local', false, 'Wati'),
  ('00000000-0000-0000-0000-0000000175b1', null, true, null)
) as u(id, email, anon, nm);
insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000175aa');
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000175fa', 'Rumah Admin', '00000000-0000-0000-0000-0000000175aa');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000175fa', '00000000-0000-0000-0000-0000000175aa', 'owner');
insert into public.push_subscriptions (user_id, household_id, subscription)
values ('00000000-0000-0000-0000-0000000175aa', '00000000-0000-0000-0000-0000000175fa',
        jsonb_build_object('endpoint', 'https://fcm.googleapis.com/fcm/send/admin175',
                           'keys', jsonb_build_object('p256dh', 'k', 'auth', 'a')));

\set pa '''00000000-0000-0000-0000-0000000175aa'''
\set a1 '''00000000-0000-0000-0000-0000000175a1'''
\set a2 '''00000000-0000-0000-0000-0000000175a2'''
\set a3 '''00000000-0000-0000-0000-0000000175a3'''
\set a4 '''00000000-0000-0000-0000-0000000175a4'''
\set a5 '''00000000-0000-0000-0000-0000000175a5'''
\set s1 '''00000000-0000-0000-0000-0000000175b1'''

-- ---- Asking, with the answers ----------------------------------------------------------------
select pg_temp.ok(pg_temp.text_as(:a1,
  $q$ select public.request_household_access('  Running the house with staff, pets  ', ' My sister ') $q$) = 'pending',
  'asking with both answers files a pending request');
select pg_temp.ok((select wants_help_with = 'Running the house with staff, pets' and heard_from = 'My sister'
                     from public.household_access_requests where user_id = :a1::uuid),
  '... both stored, trimmed');
select pg_temp.ok((select count(*) = 1 from pg_temp.pushes
                    where user_id = :pa::uuid and title = 'New household request'
                      and body = 'Sam Lee is waiting for your approval.'),
  '... the operator is pushed, with the same text as before');
select pg_temp.ok(not exists (select 1 from pg_temp.pushes where body ilike '%staff%' or body ilike '%sister%'
                                                              or title ilike '%staff%' or title ilike '%sister%'),
  '... and the push carries neither answer');

select pg_temp.ok(pg_temp.text_as(:a2,
  $q$ select public.request_household_access(p_wants_help_with => 'Repairs in a new house', p_heard_from => '   ') $q$) = 'pending',
  'the second answer is optional');
select pg_temp.ok((select wants_help_with = 'Repairs in a new house' and heard_from is null
                     from public.household_access_requests where user_id = :a2::uuid),
  '... blank is stored as nothing');

-- An old app build: no arguments at all.
select pg_temp.ok(pg_temp.text_as(:a3, 'select public.request_household_access()') = 'pending',
  'an old app build calling with no arguments still files its request');
select pg_temp.ok((select wants_help_with is null and heard_from is null and status = 'pending'
                     from public.household_access_requests where user_id = :a3::uuid),
  '... with no answers');

-- ---- Limits -----------------------------------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:a4, format('select public.request_household_access(%L, null)', repeat('a', 301)))
                  like '%invalid_access_answer%',
  'more than 300 characters is refused');
select pg_temp.ok(pg_temp.err_as(:a4, format('select public.request_household_access(%L, %L)', 'Pets', repeat('b', 101)))
                  like '%invalid_access_answer%',
  'a source longer than 100 characters is refused');
select pg_temp.ok(not exists (select 1 from public.household_access_requests where user_id = :a4::uuid),
  '... and nothing was written');
select pg_temp.ok(pg_temp.text_as(:a4, format('select public.request_household_access(%L, %L)', repeat('a', 300), repeat('b', 100))) = 'pending',
  'exactly 300 and 100 are fine');
select pg_temp.ok(pg_temp.err_as(:s1, $q$ select public.request_household_access('Pets', null) $q$)
                  like '%anonymous_cannot_request_household%',
  'a staff phone still cannot ask');
select pg_temp.ok(pg_temp.err_as(null, $q$ select public.request_household_access('Pets', null) $q$)
                  like '%permission denied%',
  'a signed-out caller cannot reach it');

-- ---- Asking again changes nothing --------------------------------------------------------------
select pg_temp.ok(pg_temp.text_as(:a1, $q$ select public.request_household_access('Something else', 'Someone else') $q$) = 'pending',
  'asking again returns the request as it is');
select pg_temp.ok((select wants_help_with = 'Running the house with staff, pets' and heard_from = 'My sister'
                     from public.household_access_requests where user_id = :a1::uuid),
  '... its answers unchanged');

-- ---- Automatic approval (if ever switched on) stores them too ---------------------------------
update public.signup_config set auto_approve = true, daily_auto_cap = 25;
select pg_temp.ok(pg_temp.text_as(:a5, $q$ select public.request_household_access('Kitchen and groceries', 'Instagram') $q$) = 'approved',
  'switched on: asking is approved automatically');
select pg_temp.ok((select auto and wants_help_with = 'Kitchen and groceries' and heard_from = 'Instagram'
                     from public.household_access_requests where user_id = :a5::uuid),
  '... with the answers stored');
update public.signup_config set auto_approve = false;

-- ---- Who reads them ------------------------------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:a1, 'select * from public.list_household_access_requests()') like '%not_platform_admin%',
  'a requester cannot list requests');
select pg_temp.ok(pg_temp.err_as(:a1, 'select wants_help_with from public.household_access_requests') like '%permission denied%',
  'nor read the table');
select pg_temp.ok(pg_temp.text_as(:pa, format(
  $q$ select wants_help_with || ' / ' || heard_from from public.list_household_access_requests() where user_id = %L $q$, :a1))
  = 'Running the house with staff, pets / My sister',
  'a platform admin sees both answers in the list');
select pg_temp.ok(pg_temp.text_as(:pa, format(
  $q$ select coalesce(heard_from, 'none') from public.list_household_access_requests() where user_id = %L $q$, :a2)) = 'none',
  '... and nothing where none was given');

-- ---- Kept 12 months --------------------------------------------------------------------------------
update public.household_access_requests set requested_at = now() - interval '13 months' where user_id = :a1::uuid;
update public.household_access_requests set requested_at = now() - interval '11 months' where user_id = :a2::uuid;
select public.prune_household_access_requests();
select pg_temp.ok((select wants_help_with is null and heard_from is null and status = 'pending'
                     from public.household_access_requests where user_id = :a1::uuid),
  'the prune clears answers given over 12 months ago, and keeps the request');
select pg_temp.ok((select wants_help_with = 'Repairs in a new house' from public.household_access_requests where user_id = :a2::uuid),
  '... and leaves younger ones alone');

-- ---- Grants -------------------------------------------------------------------------------------
select pg_temp.ok(not exists (select 1 from pg_proc where proname = 'request_household_access'
                                and pg_get_function_identity_arguments(oid) = ''),
  'the no-argument version is gone (no ambiguous calls)');
select pg_temp.ok(not has_function_privilege('anon', 'public.request_household_access(text, text)', 'execute')
                  and has_function_privilege('authenticated', 'public.request_household_access(text, text)', 'execute'),
  'request: authenticated only, never anon');
select pg_temp.ok(not has_function_privilege('anon', 'public.list_household_access_requests()', 'execute'),
  'list: never anon');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.prune_household_access_requests()', 'execute')
                  and not has_function_privilege('anon', 'public.prune_household_access_requests()', 'execute'),
  'prune: the service role and cron only');

rollback;
