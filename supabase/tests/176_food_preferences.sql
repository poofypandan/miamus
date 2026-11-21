-- Migration 176 checks: the household's food preferences, and Kakak's two
-- new tool names (PR C2).
-- set_food_preferences: an admin sets them (once each, in the app's order,
-- with who and when), gets back what they were, and Undo puts "not asked
-- yet" back; a staff phone of the same household, another household's
-- admin and anon are refused; a value outside the four is refused, and the
-- column's check refuses one written directly. kakak_record and the tools
-- column accept save_recipe_idea and ask_food_preferences next to every
-- name 181 accepted. The export carries the preference. SECURITY DEFINER,
-- search_path and grants (no anon, no public).
-- LOCAL DATABASE ONLY. One transaction, rolled back. Run after 176 is
-- applied, or with it in the same transaction:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/176_food_preferences.sql
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
  ('00000000-0000-0000-0000-0000000176a1', 'one176@test.local', false),
  ('00000000-0000-0000-0000-0000000176a9', 'nine176@test.local', false),
  ('00000000-0000-0000-0000-0000000176b1', null, true)
) as u(id, email, anon);
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000176f1', 'Rumah Melati', '00000000-0000-0000-0000-0000000176a1'),
  ('00000000-0000-0000-0000-0000000176f2', 'Rumah Kenanga', '00000000-0000-0000-0000-0000000176a9');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000176f1', '00000000-0000-0000-0000-0000000176a1', 'owner'),
  ('00000000-0000-0000-0000-0000000176f2', '00000000-0000-0000-0000-0000000176a9', 'owner');
insert into public.device_sessions (user_id, household_id) values
  ('00000000-0000-0000-0000-0000000176b1', '00000000-0000-0000-0000-0000000176f1');
-- Pending requests, as kakak_begin leaves them.
insert into public.kakak_requests (id, household_id, user_id) values
  ('00000000-0000-0000-0000-0000000176d1', '00000000-0000-0000-0000-0000000176f1', '00000000-0000-0000-0000-0000000176a1'),
  ('00000000-0000-0000-0000-0000000176d2', '00000000-0000-0000-0000-0000000176f1', '00000000-0000-0000-0000-0000000176a1'),
  ('00000000-0000-0000-0000-0000000176d3', '00000000-0000-0000-0000-0000000176f1', '00000000-0000-0000-0000-0000000176a1'),
  ('00000000-0000-0000-0000-0000000176d4', '00000000-0000-0000-0000-0000000176f1', '00000000-0000-0000-0000-0000000176a1');

\set a1 '''00000000-0000-0000-0000-0000000176a1'''
\set a9 '''00000000-0000-0000-0000-0000000176a9'''
\set p1 '''00000000-0000-0000-0000-0000000176b1'''
\set f1 '''00000000-0000-0000-0000-0000000176f1'''
\set r1 '''00000000-0000-0000-0000-0000000176d1'''
\set r2 '''00000000-0000-0000-0000-0000000176d2'''
\set r3 '''00000000-0000-0000-0000-0000000176d3'''
\set r4 '''00000000-0000-0000-0000-0000000176d4'''

-- ---- set_food_preferences ----------------------------------------------------------------
create function pg_temp.set_stmt(hh uuid, rules text) returns text language sql as $$
  select format('select public.set_food_preferences(%L, %s)', hh, rules)
$$;
-- What a session gets back from it (the call as the admin, its jsonb as text).
create function pg_temp.set_as(uid uuid, hh uuid, rules text[]) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.set_food_preferences(hh, rules) into v;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;

select pg_temp.ok((select food_preferences is null and food_preferences_set_at is null and food_preferences_set_by is null
                     from public.households where id = :f1),
  'a household starts with "not asked yet" (null)');
select pg_temp.ok(pg_temp.set_as(:a1, :f1, array['no_alcohol', 'halal', 'halal'])
                    = '{"after": ["halal", "no_alcohol"], "before": null}'::jsonb,
  'an admin sets them: each once, in the app''s order, and gets back "not asked yet"');
