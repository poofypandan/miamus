-- Migration 171 checks: Kakak may record set_staff_areas (Phase 178
-- follow-up). kakak_record accepts the new name next to the six 155 knew and
-- still refuses an unknown one; the tools column's check does the same for a
-- direct write; every other rule of kakak_record is as 126 and 155 left it (admins
-- of the row's household only, once, while pending); SECURITY DEFINER, its
-- search_path, and grants (no anon, no public).
-- LOCAL DATABASE ONLY. One transaction, rolled back. Run after 171 is
-- applied, or with it in the same transaction:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/171_kakak_set_staff_areas.sql
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
-- kakak_record for one request, with these tools, as the statement err_as runs.
create function pg_temp.record_stmt(req uuid, tools text[]) returns text language sql as $$
  select format('select public.kakak_record(%L, %L, %L, %L::text[], 10, 0, 0, 5, 100, 900)',
                req, 'claude-opus-5-5', 'suggestion', tools)
$$;

-- ---- Households ----------------------------------------------------------------------
-- f1: owner a1 and staff phone p1. f2: owner a9.
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, anon, now(), now()
from (values
  ('00000000-0000-0000-0000-0000000171a1', 'one171@test.local', false),
  ('00000000-0000-0000-0000-0000000171a9', 'nine171@test.local', false),
  ('00000000-0000-0000-0000-0000000171b1', null, true)
) as u(id, email, anon);
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000171f1', 'Rumah Melati', '00000000-0000-0000-0000-0000000171a1'),
  ('00000000-0000-0000-0000-0000000171f2', 'Rumah Kenanga', '00000000-0000-0000-0000-0000000171a9');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000171f1', '00000000-0000-0000-0000-0000000171a1', 'owner'),
  ('00000000-0000-0000-0000-0000000171f2', '00000000-0000-0000-0000-0000000171a9', 'owner');
insert into public.device_sessions (user_id, household_id) values
  ('00000000-0000-0000-0000-0000000171b1', '00000000-0000-0000-0000-0000000171f1');
-- Pending requests, as kakak_begin leaves them.
insert into public.kakak_requests (id, household_id, user_id) values
  ('00000000-0000-0000-0000-0000000171d1', '00000000-0000-0000-0000-0000000171f1', '00000000-0000-0000-0000-0000000171a1'),
  ('00000000-0000-0000-0000-0000000171d2', '00000000-0000-0000-0000-0000000171f1', '00000000-0000-0000-0000-0000000171a1'),
  ('00000000-0000-0000-0000-0000000171d3', '00000000-0000-0000-0000-0000000171f1', '00000000-0000-0000-0000-0000000171a1'),
  ('00000000-0000-0000-0000-0000000171d4', '00000000-0000-0000-0000-0000000171f1', '00000000-0000-0000-0000-0000000171a1');

\set a1 '''00000000-0000-0000-0000-0000000171a1'''
\set a9 '''00000000-0000-0000-0000-0000000171a9'''
\set p1 '''00000000-0000-0000-0000-0000000171b1'''
\set f1 '''00000000-0000-0000-0000-0000000171f1'''
\set r1 '''00000000-0000-0000-0000-0000000171d1'''
\set r2 '''00000000-0000-0000-0000-0000000171d2'''
\set r3 '''00000000-0000-0000-0000-0000000171d3'''
\set r4 '''00000000-0000-0000-0000-0000000171d4'''

-- ---- kakak_record ------------------------------------------------------------------------
-- Each call is its own statement: a subquery in the same expression would
-- read the row as it was before the call.
select pg_temp.ok(pg_temp.err_as(:a1, pg_temp.record_stmt(:r1, array['set_staff_areas', 'ask_question'])) = '',
  'an admin records a call that used set_staff_areas');
select pg_temp.ok((select tools = array['set_staff_areas', 'ask_question'] and outcome = 'suggestion'
                          and input_tokens = 10 and output_tokens = 5 and latency_ms = 900
                     from public.kakak_requests where id = :r1),
  '... with its tools, outcome, tokens and time');
select pg_temp.ok(pg_temp.err_as(:a1, pg_temp.record_stmt(:r2,
                    array['create_chore', 'add_to_shopping_list', 'add_pet_routine', 'add_food', 'put_away_ingredient', 'ask_question'])) = '',
  'the six names 155 accepted are still accepted');
select pg_temp.ok(pg_temp.err_as(:a1, pg_temp.record_stmt(:r3, array['set_staff_areas', 'delete_everything'])) like '%bad_tools%',
  'an unknown name is still bad_tools');
select pg_temp.ok((select outcome = 'pending' from public.kakak_requests where id = :r3),
  '... and the row stays pending');
select pg_temp.ok(pg_temp.err_as(:a1, pg_temp.record_stmt(:r3, array['set_staff_areas', null])) like '%bad_tools%',
  '... as is a null name');
select pg_temp.ok(pg_temp.err_as(:a1, pg_temp.record_stmt(:r1, array['set_staff_areas'])) like '%already_recorded%',
  'a row is recorded once');
select pg_temp.ok(pg_temp.err_as(:a9, pg_temp.record_stmt(:r4, array['set_staff_areas'])) like '%not_admin%',
  'another household''s admin can''t record it');
select pg_temp.ok(pg_temp.err_as(:p1, pg_temp.record_stmt(:r4, array['set_staff_areas'])) like '%not_admin%',
  'a staff phone of the same household can''t either');
select pg_temp.ok(pg_temp.err_as(null, pg_temp.record_stmt(:r4, array['set_staff_areas'])) like '%permission denied%',
  'anon can''t call it');
select pg_temp.ok((select outcome = 'pending' from public.kakak_requests where id = :r4),
  '... and the row is untouched');

-- ---- The tools column ----------------------------------------------------------------------
select pg_temp.ok((select count(*) = 1 from public.kakak_requests where id = :r1 and 'set_staff_areas' = any (tools)),
  'the column holds the new name');
do $$
begin
  begin
    update public.kakak_requests set tools = array['set_staff_areas', 'shell'] where id = '00000000-0000-0000-0000-0000000171d2';
    raise exception 'FAIL: the check let an unknown name in';
  exception when check_violation then null;
  end;
  update public.kakak_requests set tools = array['set_staff_areas'] where id = '00000000-0000-0000-0000-0000000171d2';
end $$;
select pg_temp.ok(true, 'the check refuses an unknown name and accepts set_staff_areas, even for a direct write');
select pg_temp.ok((select count(*) = 1 from pg_constraint
                    where conrelid = 'public.kakak_requests'::regclass and conname = 'kakak_requests_tools_check'
                      and pg_get_constraintdef(oid) like '%cardinality(tools) <= 20%'
                      and pg_get_constraintdef(oid) like '%set_staff_areas%'
                      and pg_get_constraintdef(oid) like '%put_away_ingredient%'),
  'one tools check, still at most 20 names');

-- ---- Settings and grants ---------------------------------------------------------------------
select pg_temp.ok((select prosecdef and proconfig @> array['search_path=public, pg_temp']
                     from pg_proc where oid = 'public.kakak_record(uuid, text, text, text[], int, int, int, int, bigint, int)'::regprocedure),
  'kakak_record: still security definer, search_path public, pg_temp');
select pg_temp.ok((select count(*) = 1 from pg_proc where proname = 'kakak_record' and pronamespace = 'public'::regnamespace),
  '... one definition (no overload left behind)');
select pg_temp.ok(not has_function_privilege('anon', 'public.kakak_record(uuid, text, text, text[], int, int, int, int, bigint, int)', 'execute')
                  and has_function_privilege('authenticated', 'public.kakak_record(uuid, text, text, text[], int, int, int, int, bigint, int)', 'execute')
                  and not exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                                   where p.oid = 'public.kakak_record(uuid, text, text, text[], int, int, int, int, bigint, int)'::regprocedure
                                     and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'kakak_record: not callable by anon or PUBLIC; authenticated may call it');
select pg_temp.ok(not has_table_privilege('anon', 'public.kakak_requests', 'select')
                  and not has_table_privilege('authenticated', 'public.kakak_requests', 'update')
                  and not has_table_privilege('authenticated', 'public.kakak_requests', 'insert'),
  'kakak_requests: grants as 126 left them (admins read through RLS, nobody writes directly)');

rollback;
