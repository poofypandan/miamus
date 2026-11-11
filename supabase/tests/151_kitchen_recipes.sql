-- Migration 151 checks: kitchen recipes (Phase 170 PR B).
-- Owners write recipes and their lines (save_recipe or direct); staff
-- phones read but never write; another household's owner sees and changes
-- nothing; a line can't point at another household's item; deleting an
-- item leaves the line's name; sdm and sdt are allowed on lines (never on
-- stock); the Indonesian version is kept; the export includes recipes;
-- grants.
-- LOCAL DATABASE ONLY. One transaction, rolled back. Run after 151 is
-- applied, or with it in the same transaction:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/151_kitchen_recipes.sql
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
-- Rows a statement touched (or a select returned) as a session; an
-- RLS-hidden row is 0, not an error.
create function pg_temp.rows_as(uid uuid, stmt text) returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute stmt;
  get diagnostics n = row_count;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return n;
end $$;
-- The export, as an owner.
create function pg_temp.export_as(uid uuid) returns jsonb language plpgsql as $$
declare j jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.export_household_data();
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return j;
end $$;

-- ---- Households ----------------------------------------------------------------------
-- f1: owner a1, staff phone p1. f2: owner a9.
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, anon, now(), now()
from (values
  ('00000000-0000-0000-0000-0000000151a1', 'one151@test.local', false),
  ('00000000-0000-0000-0000-0000000151a9', 'nine151@test.local', false),
  ('00000000-0000-0000-0000-0000000151b1', null, true)
) as u(id, email, anon);
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000151f1', 'Rumah Melati', '00000000-0000-0000-0000-0000000151a1'),
  ('00000000-0000-0000-0000-0000000151f2', 'Rumah Kenanga', '00000000-0000-0000-0000-0000000151a9');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000151f1', '00000000-0000-0000-0000-0000000151a1', 'owner'),
  ('00000000-0000-0000-0000-0000000151f2', '00000000-0000-0000-0000-0000000151a9', 'owner');
insert into public.device_sessions (user_id, household_id) values
  ('00000000-0000-0000-0000-0000000151b1', '00000000-0000-0000-0000-0000000151f1');
insert into public.inventory_items (id, household_id, scope, name, category, quantity, unit, min_threshold) values
  ('00000000-0000-0000-0000-0000000151e1', '00000000-0000-0000-0000-0000000151f1', 'home', 'Ayam', 'fresh_food', 0, 'kg', 0),
  ('00000000-0000-0000-0000-0000000151e2', '00000000-0000-0000-0000-0000000151f1', 'home', 'Kecap manis', 'pantry', 0, 'bottle', 0),
  ('00000000-0000-0000-0000-0000000151e9', '00000000-0000-0000-0000-0000000151f2', 'home', 'Telur', 'fresh_food', 0, 'butir', 0);

\set a1 '''00000000-0000-0000-0000-0000000151a1'''
\set a9 '''00000000-0000-0000-0000-0000000151a9'''
\set p1 '''00000000-0000-0000-0000-0000000151b1'''
\set f1 '''00000000-0000-0000-0000-0000000151f1'''
\set f2 '''00000000-0000-0000-0000-0000000151f2'''
\set chicken '''00000000-0000-0000-0000-0000000151e1'''
\set kecap '''00000000-0000-0000-0000-0000000151e2'''
\set eggs '''00000000-0000-0000-0000-0000000151e9'''
\set soto '''00000000-0000-0000-0000-000000151d01'''
\set other '''00000000-0000-0000-0000-000000151d09'''

-- ---- An owner saves a recipe with its lines --------------------------------------------
select pg_temp.ok(pg_temp.err_as(:a1, format($q$
  select public.save_recipe(
    jsonb_build_object('id', %L, 'household_id', %L, 'name', '  Chicken soto ', 'servings', 4,
                       'steps', 'Boil the chicken.' || chr(10) || 'Add the spices.', 'written_in', 'en'),
    jsonb_build_array(
      jsonb_build_object('item_id', %L, 'name', 'Chicken', 'amount', 1, 'unit', 'kg'),
      jsonb_build_object('item_id', %L, 'name', 'Sweet soy sauce', 'amount', 2, 'unit', 'sdm'),
      jsonb_build_object('name', 'Lime leaves', 'amount', 3, 'unit', 'lembar'),
      jsonb_build_object('name', 'Salt')
    ))
$q$, :soto, :f1, :chicken, :kecap)) = '', 'an owner saves a recipe with four lines (runs)');
select pg_temp.ok((select name = 'Chicken soto' and servings = 4 and written_in = 'en' and created_by = :a1::uuid
                     and name_id is null and steps like 'Boil%'
                     from public.recipes where id = :soto::uuid),
  '... trimmed, written in English, created by the owner');