select pg_temp.ok((select food_preferences = array['halal', 'no_alcohol']
                          and food_preferences_set_by = :a1::uuid and food_preferences_set_at is not null
                     from public.households where id = :f1),
  '... stored with who and when');
select pg_temp.ok(pg_temp.set_as(:a1, :f1, array[]::text[]) = '{"after": [], "before": ["halal", "no_alcohol"]}'::jsonb,
  '"no rules" is an answer too, and returns what was there');
select pg_temp.ok((select food_preferences = '{}'::text[] from public.households where id = :f1),
  '... stored as an empty list, not null');
select pg_temp.ok(pg_temp.set_as(:a1, :f1, null) = '{"after": null, "before": []}'::jsonb,
  'Undo of a first answer puts "not asked yet" back');
select pg_temp.ok((select food_preferences is null and food_preferences_set_at is null and food_preferences_set_by is null
                     from public.households where id = :f1),
  '... with no who or when');
select pg_temp.ok(pg_temp.err_as(:a1, pg_temp.set_stmt(:f1, 'array[''halal'', ''kosher'']')) like '%bad_value%',
  'a value outside the four is refused');
select pg_temp.ok(pg_temp.err_as(:a1, pg_temp.set_stmt(:f1, 'array[''halal'', null]')) like '%bad_value%',
  '... as is a null value');
select pg_temp.ok(pg_temp.err_as(:p1, pg_temp.set_stmt(:f1, 'array[''halal'']')) like '%admins_only%',
  'a staff phone of the same household is refused');
select pg_temp.ok(pg_temp.err_as(:a9, pg_temp.set_stmt(:f1, 'array[''halal'']')) like '%admins_only%',
  'another household''s admin is refused');
select pg_temp.ok(pg_temp.err_as(null, pg_temp.set_stmt(:f1, 'array[''halal'']')) like '%permission denied%',
  'anon can''t call it');
select pg_temp.ok((select food_preferences is null from public.households where id = :f1),
  '... and nothing changed');
do $$
begin
  begin
    update public.households set food_preferences = array['halal', 'pescatarian'] where id = '00000000-0000-0000-0000-0000000176f1';
    raise exception 'FAIL: the check let an unknown value in';
  exception when check_violation then null;
  end;
end $$;
select pg_temp.ok(true, 'the column''s check refuses an unknown value, even for a direct write');
select pg_temp.ok(pg_temp.err_as(:a1, format('update public.households set food_preferences = array[''halal''] where id = %L', :f1)) like '%permission denied%'
                  or (select food_preferences is null from public.households where id = :f1),
  'an admin can''t write the column directly: only through set_food_preferences');

-- ---- What staff phones read -----------------------------------------------------------------
select pg_temp.set_as(:a1, :f1, array['halal']) is not null as set_for_staff \gset
create function pg_temp.read_as(uid uuid, hh uuid) returns text[] language plpgsql as $$
declare v text[];
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select h.food_preferences into v from public.households h where h.id = hh;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;
select pg_temp.ok(pg_temp.read_as(:p1, :f1) = array['halal'],
  'a staff phone of the household reads it (shown read-only beside Kitchen notes)');
select pg_temp.ok(pg_temp.read_as(:a9, :f1) is null,
  'another household''s admin doesn''t');

-- ---- The export ------------------------------------------------------------------------------
create function pg_temp.export_as(uid uuid) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.export_household_data() into v;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;
select pg_temp.ok((select e->'household'->'food_preferences' = '["halal"]'::jsonb
                          and e->'household'->>'food_preferences_set_by' = 'one176@test.local'
                          and e->'household' ? 'food_preferences_set_at'
                          and e->'household' ? 'kitchen_notes'
                     from (select pg_temp.export_as(:a1) as e) x),
  'the export carries the food preferences, who set them and when, beside the kitchen notes');

