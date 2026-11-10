-- Migration 126 checks: Kakak's switch, limits and statistics. Owners turn it
-- on only once allowed; staff phones, other households' admins and
-- logged-out callers are refused everywhere; 40 a day per household, reset the
-- next Jakarta day; the global cap answers "busy" without using a household's
-- call; statistics are filled once, in time, with the cost clamped; results
-- are set once (Undo after confirming excepted); no column can hold a sentence.
-- LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/126_kakak.sql
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
-- The error message a statement raises, or 'no error'.
create function pg_temp.err(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return 'no error';
exception when others then
  return sqlerrm;
end $$;

-- Households A (admin a1, staff phone b1) and B (admin a2); platform admin p1,
-- who is not a member of either. C only adds load for the global cap.
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000126a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin126@test.local', false, now(), now()),
  ('00000000-0000-0000-0000-0000000126a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other126@test.local', false, now(), now()),
  ('00000000-0000-0000-0000-0000000126c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'platform126@test.local', false, now(), now()),
  ('00000000-0000-0000-0000-0000000126b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now(), now());
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000126f1', 'Rumah 126', '00000000-0000-0000-0000-0000000126a1'),
  ('00000000-0000-0000-0000-0000000126f2', 'Rumah lain', '00000000-0000-0000-0000-0000000126a2'),
  ('00000000-0000-0000-0000-0000000126f3', 'Rumah ramai', '00000000-0000-0000-0000-0000000126a2');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000126f1', '00000000-0000-0000-0000-0000000126a1', 'owner'),
  ('00000000-0000-0000-0000-0000000126f2', '00000000-0000-0000-0000-0000000126a2', 'owner');
insert into public.device_sessions (user_id, household_id)
values ('00000000-0000-0000-0000-0000000126b1', '00000000-0000-0000-0000-0000000126f1');
insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000126c1');

create temp table d as select (now() at time zone 'Asia/Jakarta')::date as today;
create temp table ids (name text primary key, id uuid);
grant select, insert on d, ids to authenticated;

-- --- Shape ----------------------------------------------------------------------------
select pg_temp.ok((select count(*) = 4 from pg_class
                    where relnamespace = 'public'::regnamespace and relrowsecurity
                      and relname in ('kakak_settings', 'kakak_usage', 'kakak_requests', 'kakak_config')),
  'row level security is on for all four tables');
select pg_temp.ok((select array_agg(table_name || '.' || column_name order by table_name, column_name)
                     from information_schema.columns
                    where table_schema = 'public' and table_name like 'kakak\_%'
                      and data_type in ('text', 'character varying', 'character', 'ARRAY', 'json', 'jsonb', 'bytea', 'USER-DEFINED'))
                  -- job: 'quick' or 'setup', a checked value (migrations/142).
                  = array['kakak_requests.job', 'kakak_requests.model', 'kakak_requests.outcome', 'kakak_requests.result', 'kakak_requests.tools'],
  'the only text columns are job, model, outcome, result and tools');
select pg_temp.ok((select bool_and(exists (
                     select 1 from pg_constraint c
                      where c.conrelid = 'public.kakak_requests'::regclass and c.contype = 'c'
                        and a.attnum = any (c.conkey)))
                     from pg_attribute a
                    where a.attrelid = 'public.kakak_requests'::regclass
                      and a.attname in ('job', 'model', 'outcome', 'result', 'tools')),
  'and each of them is held by a CHECK');
select pg_temp.ok(pg_temp.err($$insert into public.kakak_requests (household_id, model)
                                values ('00000000-0000-0000-0000-0000000126f1', 'tolong beli beras dua kilo')$$) like '%check%',
  'a sentence does not fit in the model column');
select pg_temp.ok((select daily_call_cap = 400 and max_call_cost_micro_usd = 150000 from public.kakak_config),
  'one config row: 400 calls a day, 150,000 micro-USD a call');

-- --- Grants ---------------------------------------------------------------------------
create temp table fns as select unnest(array[
  'public.kakak_status(uuid)', 'public.set_kakak_enabled(uuid, boolean)',
  'public.platform_set_kakak_allowed(uuid, boolean)', 'public.kakak_begin(uuid)',
  'public.kakak_record(uuid, text, text, text[], int, int, int, int, bigint, int)',
  'public.kakak_set_result(uuid, text)'])::regprocedure as f;
select pg_temp.ok((select bool_and(not has_function_privilege('anon', f, 'execute')
                                   and has_function_privilege('authenticated', f, 'execute')) from fns),
  'every Kakak function: anon cannot call it, authenticated can');
select pg_temp.ok((select bool_and(not exists (select 1 from aclexplode(p.proacl) x where x.grantee = 0))
                     from fns join pg_proc p on p.oid = fns.f),
  'no Kakak function is granted to PUBLIC');
select pg_temp.ok((select bool_and(p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])
                     from fns join pg_proc p on p.oid = fns.f),
  'every Kakak function is SECURITY DEFINER with search_path public, pg_temp');
select pg_temp.ok(not has_function_privilege(r, 'public.prune_finished_food()', 'execute'), r || ' cannot call the nightly clean-up')
from unnest(array['anon', 'authenticated']) r;
select pg_temp.ok(has_function_privilege('service_role', 'public.prune_finished_food()', 'execute'),
  'the service role can call the nightly clean-up');
select pg_temp.ok(not has_table_privilege('authenticated', t, 'insert') and not has_table_privilege('authenticated', t, 'update')
                  and not has_table_privilege('authenticated', t, 'delete'), 'clients cannot write ' || t)
from unnest(array['public.kakak_settings', 'public.kakak_usage', 'public.kakak_requests', 'public.kakak_config']) t;
select pg_temp.ok(not has_table_privilege('authenticated', t, 'select'), 'clients cannot read ' || t)
from unnest(array['public.kakak_usage', 'public.kakak_config']) t;

-- --- Logged out -----------------------------------------------------------------------
set local role anon;
select pg_temp.ok(pg_temp.err(s) like 'permission denied%', 'anon refused: ' || left(s, 60))
from unnest(array[
  $$select public.kakak_status('00000000-0000-0000-0000-0000000126f1')$$,
  $$select public.set_kakak_enabled('00000000-0000-0000-0000-0000000126f1', true)$$,
  $$select public.platform_set_kakak_allowed('00000000-0000-0000-0000-0000000126f1', true)$$,
  $$select public.kakak_begin('00000000-0000-0000-0000-0000000126f1')$$,
  $$select public.kakak_record(gen_random_uuid(), 'm', 'message', '{}', 1, 0, 0, 1, 1, 1)$$,
  $$select public.kakak_set_result(gen_random_uuid(), 'confirmed')$$,
  $$select * from public.kakak_settings$$,
  $$select * from public.kakak_requests$$,
  $$select * from public.kakak_usage$$,
  $$select * from public.kakak_config$$]) s;
reset role;

-- --- Allowed, then on -----------------------------------------------------------------
set local role authenticated;
select pg_temp.act('00000000-0000-0000-0000-0000000126a1');
select pg_temp.ok((select allowed = false and enabled = false and enabled_by is null and daily_limit = 40 and calls_left = 0
                     from public.kakak_status('00000000-0000-0000-0000-0000000126f1'))
                  and (select count(*) = 1 from public.kakak_status('00000000-0000-0000-0000-0000000126f1')),
  'with no settings row, the owner sees one row: not allowed, off, 0 calls left');
select pg_temp.ok(pg_temp.err($$select public.set_kakak_enabled('00000000-0000-0000-0000-0000000126f1', true)$$) = 'not_allowed',
  'the owner cannot turn it on before it is allowed');
select pg_temp.ok(public.kakak_begin('00000000-0000-0000-0000-0000000126f1') = '{"ok": false, "reason": "not_allowed"}',
  'kakak_begin: not_allowed');
select pg_temp.ok(pg_temp.err($$select public.platform_set_kakak_allowed('00000000-0000-0000-0000-0000000126f1', true)$$) = 'not_platform_admin',
  'an owner cannot allow it themselves');

select pg_temp.act('00000000-0000-0000-0000-0000000126c1');
select public.platform_set_kakak_allowed('00000000-0000-0000-0000-0000000126f1', true);
select pg_temp.ok(pg_temp.err($$select * from public.kakak_status('00000000-0000-0000-0000-0000000126f1')$$) = 'not_admin',
  'the platform admin is not an admin of the household');

select pg_temp.act('00000000-0000-0000-0000-0000000126a1');
select pg_temp.ok(public.kakak_begin('00000000-0000-0000-0000-0000000126f1') = '{"ok": false, "reason": "off"}',
  'allowed but not turned on: off');
select public.set_kakak_enabled('00000000-0000-0000-0000-0000000126f1', true);
select pg_temp.ok((select allowed and enabled and enabled_by = '00000000-0000-0000-0000-0000000126a1'
                          and enabled_at is not null and calls_left = 40
                     from public.kakak_status('00000000-0000-0000-0000-0000000126f1')),
  'once allowed, the owner turns it on; who and when are stamped; 40 calls left');
select pg_temp.ok((select count(*) = 1 from public.kakak_settings), 'the owner reads their own settings row');

-- --- Staff phone ----------------------------------------------------------------------
select pg_temp.act('00000000-0000-0000-0000-0000000126b1');
select pg_temp.ok(public.kakak_begin('00000000-0000-0000-0000-0000000126f1') = '{"ok": false, "reason": "not_admin"}',
  'staff phone: kakak_begin says not_admin');
select pg_temp.ok(pg_temp.err(s) in ('not_admin', 'not_platform_admin'), 'staff phone refused: ' || left(s, 60))
from unnest(array[
  $$select * from public.kakak_status('00000000-0000-0000-0000-0000000126f1')$$,
  $$select public.set_kakak_enabled('00000000-0000-0000-0000-0000000126f1', false)$$,
  $$select public.platform_set_kakak_allowed('00000000-0000-0000-0000-0000000126f1', false)$$]) s;
select pg_temp.ok((select count(*) = 0 from public.kakak_settings) and (select count(*) = 0 from public.kakak_requests),
  'a staff phone reads no Kakak rows');

-- --- Another household's admin --------------------------------------------------------
select pg_temp.act('00000000-0000-0000-0000-0000000126a2');
select pg_temp.ok(public.kakak_begin('00000000-0000-0000-0000-0000000126f1') = '{"ok": false, "reason": "not_admin"}',
  'admin of another household: kakak_begin says not_admin');
select pg_temp.ok(pg_temp.err(s) = 'not_admin', 'admin of another household refused: ' || left(s, 60))
from unnest(array[
  $$select * from public.kakak_status('00000000-0000-0000-0000-0000000126f1')$$,
  $$select public.set_kakak_enabled('00000000-0000-0000-0000-0000000126f1', false)$$]) s;
select pg_temp.ok((select count(*) = 0 from public.kakak_settings), 'and reads none of its rows');

-- --- 40 a day, reset the next Jakarta day ---------------------------------------------
select pg_temp.act('00000000-0000-0000-0000-0000000126a1');
create temp table begins (n int, r jsonb);
grant insert, select on begins to authenticated;
insert into begins select n, public.kakak_begin('00000000-0000-0000-0000-0000000126f1') from generate_series(1, 41) n;
select pg_temp.ok((select count(*) = 40 and bool_and((r->>'ok')::boolean) from begins where n <= 40)
                  and (select (r->>'calls_left')::int = 39 from begins where n = 1)
                  and (select (r->>'calls_left')::int = 0 from begins where n = 40),
  '40 calls go through, counting down from 39 to 0');
select pg_temp.ok((select r = '{"ok": false, "reason": "limit"}' from begins where n = 41), 'the 41st says limit');
select pg_temp.ok((select calls_left = 0 from public.kakak_status('00000000-0000-0000-0000-0000000126f1')), 'status shows 0 left');
select pg_temp.ok((select count(*) = 40 and bool_and(outcome = 'pending' and user_id = '00000000-0000-0000-0000-0000000126a1')
                     from public.kakak_requests),
  'each call opened one pending request row for the owner');
reset role;
select pg_temp.ok((select calls = 40 from public.kakak_usage where household_id = '00000000-0000-0000-0000-0000000126f1'
                     and day = (select today from d)),
  'today''s count stopped at 40');
update public.kakak_usage set day = day - 1 where household_id = '00000000-0000-0000-0000-0000000126f1';
set local role authenticated;
select pg_temp.act('00000000-0000-0000-0000-0000000126a1');
select pg_temp.ok((public.kakak_begin('00000000-0000-0000-0000-0000000126f1')->>'calls_left')::int = 39,
  'the next Jakarta day starts again at 40');
reset role;

-- --- Global cap -----------------------------------------------------------------------
-- Today's total is 1 (A); C adds 9; the cap is set to 10.
insert into public.kakak_usage (household_id, day, calls)
values ('00000000-0000-0000-0000-0000000126f3', (select today from d), 9);
update public.kakak_config set daily_call_cap = 10;
set local role authenticated;
select pg_temp.act('00000000-0000-0000-0000-0000000126a1');
select pg_temp.ok(public.kakak_begin('00000000-0000-0000-0000-0000000126f1') = '{"ok": false, "reason": "busy"}',
  'the day''s total across households at the cap: busy');
reset role;
select pg_temp.ok((select calls = 1 from public.kakak_usage where household_id = '00000000-0000-0000-0000-0000000126f1'
                     and day = (select today from d))
                  and (select count(*) = 41 from public.kakak_requests),
  'busy does not use the household''s call or open a request row');
update public.kakak_config set daily_call_cap = 400;

-- --- kakak_record ---------------------------------------------------------------------
delete from public.kakak_requests;
set local role authenticated;
select pg_temp.act('00000000-0000-0000-0000-0000000126a1');
insert into ids select 'r1', (public.kakak_begin('00000000-0000-0000-0000-0000000126f1')->>'request_id')::uuid;
insert into ids select 'r2', (public.kakak_begin('00000000-0000-0000-0000-0000000126f1')->>'request_id')::uuid;
insert into ids select 'r3', (public.kakak_begin('00000000-0000-0000-0000-0000000126f1')->>'request_id')::uuid;

select pg_temp.ok(pg_temp.err(format($$select public.kakak_record(%L, 'claude-opus-5-5', 'pending', '{create_chore}', 1, 0, 0, 1, 1, 1)$$,
                                     (select id from ids where name = 'r1'))) = 'bad_outcome', 'outcome must be one of the four');
select pg_temp.ok(pg_temp.err(format($$select public.kakak_record(%L, 'claude-opus-5-5', 'suggestion', '{send_email}', 1, 0, 0, 1, 1, 1)$$,
                                     (select id from ids where name = 'r1'))) = 'bad_tools', 'only the five tool names');
select pg_temp.ok(pg_temp.err(format($$select public.kakak_record(%L, 'claude-opus-5-5', 'suggestion', '{create_chore}', -1, 0, 0, 1, 1, 1)$$,
                                     (select id from ids where name = 'r1'))) = 'negative_value', 'negative numbers refused');
select pg_temp.ok(pg_temp.err(format($$select public.kakak_record(%L, 'beli beras dua kilo', 'suggestion', '{create_chore}', 1, 0, 0, 1, 1, 1)$$,
                                     (select id from ids where name = 'r1'))) = 'bad_model', 'a sentence is not a model name');

select public.kakak_record((select id from ids where name = 'r1'), 'claude-opus-5-5', 'suggestion',
                           '{create_chore,add_food}', 3000, 2500, 0, 400, 999999999, 2100);
select pg_temp.ok((select outcome = 'suggestion' and model = 'claude-opus-5-5' and tools = '{create_chore,add_food}'
                          and input_tokens = 3000 and output_tokens = 400 and latency_ms = 2100 and cost_micro_usd = 150000
                     from public.kakak_requests where id = (select id from ids where name = 'r1')),
  'the owner fills in the statistics; the cost is clamped to 150,000');
select pg_temp.ok(pg_temp.err(format($$select public.kakak_record(%L, 'claude-opus-5-5', 'message', '{}', 1, 0, 0, 1, 1, 1)$$,
                                     (select id from ids where name = 'r1'))) = 'already_recorded', 'a second fill is refused');

select pg_temp.act('00000000-0000-0000-0000-0000000126a2');
select pg_temp.ok(pg_temp.err(format($$select public.kakak_record(%L, 'claude-opus-5-5', 'message', '{}', 1, 0, 0, 1, 1, 1)$$,
                                     (select id from ids where name = 'r2'))) = 'not_admin', 'another household''s admin cannot fill it');
select pg_temp.act('00000000-0000-0000-0000-0000000126b1');
select pg_temp.ok(pg_temp.err(format($$select public.kakak_record(%L, 'claude-opus-5-5', 'message', '{}', 1, 0, 0, 1, 1, 1)$$,
                                     (select id from ids where name = 'r2'))) = 'not_admin', 'a staff phone cannot fill it');
reset role;
update public.kakak_requests set created_at = now() - interval '6 minutes' where id = (select id from ids where name = 'r2');
set local role authenticated;
select pg_temp.act('00000000-0000-0000-0000-0000000126a1');
select pg_temp.ok(pg_temp.err(format($$select public.kakak_record(%L, 'claude-opus-5-5', 'message', '{}', 1, 0, 0, 1, 1, 1)$$,
                                     (select id from ids where name = 'r2'))) = 'too_late', 'a row older than 5 minutes is refused');
select pg_temp.ok(pg_temp.err($$select public.kakak_record(gen_random_uuid(), 'm', 'message', '{}', 1, 0, 0, 1, 1, 1)$$) = 'not_found',
  'an unknown request is refused');

-- --- kakak_set_result -----------------------------------------------------------------
select pg_temp.ok(pg_temp.err(format($$select public.kakak_set_result(%L, 'maybe')$$, (select id from ids where name = 'r1'))) = 'bad_result',
  'result must be one of the four');
select public.kakak_set_result((select id from ids where name = 'r1'), 'confirmed');
select public.kakak_set_result((select id from ids where name = 'r1'), 'undone');
select pg_temp.ok((select result = 'undone' from public.kakak_requests where id = (select id from ids where name = 'r1')),
  'confirmed, then undone');
select pg_temp.ok(pg_temp.err(format($$select public.kakak_set_result(%L, 'confirmed')$$, (select id from ids where name = 'r1'))) = 'already_set',
  'nothing after undone');
select public.kakak_set_result((select id from ids where name = 'r3'), 'cancelled');
select pg_temp.ok(pg_temp.err(format($$select public.kakak_set_result(%L, 'undone')$$, (select id from ids where name = 'r3'))) = 'already_set',
  'cancelled cannot become undone');
select pg_temp.ok(pg_temp.err(format($$select public.kakak_set_result(%L, 'changed')$$, (select id from ids where name = 'r3'))) = 'already_set',
  'a result is set once');
select pg_temp.act('00000000-0000-0000-0000-0000000126a2');
select pg_temp.ok(pg_temp.err(format($$select public.kakak_set_result(%L, 'confirmed')$$, (select id from ids where name = 'r2'))) = 'not_admin',
  'another household''s admin cannot set it');
select pg_temp.act('00000000-0000-0000-0000-0000000126b1');
select pg_temp.ok(pg_temp.err(format($$select public.kakak_set_result(%L, 'confirmed')$$, (select id from ids where name = 'r2'))) = 'not_admin',
  'a staff phone cannot set it');

-- --- Off, and permission taken away ---------------------------------------------------
select pg_temp.act('00000000-0000-0000-0000-0000000126a1');
select public.set_kakak_enabled('00000000-0000-0000-0000-0000000126f1', false);
select pg_temp.ok(public.kakak_begin('00000000-0000-0000-0000-0000000126f1') = '{"ok": false, "reason": "off"}',
  'turned off: off');
select public.set_kakak_enabled('00000000-0000-0000-0000-0000000126f1', true);
select pg_temp.act('00000000-0000-0000-0000-0000000126c1');
select public.platform_set_kakak_allowed('00000000-0000-0000-0000-0000000126f1', false);
select public.platform_set_kakak_allowed('00000000-0000-0000-0000-0000000126f1', true);
select pg_temp.act('00000000-0000-0000-0000-0000000126a1');
select pg_temp.ok((select allowed and not enabled from public.kakak_status('00000000-0000-0000-0000-0000000126f1')),
  'taking permission away turns it off; allowing it again does not turn it back on');
reset role;

-- --- Nightly clean-up -----------------------------------------------------------------
insert into public.kakak_usage (household_id, day, calls) values
  ('00000000-0000-0000-0000-0000000126f2', (select today from d) - 36, 5),
  ('00000000-0000-0000-0000-0000000126f2', (select today from d) - 35, 5);
insert into public.kakak_requests (id, household_id, created_at) values
  ('00000000-0000-0000-0000-0000000126e1', '00000000-0000-0000-0000-0000000126f2', now() - interval '13 months 1 day'),
  ('00000000-0000-0000-0000-0000000126e2', '00000000-0000-0000-0000-0000000126f2', now() - interval '12 months');
select public.prune_finished_food();
select pg_temp.ok((select array_agg((select today from d) - day order by day) from public.kakak_usage
                    where household_id = '00000000-0000-0000-0000-0000000126f2') = array[35],
  'usage over 35 days is deleted nightly');
select pg_temp.ok((select array_agg(id) from public.kakak_requests where household_id = '00000000-0000-0000-0000-0000000126f2')
                  = array['00000000-0000-0000-0000-0000000126e2'::uuid],
  'request rows over 13 months are deleted nightly');

rollback;