select pg_temp.ok((select count(*) = 4 from public.recipe_ingredients where recipe_id = :soto::uuid),
  '... with its four lines');
select pg_temp.ok((select string_agg(name, ',' order by position) = 'Chicken,Sweet soy sauce,Lime leaves,Salt'
                     from public.recipe_ingredients where recipe_id = :soto::uuid),
  '... in order');
select pg_temp.ok((select unit = 'sdm' and amount = 2 from public.recipe_ingredients where recipe_id = :soto::uuid and position = 1),
  'sdm is allowed on a recipe line (refused on stock by 148)');
select pg_temp.ok((select amount is null and unit is null and item_id is null
                     from public.recipe_ingredients where recipe_id = :soto::uuid and position = 3),
  'to taste: a free name with no amount and no unit');

-- ---- The Indonesian version for staff ----------------------------------------------
select pg_temp.ok(pg_temp.err_as(:a1, format($q$
  select public.save_recipe(
    jsonb_build_object('id', %L, 'household_id', %L, 'name', 'Chicken soto', 'servings', 6,
                       'steps', 'Boil the chicken.', 'written_in', 'en',
                       'name_id', 'Soto ayam', 'steps_id', 'Rebus ayamnya.'),
    jsonb_build_array(
      jsonb_build_object('item_id', %L, 'name', 'Chicken', 'amount', 1.5, 'unit', 'kg'),
      jsonb_build_object('name', 'Lime leaves', 'name_id', 'Daun jeruk', 'amount', 3, 'unit', 'lembar'),
      jsonb_build_object('name', 'Salt', 'name_id', ' ')
    ))
$q$, :soto, :f1, :chicken)) = '', 'the owner adds the Indonesian version and changes the lines (runs)');
select pg_temp.ok((select name_id = 'Soto ayam' and steps_id = 'Rebus ayamnya.' and servings = 6 and created_by = :a1::uuid
                     from public.recipes where id = :soto::uuid),
  '... the Indonesian name and steps are kept, the author stays');
select pg_temp.ok((select count(*) = 3 from public.recipe_ingredients where recipe_id = :soto::uuid),
  '... the lines are replaced, not added to');
select pg_temp.ok((select name_id = 'Daun jeruk' from public.recipe_ingredients where recipe_id = :soto::uuid and position = 1)
                  and (select name_id is null from public.recipe_ingredients where recipe_id = :soto::uuid and position = 2),
  '... each line''s Indonesian name, a blank one stored as none');

-- ---- Staff phones read, never write ---------------------------------------------------
select pg_temp.ok(pg_temp.rows_as(:p1, format($q$ select * from public.recipes where id = %L $q$, :soto)) = 1
                  and pg_temp.rows_as(:p1, format($q$ select * from public.recipe_ingredients where recipe_id = %L $q$, :soto)) = 3,
  'a staff phone reads the recipe and its lines');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.save_recipe(jsonb_build_object('id', %L, 'household_id', %L, 'name', 'Soto'), '[]') $q$, :soto, :f1)) like '%recipes_owner_only%',
  'a staff phone can''t save a recipe through save_recipe');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.save_recipe(jsonb_build_object('household_id', %L, 'name', 'Nasi goreng'), '[]') $q$, :f1)) like '%recipes_owner_only%',
  '... nor add a new one');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ insert into public.recipes (household_id, name) values (%L, 'Nasi goreng') $q$, :f1)) like '%row-level security%',
  '... nor insert one directly');
select pg_temp.ok(pg_temp.rows_as(:p1, format($q$ update public.recipes set name = 'Soto' where id = %L $q$, :soto)) = 0,
  '... nor update one (no rows)');
select pg_temp.ok(pg_temp.rows_as(:p1, format($q$ delete from public.recipes where id = %L $q$, :soto)) = 0,
  '... nor delete one (no rows)');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ insert into public.recipe_ingredients (household_id, recipe_id, name) values (%L, %L, 'Garam') $q$, :f1, :soto)) like '%row-level security%',
  '... nor add a line');
select pg_temp.ok(pg_temp.rows_as(:p1, format($q$ update public.recipe_ingredients set amount = 9 where recipe_id = %L $q$, :soto)) = 0
                  and pg_temp.rows_as(:p1, format($q$ delete from public.recipe_ingredients where recipe_id = %L $q$, :soto)) = 0,
  '... nor change or delete a line (no rows)');
select pg_temp.ok((select name = 'Chicken soto' from public.recipes where id = :soto::uuid)
                  and (select count(*) = 3 from public.recipe_ingredients where recipe_id = :soto::uuid),
  'none of the staff phone''s tries changed anything');