-- ---- kakak_record and the tools column ---------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:a1, pg_temp.record_stmt(:r1, array['save_recipe_idea', 'ask_food_preferences'])) = '',
  'an admin records a call that used save_recipe_idea and ask_food_preferences');
select pg_temp.ok((select tools = array['save_recipe_idea', 'ask_food_preferences'] and outcome = 'suggestion'
                     from public.kakak_requests where id = :r1),
  '... with its tools');
select pg_temp.ok(pg_temp.err_as(:a1, pg_temp.record_stmt(:r2,
                    array['create_chore', 'add_to_shopping_list', 'add_pet_routine', 'add_food', 'put_away_ingredient', 'set_staff_areas', 'plan_dish', 'add_staff', 'remove_staff', 'ask_question'])) = '',
  'every name 181 accepted is still accepted');
select pg_temp.ok(pg_temp.err_as(:a1, pg_temp.record_stmt(:r3, array['save_recipe_idea', 'set_food_preferences'])) like '%bad_tools%',
  'an unknown name (the dropped set_food_preferences tool) is still bad_tools');
select pg_temp.ok(pg_temp.err_as(:p1, pg_temp.record_stmt(:r4, array['save_recipe_idea'])) like '%not_admin%',
  'a staff phone can''t record a call');
select pg_temp.ok(pg_temp.err_as(null, pg_temp.record_stmt(:r4, array['save_recipe_idea'])) like '%permission denied%',
  'anon can''t call kakak_record');
do $$
begin
  begin
    update public.kakak_requests set tools = array['ask_food_preferences', 'shell'] where id = '00000000-0000-0000-0000-0000000176d2';
    raise exception 'FAIL: the check let an unknown name in';
  exception when check_violation then null;
  end;
  update public.kakak_requests set tools = array['ask_food_preferences'] where id = '00000000-0000-0000-0000-0000000176d2';
end $$;
select pg_temp.ok(true, 'the tools check refuses an unknown name and accepts the new ones, even for a direct write');

-- ---- Settings and grants ---------------------------------------------------------------------
select pg_temp.ok((select prosecdef and proconfig @> array['search_path=""']
                     from pg_proc where oid = 'public.set_food_preferences(uuid, text[])'::regprocedure),
  'set_food_preferences: security definer, empty search_path');
select pg_temp.ok(not has_function_privilege('anon', 'public.set_food_preferences(uuid, text[])', 'execute')
                  and has_function_privilege('authenticated', 'public.set_food_preferences(uuid, text[])', 'execute')
                  and not exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                                   where p.oid = 'public.set_food_preferences(uuid, text[])'::regprocedure
                                     and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'set_food_preferences: not callable by anon or PUBLIC; authenticated may call it');
select pg_temp.ok((select prosecdef and proconfig @> array['search_path=public, pg_temp']
                     from pg_proc where oid = 'public.kakak_record(uuid, text, text, text[], int, int, int, int, bigint, int)'::regprocedure),
  'kakak_record: still security definer, search_path public, pg_temp');
select pg_temp.ok((select count(*) = 1 from pg_proc where proname = 'kakak_record' and pronamespace = 'public'::regnamespace),
  '... one definition (no overload left behind)');
select pg_temp.ok(not has_function_privilege('anon', 'public.kakak_record(uuid, text, text, text[], int, int, int, int, bigint, int)', 'execute')
                  and not exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                                   where p.oid = 'public.kakak_record(uuid, text, text, text[], int, int, int, int, bigint, int)'::regprocedure
                                     and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'kakak_record: not callable by anon or PUBLIC');
select pg_temp.ok(not has_function_privilege('anon', 'public.export_household_data()', 'execute')
                  and not exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                                   where p.oid = 'public.export_household_data()'::regprocedure
                                     and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'export_household_data: not callable by anon or PUBLIC');

rollback;