-- ---- Another household ---------------------------------------------------------------
select pg_temp.ok(pg_temp.rows_as(:a9, format($q$ select * from public.recipes where id = %L $q$, :soto)) = 0
                  and pg_temp.rows_as(:a9, format($q$ select * from public.recipe_ingredients where recipe_id = %L $q$, :soto)) = 0,
  'another household''s owner can''t see the recipe');
select pg_temp.ok(pg_temp.err_as(:a9, format($q$ select public.save_recipe(jsonb_build_object('id', %L, 'household_id', %L, 'name', 'Soto'), '[]') $q$, :soto, :f1)) like '%recipes_owner_only%',
  '... nor save over it as the first household');
select pg_temp.ok(pg_temp.err_as(:a9, format($q$ select public.save_recipe(jsonb_build_object('id', %L, 'household_id', %L, 'name', 'Soto'), '[]') $q$, :soto, :f2)) <> '',
  '... nor move it to their own household by its id');
select pg_temp.ok(pg_temp.rows_as(:a9, format($q$ delete from public.recipes where id = %L $q$, :soto)) = 0,
  '... nor delete it (no rows)');
select pg_temp.ok((select household_id = :f1::uuid and name = 'Chicken soto' from public.recipes where id = :soto::uuid),
  '... so it is untouched');
select pg_temp.ok(pg_temp.err_as(null, $q$ select count(*) from public.recipes $q$) like '%permission denied%'
                  and pg_temp.err_as(null, $q$ select count(*) from public.recipe_ingredients $q$) like '%permission denied%',
  'a logged-out caller can''t read recipes or lines');
select pg_temp.ok(pg_temp.err_as(null, format($q$ select public.save_recipe(jsonb_build_object('household_id', %L, 'name', 'X'), '[]') $q$, :f1)) like '%permission denied%',
  '... nor call save_recipe');

-- ---- Lines and items -----------------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:a1, format($q$
  select public.save_recipe(jsonb_build_object('id', %L, 'household_id', %L, 'name', 'Telur dadar'),
                            jsonb_build_array(jsonb_build_object('item_id', %L, 'name', 'Telur', 'amount', 2, 'unit', 'butir')))
$q$, :other, :f1, :eggs)) like '%recipe_ingredients_item_fkey%',
  'a line can''t point at another household''s item');
select pg_temp.ok(not exists (select 1 from public.recipes where id = :other::uuid),
  '... and the whole save is undone (no half recipe)');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ insert into public.recipe_ingredients (household_id, recipe_id, item_id, name) values (%L, %L, %L, 'Telur') $q$, :f1, :soto, :eggs)) like '%recipe_ingredients_item_fkey%',
  '... nor directly');
select pg_temp.ok(pg_temp.err_as(:a9, format($q$ insert into public.recipe_ingredients (household_id, recipe_id, name) values (%L, %L, 'Garam') $q$, :f2, :soto)) like '%recipe_ingredients_recipe_fkey%',
  'a line can''t join another household''s recipe');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.save_recipe(jsonb_build_object('household_id', %L, 'name', 'X'), jsonb_build_array(jsonb_build_object('name', 'Gula', 'unit', 'sdt'))) $q$, :f1)) like '%recipe_ingredients_unit_needs_amount%',
  'a unit needs an amount (to taste has neither)');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.save_recipe(jsonb_build_object('household_id', %L, 'name', 'X'), jsonb_build_array(jsonb_build_object('name', 'Gula', 'amount', 1, 'unit', 'cup'))) $q$, :f1)) like '%recipe_ingredients_unit_check%',
  'an unknown unit is refused');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.save_recipe(jsonb_build_object('household_id', %L, 'name', 'X'), jsonb_build_array(jsonb_build_object('name', 'Gula', 'amount', 0, 'unit', 'g'))) $q$, :f1)) like '%recipe_ingredients_amount_check%',
  'an amount of 0 is refused');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.save_recipe(jsonb_build_object('household_id', %L, 'name', '  '), '[]') $q$, :f1)) like '%recipes_name_length%',
  'a recipe needs a name');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.save_recipe(jsonb_build_object('household_id', %L, 'name', 'X', 'servings', 51), '[]') $q$, :f1)) like '%recipes_servings_check%',
  'servings stay 1–50');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.save_recipe(jsonb_build_object('household_id', %L, 'name', 'X', 'written_in', 'fr'), '[]') $q$, :f1)) like '%recipes_written_in_check%',
  'written in English or Indonesian only');
select pg_temp.ok(pg_temp.err_as(:a1, $q$ update public.inventory_items set unit = 'sdm' where id = '00000000-0000-0000-0000-0000000151e1' $q$) like '%inventory_items_unit_check%',
  'sdm is still refused on stock');

-- An owner deletes the chicken: the line keeps its name, loses the link.
select pg_temp.ok(pg_temp.rows_as(:a1, format($q$ delete from public.inventory_items where id = %L $q$, :chicken)) = 1,
  'the owner deletes the chicken item');
select pg_temp.ok((select item_id is null and name = 'Chicken' and amount = 1.5 and household_id = :f1::uuid
                     from public.recipe_ingredients where recipe_id = :soto::uuid and position = 0),
  '... the line keeps its name and amount, without the link');

-- ---- Server-stamped fields -----------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ update public.recipes set created_by = %L, household_id = %L where id = %L $q$, :a9, :f2, :soto)) <> ''
                  or (select created_by = :a1::uuid and household_id = :f1::uuid from public.recipes where id = :soto::uuid),
  'a recipe''s author and household can''t be changed');
select pg_temp.ok((select created_by = :a1::uuid and household_id = :f1::uuid from public.recipes where id = :soto::uuid),
  '... still the first owner''s, in the first household');

-- ---- Export --------------------------------------------------------------------------
select pg_temp.ok((select jsonb_array_length(j -> 'recipes') = 1
                          and j -> 'recipes' -> 0 ->> 'name_id' = 'Soto ayam'
                          and jsonb_array_length(j -> 'recipes' -> 0 -> 'ingredients') = 3
                          and j -> 'recipes' -> 0 -> 'ingredients' -> 1 ->> 'name_id' = 'Daun jeruk'
                     from (select pg_temp.export_as(:a1) as j) e),
  'the export includes the recipe with its lines and the Indonesian version');
select pg_temp.ok((select jsonb_array_length(j -> 'recipes') = 0 from (select pg_temp.export_as(:a9) as j) e),
  '... and not another household''s');
select pg_temp.ok((select j ? 'food' and j ? 'repair_walk_ins' and j ? 'repair_supervision' and j ? 'setup'
                     from (select pg_temp.export_as(:a1) as j) e),
  '... and still everything 149 exported');

-- ---- Deleting a recipe ---------------------------------------------------------------
select pg_temp.ok(pg_temp.rows_as(:a1, format($q$ delete from public.recipes where id = %L $q$, :soto)) = 1,
  'the owner deletes the recipe');
select pg_temp.ok(not exists (select 1 from public.recipe_ingredients where recipe_id = :soto::uuid),
  '... and its lines go with it');

-- ---- Grants --------------------------------------------------------------------------
select pg_temp.ok(not has_function_privilege('anon', 'public.save_recipe(jsonb, jsonb)', 'execute')
                  and has_function_privilege('authenticated', 'public.save_recipe(jsonb, jsonb)', 'execute')
                  and has_function_privilege('service_role', 'public.save_recipe(jsonb, jsonb)', 'execute'),
  'save_recipe: authenticated and service_role, not anon');
select pg_temp.ok((select prosecdef = false from pg_proc where proname = 'save_recipe'),
  'save_recipe is security invoker (RLS applies)');
select pg_temp.ok((select proconfig @> array['search_path=""'] from pg_proc where proname = 'save_recipe'),
  'save_recipe has an empty search_path');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.recipes_server_fields()', 'execute')
                  and not has_function_privilege('anon', 'public.recipes_server_fields()', 'execute')
                  and not has_function_privilege('authenticated', 'public.recipe_ingredients_server_fields()', 'execute'),
  'the trigger functions: not callable');
select pg_temp.ok(not has_table_privilege('anon', 'public.recipes', 'select')
                  and not has_table_privilege('anon', 'public.recipe_ingredients', 'select')
                  and has_table_privilege('authenticated', 'public.recipes', 'select'),
  'tables: authenticated (RLS decides), never anon');
select pg_temp.ok(not has_function_privilege('anon', 'public.export_household_data()', 'execute')
                  and has_function_privilege('authenticated', 'public.export_household_data()', 'execute')
                  and (select prosecdef from pg_proc where proname = 'export_household_data'),
  'export_household_data: still security definer, authenticated, not anon');
select pg_temp.ok((select relrowsecurity from pg_class where oid = 'public.recipes'::regclass)
                  and (select relrowsecurity from pg_class where oid = 'public.recipe_ingredients'::regclass),
  'row level security is on for both tables');
select pg_temp.ok(not exists (
    select 1 from pg_policies
     where tablename in ('recipes', 'recipe_ingredients') and cmd <> 'SELECT'
       and coalesce(qual, '') || coalesce(with_check, '') not like '%is_household_admin%'
  ),
  'every write policy checks is_household_admin');

rollback;
