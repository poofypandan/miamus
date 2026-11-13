-- Migration 156 checks: changing what cooking used, and recipes that learn
-- (Phase 177 PR 1; docs/phase-177-cooking-corrections-plan.md, section 11
-- "Tests"). recipes.hints_off (owners only, at most 200); cook_menu_dish
-- writes said / short / planned / cleared_date and an entry for every line;
-- uncook_menu_dish skips amount 0 and puts a cleared date back;
-- change_cooked_uses applies only the difference (more off, less back,
-- untick, new tick, never below zero, the missing part never taken from
-- stock bought since, Undo exact), refuses by name, keeps entries it can't
-- read, never touches cooked_at / cooked_by; un-cook by a staff phone only
-- within 10 minutes of cooking, an owner any time (audit D1); anon gets none of the three;
-- the export carries the new keys and hints_off.
-- LOCAL DATABASE ONLY. One transaction, rolled back. Run after 156 is
-- applied:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/156_cooking_corrections.sql
-- The 151, 153 and 154 tests still pass after 156.
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
create function pg_temp.item(p uuid) returns public.inventory_items language sql as $$
  select * from public.inventory_items where id = p
$$;
create function pg_temp.dish(p uuid) returns public.menu_dishes language sql as $$
  select * from public.menu_dishes where id = p
$$;
-- A recipe's hints_off. Checks read through functions, never a bare
-- subquery, so they run after the call before them in the same expression.
create function pg_temp.hints(p uuid) returns uuid[] language sql as $$
  select hints_off from public.recipes where id = p
$$;
-- One entry of a dish's cooked_uses (null when there is none).
create function pg_temp.entry(p_dish uuid, p_item uuid) returns jsonb language sql as $$
  select e from public.menu_dishes d, jsonb_array_elements(d.cooked_uses) e
   where d.id = p_dish and e ->> 'item_id' = p_item::text
$$;
-- cook_menu_dish / change_cooked_uses / uncook_menu_dish as a session: the answer.
create function pg_temp.cook(uid uuid, p_dish uuid, uses text, staff uuid default null) returns jsonb language sql as $$
  select pg_temp.json_as(uid, format('select public.cook_menu_dish(%L, %L::jsonb, %L)', p_dish, uses, staff))
$$;
create function pg_temp.change(uid uuid, p_dish uuid, uses text, staff uuid default null, was jsonb default null) returns jsonb language sql as $$
  select pg_temp.json_as(uid, format('select public.change_cooked_uses(%L, %L::jsonb, %L, %L::jsonb)', p_dish, uses, staff, was))
$$;
-- The same, returning the error ('' when it ran).
create function pg_temp.change_err(uid uuid, p_dish uuid, uses text, staff uuid default null, was jsonb default null) returns text language sql as $$
  select pg_temp.err_as(uid, format('select public.change_cooked_uses(%L, %L::jsonb, %L, %L::jsonb)', p_dish, uses, staff, was))
$$;
create function pg_temp.uncook(uid uuid, p_dish uuid) returns jsonb language sql as $$
  select pg_temp.json_as(uid, format('select public.uncook_menu_dish(%L)', p_dish))
$$;
-- A cooked dish's list as the phone read it (its p_was).
create function pg_temp.was(p_dish uuid) returns jsonb language sql as $$
  select cooked_uses from public.menu_dishes where id = p_dish
$$;
-- Stock bought or set in between (postgres; the amount trigger still runs).
create function pg_temp.set_qty(p uuid, q numeric) returns void language sql as $$
  update public.inventory_items set quantity = q where id = p
$$;

-- ---- Households ----------------------------------------------------------------------
-- f1: owner a1, staff phone p1, staff Sari (s1) and Budi (s2). f2: owner a9, staff Rina (s9).
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, anon, now(), now()
from (values
  ('00000000-0000-0000-0000-0000000156a1', 'one156@test.local', false),
  ('00000000-0000-0000-0000-0000000156a9', 'nine156@test.local', false),
  ('00000000-0000-0000-0000-0000000156b1', null, true)
) as u(id, email, anon);
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000156f1', 'Rumah Melati', '00000000-0000-0000-0000-0000000156a1'),
  ('00000000-0000-0000-0000-0000000156f2', 'Rumah Kenanga', '00000000-0000-0000-0000-0000000156a9');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000156f1', '00000000-0000-0000-0000-0000000156a1', 'owner'),
  ('00000000-0000-0000-0000-0000000156f2', '00000000-0000-0000-0000-0000000156a9', 'owner');
insert into public.device_sessions (user_id, household_id) values
  ('00000000-0000-0000-0000-0000000156b1', '00000000-0000-0000-0000-0000000156f1');
insert into public.staff_profiles (id, household_id, name, archived_at) values
  ('00000000-0000-0000-0000-0000000156c1', '00000000-0000-0000-0000-0000000156f1', 'Sari', null),
  ('00000000-0000-0000-0000-0000000156c2', '00000000-0000-0000-0000-0000000156f1', 'Budi', null),
  ('00000000-0000-0000-0000-0000000156c9', '00000000-0000-0000-0000-0000000156f2', 'Rina', null);
-- Tracked: beef 300 g, santan 1000 ml, shallots 1000 g (dated), candlenuts
-- 0 pcs, chicken 300 g, tomato / chilli / carrot 1000 g, tofu 4 pcs (dated).
-- Untracked: salt.
insert into public.inventory_items (id, household_id, scope, name, category, quantity, unit, min_threshold, track_amount, expires_on) values
  ('00000000-0000-0000-0000-0000000156e1', '00000000-0000-0000-0000-0000000156f1', 'home', 'Daging sapi', 'fresh_food', 300, 'g', 0, true, null),
  ('00000000-0000-0000-0000-0000000156e2', '00000000-0000-0000-0000-0000000156f1', 'home', 'Santan', 'pantry', 1000, 'ml', 0, true, null),
  ('00000000-0000-0000-0000-0000000156e3', '00000000-0000-0000-0000-0000000156f1', 'home', 'Bawang merah', 'fresh_food', 1000, 'g', 0, true, '2026-12-01'),
  ('00000000-0000-0000-0000-0000000156e4', '00000000-0000-0000-0000-0000000156f1', 'home', 'Kemiri', 'pantry', 0, 'pcs', 0, true, null),
  ('00000000-0000-0000-0000-0000000156e5', '00000000-0000-0000-0000-0000000156f1', 'home', 'Ayam', 'fresh_food', 300, 'g', 0, true, null),
  ('00000000-0000-0000-0000-0000000156e6', '00000000-0000-0000-0000-0000000156f1', 'home', 'Tomat', 'fresh_food', 1000, 'g', 0, true, null),
  ('00000000-0000-0000-0000-0000000156e7', '00000000-0000-0000-0000-0000000156f1', 'home', 'Cabai', 'fresh_food', 1000, 'g', 0, true, null),
  ('00000000-0000-0000-0000-0000000156e8', '00000000-0000-0000-0000-0000000156f1', 'home', 'Wortel', 'fresh_food', 1000, 'g', 0, true, null),
  ('00000000-0000-0000-0000-0000000156ea', '00000000-0000-0000-0000-0000000156f1', 'home', 'Tahu', 'fresh_food', 4, 'pcs', 0, true, '2026-11-20'),
  ('00000000-0000-0000-0000-0000000156eb', '00000000-0000-0000-0000-0000000156f1', 'home', 'Garam', 'pantry', 0, 'g', 0, false, null);
insert into public.recipes (id, household_id, name, servings) values
  ('00000000-0000-0000-0000-0000000156d0', '00000000-0000-0000-0000-0000000156f1', 'Rendang', 4);
insert into public.menu_dishes (id, household_id, day, meal, recipe_id, title, servings) values
  ('00000000-0000-0000-0000-0000000156d1', '00000000-0000-0000-0000-0000000156f1', current_date, 'dinner', '00000000-0000-0000-0000-0000000156d0', 'Rendang', 4),
  ('00000000-0000-0000-0000-0000000156d2', '00000000-0000-0000-0000-0000000156f1', current_date, 'lunch', null, 'Gulai', null),
  ('00000000-0000-0000-0000-0000000156d3', '00000000-0000-0000-0000-0000000156f1', current_date, 'lunch', null, 'Opor', null),
  ('00000000-0000-0000-0000-0000000156d4', '00000000-0000-0000-0000-0000000156f1', current_date, 'breakfast', null, 'Sayur', null),
  ('00000000-0000-0000-0000-0000000156d5', '00000000-0000-0000-0000-0000000156f1', current_date, 'breakfast', null, 'Tahu goreng', null),
  ('00000000-0000-0000-0000-0000000156d6', '00000000-0000-0000-0000-0000000156f1', current_date, 'dinner', null, 'Belum dimasak', null),
  ('00000000-0000-0000-0000-0000000156d7', '00000000-0000-0000-0000-0000000156f1', current_date - 1, 'dinner', null, 'Kemarin', null);

\set a1 '''00000000-0000-0000-0000-0000000156a1'''
\set a9 '''00000000-0000-0000-0000-0000000156a9'''
\set p1 '''00000000-0000-0000-0000-0000000156b1'''
\set s1 '''00000000-0000-0000-0000-0000000156c1'''
\set s2 '''00000000-0000-0000-0000-0000000156c2'''
\set s9 '''00000000-0000-0000-0000-0000000156c9'''
\set beef '''00000000-0000-0000-0000-0000000156e1'''
\set santan '''00000000-0000-0000-0000-0000000156e2'''
\set shallot '''00000000-0000-0000-0000-0000000156e3'''
\set kemiri '''00000000-0000-0000-0000-0000000156e4'''
\set ayam '''00000000-0000-0000-0000-0000000156e5'''
\set tomat '''00000000-0000-0000-0000-0000000156e6'''
\set cabai '''00000000-0000-0000-0000-0000000156e7'''
\set wortel '''00000000-0000-0000-0000-0000000156e8'''
\set tahu '''00000000-0000-0000-0000-0000000156ea'''
\set garam '''00000000-0000-0000-0000-0000000156eb'''
\set recipe '''00000000-0000-0000-0000-0000000156d0'''
\set rendang '''00000000-0000-0000-0000-0000000156d1'''
\set gulai '''00000000-0000-0000-0000-0000000156d2'''
\set opor '''00000000-0000-0000-0000-0000000156d3'''
\set sayur '''00000000-0000-0000-0000-0000000156d4'''
\set tahugoreng '''00000000-0000-0000-0000-0000000156d5'''
\set raw '''00000000-0000-0000-0000-0000000156d6'''
\set kemarin '''00000000-0000-0000-0000-0000000156d7'''

-- ---- recipes.hints_off ------------------------------------------------------------------
select pg_temp.ok((select data_type = 'ARRAY' and udt_name = '_uuid' and is_nullable = 'NO' and column_default = '''{}''::uuid[]'
                     from information_schema.columns
                    where table_schema = 'public' and table_name = 'recipes' and column_name = 'hints_off'),
  'recipes.hints_off: uuid[], not null, default {}');
select pg_temp.ok(pg_temp.hints(:recipe) = '{}',
  'a recipe added without it has none');
select pg_temp.ok(pg_temp.rows_as(:p1, format($q$ update public.recipes set hints_off = array[%L::uuid] where id = %L $q$, :beef, :recipe)) = 0
                  and pg_temp.hints(:recipe) = '{}',
  'a staff phone can''t write hints_off (no rows)');
select pg_temp.ok(pg_temp.rows_as(:a9, format($q$ update public.recipes set hints_off = array[%L::uuid] where id = %L $q$, :beef, :recipe)) = 0,
  '... nor another household''s owner');
select pg_temp.ok(pg_temp.rows_as(:a1, format($q$ update public.recipes set hints_off = array[%L::uuid] where id = %L $q$, :beef, :recipe)) = 1
                  and pg_temp.hints(:recipe) = array[:beef::uuid],
  'the owner says Keep recipe for the beef (an ordinary update)');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ update public.recipes set hints_off = (select array_agg(gen_random_uuid()) from generate_series(1, 201)) where id = %L $q$, :recipe)) like '%recipes_hints_off_size%',
  '201 ids are refused');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ update public.recipes set hints_off = (select array_agg(gen_random_uuid()) from generate_series(1, 200)) where id = %L $q$, :recipe)) = '',
  '... 200 are allowed');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ update public.recipes set hints_off = array[%L::uuid] where id = %L $q$, :beef, :recipe)) = '',
  '(back to the beef alone)');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.save_recipe(jsonb_build_object('id', %L, 'household_id', %L, 'name', 'Rendang', 'servings', 4), '[]'::jsonb) $q$,
                                             :recipe, '00000000-0000-0000-0000-0000000156f1')) = ''
                  and pg_temp.hints(:recipe) = array[:beef::uuid],
  'save_recipe leaves hints_off alone');

-- ---- Cooking: said, short, planned, cleared_date, an entry for every line ---------------
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.cook_menu_dish(%L, '[{"item_id":"%s","amount":5,"planned":0}]'::jsonb, null) $q$, :rendang, :beef)) like '%bad_amount%'
                  and pg_temp.err_as(:p1, format($q$ select public.cook_menu_dish(%L, '[{"item_id":"%s","amount":5,"planned":100001}]'::jsonb, null) $q$, :rendang, :beef)) like '%bad_amount%',
  'cooking refuses a planned amount of 0 or above 100,000');
select pg_temp.ok((pg_temp.cook(:p1, :rendang, format(
    '[{"item_id":"%s","amount":500,"unit":"g","planned":500},{"item_id":"%s","amount":400,"unit":"ml","planned":400},'
    '{"item_id":"%s","amount":1000,"unit":"g","planned":800},{"item_id":"%s","amount":5,"unit":"pcs","planned":5}]',
    :beef, :santan, :shallot, :kemiri), :s1) -> 'dish' ->> 'cooked_by') = trim(both '''' from :'s1'),
  'a staff phone cooks rendang as Sari: 500 g beef (300 there), 400 ml santan, 1 kg shallots, 5 candlenuts (none there)');
select pg_temp.ok(pg_temp.entry(:rendang, :beef) = jsonb_build_object('item_id', :beef::uuid, 'amount', 300, 'unit', 'g', 'said', 500, 'short', 200, 'planned', 500),
  '... beef: 300 came off, 500 said, 200 short, 500 planned');
select pg_temp.ok(pg_temp.entry(:rendang, :santan) = jsonb_build_object('item_id', :santan::uuid, 'amount', 400, 'unit', 'ml', 'said', 400, 'planned', 400),
  '... santan: 400 came off, no short');
select pg_temp.ok(pg_temp.entry(:rendang, :shallot) = jsonb_build_object('item_id', :shallot::uuid, 'amount', 1000, 'unit', 'g', 'said', 1000, 'planned', 800, 'cleared_date', '2026-12-01'),
  '... shallots: the last of a dated item, so the entry remembers the date it cleared');
select pg_temp.ok((pg_temp.item(:shallot)).quantity = 0 and (pg_temp.item(:shallot)).stock_status = 'out' and (pg_temp.item(:shallot)).expires_on is null,
  '... and the shallots are Out with no date (154)');
select pg_temp.ok(pg_temp.entry(:rendang, :kemiri) = jsonb_build_object('item_id', :kemiri::uuid, 'amount', 0, 'unit', 'pcs', 'said', 5, 'short', 5, 'planned', 5)
                  and (pg_temp.item(:kemiri)).quantity = 0,
  '... candlenuts: an entry with amount 0 though nothing was there');
select pg_temp.ok((pg_temp.item(:beef)).quantity = 0 and (pg_temp.item(:santan)).quantity = 600,
  '... the stock: beef 0, santan 600');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ update public.menu_dishes set cooked_uses = '[]' where id = %L $q$, :rendang)) like '%cooked_through_functions_only%',
  'an owner still can''t write cooked_uses directly');

-- ---- Who may change ---------------------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(null, format($q$ select public.change_cooked_uses(%L, '[]'::jsonb, null, null) $q$, :rendang)) like '%permission denied%'
                  and pg_temp.err_as(null, format($q$ select public.cook_menu_dish(%L, '[]'::jsonb, null) $q$, :raw)) like '%permission denied%'
                  and pg_temp.err_as(null, format($q$ select public.uncook_menu_dish(%L) $q$, :rendang)) like '%permission denied%',
  'anon can''t execute any of the three');
select pg_temp.ok(pg_temp.change_err(:a9, :rendang, '[]') like '%not_found%',
  'another household''s owner can''t change the dish (not_found)');
select pg_temp.ok(pg_temp.change_err(:p1, :rendang, '[]', :s9::uuid) like '%staff_not_in_household%',
  'a staff id from another household is refused');
select pg_temp.ok(pg_temp.change_err(:p1, :rendang, '[]', null, '[]'::jsonb) like '%changed_elsewhere%',
  'a list read before another phone''s change is refused (changed_elsewhere)');
select pg_temp.ok(pg_temp.change_err(:p1, :rendang, format('[{"item_id":"%s","amount":0}]', :beef)) like '%bad_amount%'
                  and pg_temp.change_err(:p1, :rendang, format('[{"item_id":"%s","amount":100001}]', :beef)) like '%bad_amount%'
                  and pg_temp.change_err(:p1, :rendang, format('[{"item_id":"%s","amount":5,"planned":-1}]', :beef)) like '%bad_amount%'
                  and pg_temp.change_err(:p1, :rendang, '[{"amount":5}]') like '%bad_amount%',
  'an amount of 0, above 100,000, a bad planned or no item is refused (bad_amount)');
select pg_temp.ok(pg_temp.change_err(:p1, :rendang, (select jsonb_agg(jsonb_build_object('item_id', :beef::uuid, 'amount', 1)) from generate_series(1, 201))::text) like '%bad_uses%'
                  and pg_temp.change_err(:p1, :rendang, '{}') like '%bad_uses%',
  'more than 200 lines, or not a list, is refused (bad_uses)');
select pg_temp.ok(pg_temp.change_err(:p1, :rendang, format('[{"item_id":"%s","amount":5,"unit":"g"},{"item_id":"%s","amount":1,"unit":"kg"}]', :beef, :beef)) like '%unit_mismatch%'
                  and pg_temp.change_err(:p1, :rendang, format('[{"item_id":"%s","amount":5,"unit":"pcs"}]', :beef)) like '%unit_mismatch%',
  'two units for one item, or a unit that doesn''t convert, is refused (unit_mismatch)');
select pg_temp.ok(pg_temp.change_err(:p1, :rendang, format('[{"item_id":"%s","amount":5}]', :garam)) like '%item_not_tracked%',
  'an untracked item is refused (item_not_tracked)');
select pg_temp.ok((pg_temp.item(:beef)).quantity = 0 and (pg_temp.item(:santan)).quantity = 600
                  and pg_temp.entry(:rendang, :beef) ->> 'said' = '500',
  'none of the refused changes moved anything');

-- ---- The 300-of-500 case (section 3c), with stock bought in between ----------------------
select pg_temp.set_qty(:beef, 1000);
select pg_temp.ok((pg_temp.item(:beef)).quantity = 1000, '1 kg of beef is bought after cooking');
-- The santan's amount_set_at is pushed back, to see it isn't written.
alter table public.inventory_items disable trigger inventory_items_stamp_stock_status;
update public.inventory_items set amount_set_at = '2026-01-01' where id = :santan::uuid;
alter table public.inventory_items enable trigger inventory_items_stamp_stock_status;
\set rest_uses ',{"item_id":"00000000-0000-0000-0000-0000000156e2","amount":400,"unit":"ml"},{"item_id":"00000000-0000-0000-0000-0000000156e3","amount":1000,"unit":"g"},{"item_id":"00000000-0000-0000-0000-0000000156e4","amount":5,"unit":"pcs"}]'
select pg_temp.ok(jsonb_array_length(pg_temp.change(:p1, :rendang, format('[{"item_id":"%s","amount":600,"unit":"g"}', :beef) || :'rest_uses', :s2::uuid, pg_temp.was(:rendang)) -> 'items') = 1,
  'Budi''s phone changes Sari''s rendang: beef 600 g, the rest as it was; only the beef is written');
select pg_temp.ok((pg_temp.item(:beef)).quantity = 900
                  and pg_temp.entry(:rendang, :beef) = jsonb_build_object('item_id', :beef::uuid, 'amount', 400, 'unit', 'g', 'said', 600, 'short', 200, 'planned', 500),
  '... 600 takes 100 more (the 200 missing is never taken from the new stock)');
select pg_temp.ok((pg_temp.item(:santan)).quantity = 600 and (pg_temp.item(:santan)).amount_set_at = '2026-01-01'
                  and (pg_temp.item(:santan)).amount_set_by = :s1::uuid,
  '... the santan, unchanged on the sheet, is not written');
select pg_temp.ok((pg_temp.item(:beef)).amount_set_by = :s2::uuid,
  '... the beef is credited to Budi');
select pg_temp.ok((pg_temp.dish(:rendang)).cooked_by = :s1::uuid and (pg_temp.dish(:rendang)).cooked_at = now(),
  '... Sari is still the cook, and cooked_at did not move');
select pg_temp.ok(pg_temp.change_err(:p1, :rendang, format('[{"item_id":"%s","amount":400,"unit":"g"}', :beef) || :'rest_uses', null, pg_temp.was(:rendang)) = ''
                  and (pg_temp.item(:beef)).quantity = 1100 and pg_temp.entry(:rendang, :beef) ->> 'amount' = '200',
  '400 puts back (100 below what first came off)');
select pg_temp.ok(pg_temp.change_err(:p1, :rendang, format('[{"item_id":"%s","amount":500,"unit":"g"}', :beef) || :'rest_uses', null, pg_temp.was(:rendang)) = ''
                  and (pg_temp.item(:beef)).quantity = 1000
                  and pg_temp.entry(:rendang, :beef) = jsonb_build_object('item_id', :beef::uuid, 'amount', 300, 'unit', 'g', 'said', 500, 'short', 200, 'planned', 500),
  'back to 500: the stock and the entry are exactly as they were');
select pg_temp.ok(jsonb_array_length(pg_temp.change(:p1, :rendang, format('[{"item_id":"%s","amount":500,"unit":"g"}', :beef) || :'rest_uses', null, pg_temp.was(:rendang)) -> 'items') = 0
                  and (pg_temp.item(:beef)).quantity = 1000,
  'the same list sent again writes nothing');
select pg_temp.ok(jsonb_array_length(pg_temp.change(:p1, :rendang, format('[{"item_id":"%s","amount":500,"unit":"g"}', :beef) || :'rest_uses') -> 'items') = 0,
  '... also without a list to compare (a resend)');

-- ---- Less goes back, and the date with it -------------------------------------------------
select pg_temp.ok(pg_temp.change_err(:a1, :rendang, format('[{"item_id":"%s","amount":500,"unit":"g"},{"item_id":"%s","amount":400,"unit":"ml"},{"item_id":"%s","amount":600,"unit":"g"},{"item_id":"%s","amount":5,"unit":"pcs"}]',
                                                         :beef, :santan, :shallot, :kemiri), null, pg_temp.was(:rendang)) = '',
  'the owner says 600 g of shallots, not 1 kg');
select pg_temp.ok((pg_temp.item(:shallot)).quantity = 400 and (pg_temp.item(:shallot)).expires_on = '2026-12-01'
                  and (pg_temp.item(:shallot)).stock_status = 'ok'
                  and pg_temp.entry(:rendang, :shallot) = jsonb_build_object('item_id', :shallot::uuid, 'amount', 600, 'unit', 'g', 'said', 600, 'planned', 800),
  '... 400 g goes back with its date, and the entry no longer holds the date');

-- ---- Untick puts all back, a new tick takes off, never below zero --------------------------
select pg_temp.ok(pg_temp.change_err(:p1, :rendang, format('[{"item_id":"%s","amount":500,"unit":"g"},{"item_id":"%s","amount":600,"unit":"g"},{"item_id":"%s","amount":5,"unit":"pcs"}]',
                                                         :beef, :shallot, :kemiri), :s2::uuid, pg_temp.was(:rendang)) = ''
                  and (pg_temp.item(:santan)).quantity = 1000
                  and pg_temp.entry(:rendang, :santan) = jsonb_build_object('item_id', :santan::uuid, 'amount', 0, 'unit', 'ml', 'said', 0, 'planned', 400),
  'unticking the santan puts all 400 ml back; its entry stays with said 0');
select pg_temp.ok(pg_temp.change_err(:p1, :rendang, format('[{"item_id":"%s","amount":500,"unit":"g"},{"item_id":"%s","amount":200,"unit":"ml"},{"item_id":"%s","amount":600,"unit":"g"},{"item_id":"%s","amount":5,"unit":"pcs"}]',
                                                         :beef, :santan, :shallot, :kemiri), :s2::uuid, pg_temp.was(:rendang)) = ''
                  and (pg_temp.item(:santan)).quantity = 800 and pg_temp.entry(:rendang, :santan) ->> 'amount' = '200',
  'ticking it again at 200 ml takes 200 off');
select pg_temp.ok(pg_temp.change_err(:p1, :rendang, format('[{"item_id":"%s","amount":500,"unit":"g"},{"item_id":"%s","amount":200,"unit":"ml"},{"item_id":"%s","amount":600,"unit":"g"},{"item_id":"%s","amount":8,"unit":"pcs"}]',
                                                         :beef, :santan, :shallot, :kemiri), :s2::uuid, pg_temp.was(:rendang)) = ''
                  and (pg_temp.item(:kemiri)).quantity = 0
                  and pg_temp.entry(:rendang, :kemiri) = jsonb_build_object('item_id', :kemiri::uuid, 'amount', 0, 'unit', 'pcs', 'said', 8, 'short', 5, 'planned', 5),
  '8 candlenuts with none at home: nothing below zero, the entry says 8');

-- A new tick (not cooked), and one with not enough there.
select pg_temp.ok(pg_temp.cook(:p1, :gulai, format('[{"item_id":"%s","amount":300,"unit":"ml"}]', :santan), :s1) is not null
                  and (pg_temp.item(:santan)).quantity = 500,
  'gulai is cooked with 300 ml of santan (500 left)');
select pg_temp.ok(pg_temp.change_err(:p1, :gulai, format('[{"item_id":"%s","amount":300,"unit":"ml"},{"item_id":"%s","amount":100,"unit":"g","planned":150},{"item_id":"%s","amount":4,"unit":"pcs","planned":4}]',
                                                       :santan, :beef, :kemiri), :s1::uuid, pg_temp.was(:gulai)) = ''
                  and (pg_temp.item(:beef)).quantity = 900
                  and pg_temp.entry(:gulai, :beef) = jsonb_build_object('item_id', :beef::uuid, 'amount', 100, 'unit', 'g', 'said', 100, 'planned', 150)
                  and pg_temp.entry(:gulai, :kemiri) = jsonb_build_object('item_id', :kemiri::uuid, 'amount', 0, 'unit', 'pcs', 'said', 4, 'short', 4, 'planned', 4),
  'a new tick takes it off as cooking does (beef 100 g); one with nothing there records the shortfall');

-- ---- A change that runs out, then its Undo ----------------------------------------------
select pg_temp.ok(pg_temp.change_err(:p1, :gulai, format('[{"item_id":"%s","amount":2000,"unit":"ml"},{"item_id":"%s","amount":100,"unit":"g"},{"item_id":"%s","amount":4,"unit":"pcs"}]',
                                                       :santan, :beef, :kemiri), :s1::uuid, pg_temp.was(:gulai)) = ''
                  and (pg_temp.item(:santan)).quantity = 0 and (pg_temp.item(:santan)).stock_status = 'out'
                  and pg_temp.entry(:gulai, :santan) ->> 'amount' = '800' and pg_temp.entry(:gulai, :santan) ->> 'said' = '2000',
  'saying 2 L of santan with 500 ml left takes the 500 ml: it is Out');
select pg_temp.ok(pg_temp.change_err(:p1, :gulai, format('[{"item_id":"%s","amount":300,"unit":"ml"},{"item_id":"%s","amount":100,"unit":"g"},{"item_id":"%s","amount":4,"unit":"pcs"}]',
                                                       :santan, :beef, :kemiri), :s1::uuid, pg_temp.was(:gulai)) = ''
                  and (pg_temp.item(:santan)).quantity = 500
                  and pg_temp.entry(:gulai, :santan) = jsonb_build_object('item_id', :santan::uuid, 'amount', 300, 'unit', 'ml', 'said', 300),
  '... Undo (the previous list sent back) returns exactly the 500 ml');

-- ---- Cook 500 with 300 there, buy, untick, then Undo -------------------------------------
select pg_temp.ok(pg_temp.cook(:a1, :opor, format('[{"item_id":"%s","amount":500,"unit":"g","planned":500}]', :ayam)) is not null
                  and (pg_temp.item(:ayam)).quantity = 0,
  'opor asks 500 g of chicken with 300 g there');
select pg_temp.set_qty(:ayam, 1000);
select pg_temp.ok(pg_temp.change_err(:a1, :opor, '[]', null, pg_temp.was(:opor)) = ''
                  and (pg_temp.item(:ayam)).quantity = 1300
                  and pg_temp.entry(:opor, :ayam) = jsonb_build_object('item_id', :ayam::uuid, 'amount', 0, 'unit', 'g', 'said', 0, 'short', 200, 'planned', 500),
  'after buying 1 kg, unticking puts the 300 g back; the entry keeps its 200 short');
select pg_temp.ok(pg_temp.change_err(:a1, :opor, format('[{"item_id":"%s","amount":500,"unit":"g"}]', :ayam), null, pg_temp.was(:opor)) = ''
                  and (pg_temp.item(:ayam)).quantity = 1000
                  and pg_temp.entry(:opor, :ayam) = jsonb_build_object('item_id', :ayam::uuid, 'amount', 300, 'unit', 'g', 'said', 500, 'short', 200, 'planned', 500),
  '... Undo (500 again) takes 300, not 500: stock and entry as before the untick');
select pg_temp.ok((pg_temp.dish(:opor)).cooked_at is not null,
  'unticking everything leaves the dish cooked');

-- ---- Entries it can't read are kept; naming them is refused -------------------------------
select pg_temp.ok(pg_temp.cook(:a1, :sayur, format('[{"item_id":"%s","amount":200,"unit":"g"},{"item_id":"%s","amount":100,"unit":"g"},{"item_id":"%s","amount":100,"unit":"g"},{"item_id":"%s","amount":100,"unit":"g"}]',
                                                 :tomat, :cabai, :wortel, :beef)) is not null,
  'sayur is cooked with tomato, chilli, carrot and beef');
update public.inventory_items set track_amount = false where id = :tomat::uuid;
delete from public.inventory_items where id = :cabai::uuid;
update public.inventory_items set unit = 'pcs', quantity = 5 where id = :wortel::uuid;
create temp table sayur_before as select pg_temp.entry(:sayur, :tomat) as tomat, pg_temp.entry(:sayur, :cabai) as cabai, pg_temp.entry(:sayur, :wortel) as wortel;
select pg_temp.ok(pg_temp.change_err(:a1, :sayur, '[]', null, pg_temp.was(:sayur)) = '' and (pg_temp.item(:beef)).quantity = 900,
  'after tracking off, a delete and a unit change, unticking everything puts the beef back');
select pg_temp.ok((select tomat = pg_temp.entry(:sayur, :tomat) and cabai = pg_temp.entry(:sayur, :cabai) and wortel = pg_temp.entry(:sayur, :wortel) from sayur_before)
                  and jsonb_array_length(pg_temp.was(:sayur)) = 4,
  '... and keeps the other three entries untouched');
select pg_temp.ok(pg_temp.change_err(:a1, :sayur, format('[{"item_id":"%s","amount":100,"unit":"g"}]', :tomat)) like '%item_not_tracked%'
                  and pg_temp.change_err(:a1, :sayur, format('[{"item_id":"%s","amount":100,"unit":"g"}]', :cabai)) like '%item_not_tracked%'
                  and pg_temp.change_err(:a1, :sayur, format('[{"item_id":"%s","amount":1,"unit":"pcs"}]', :wortel)) like '%unit_mismatch%',
  '... and naming one of them is refused');
select pg_temp.ok((pg_temp.item(:wortel)).quantity = 5 and (pg_temp.item(:wortel)).unit = 'pcs',
  '... the carrot is left alone');

-- ---- When a change is refused --------------------------------------------------------------
select pg_temp.ok(pg_temp.change_err(:p1, :raw, '[]') like '%not_cooked%',
  'a dish not cooked is refused (not_cooked)');
select pg_temp.ok(pg_temp.cook(:p1, :kemarin, '[]', :s1) is not null, '(a dish with nothing to take off is cooked)');
update public.menu_dishes set cooked_at = now() - interval '29 hours' where id = :kemarin::uuid;
select pg_temp.ok(pg_temp.change_err(:p1, :kemarin, '[]', null, pg_temp.was(:kemarin)) = '',
  'a dish cooked 29 hours ago may still be changed (the server''s margin)');
update public.menu_dishes set cooked_at = now() - interval '31 hours' where id = :kemarin::uuid;
select pg_temp.ok(pg_temp.change_err(:p1, :kemarin, '[]', null, pg_temp.was(:kemarin)) like '%too_late%',
  '... one cooked 31 hours ago is refused (too_late)');

-- ---- Un-cook: amount 0 skipped, the date back ------------------------------------------------
select pg_temp.ok(pg_temp.cook(:p1, :tahugoreng, format('[{"item_id":"%s","amount":4,"unit":"pcs"}]', :tahu), :s1) is not null
                  and (pg_temp.item(:tahu)).expires_on is null
                  and pg_temp.entry(:tahugoreng, :tahu) ->> 'cleared_date' = '2026-11-20',
  'cooking the last 4 tofu clears its date and remembers it');
select pg_temp.ok(pg_temp.uncook(:p1, :tahugoreng) is not null
                  and (pg_temp.item(:tahu)).quantity = 4 and (pg_temp.item(:tahu)).expires_on = '2026-11-20',
  '... Undo puts the 4 back with the date');
select pg_temp.ok(pg_temp.cook(:p1, :tahugoreng, format('[{"item_id":"%s","amount":4,"unit":"pcs"}]', :tahu), :s1) is not null
                  and (pg_temp.item(:tahu)).expires_on is null,
  'cooked again: no date');
update public.inventory_items set quantity = 2, expires_on = '2026-11-25' where id = :tahu::uuid;
select pg_temp.ok(pg_temp.uncook(:a1, :tahugoreng) is not null
                  and (pg_temp.item(:tahu)).quantity = 6 and (pg_temp.item(:tahu)).expires_on = '2026-11-25',
  '... 2 bought meanwhile with a new date: Mark not cooked leaves that date');
create temp table kemiri_before as select (pg_temp.item(:kemiri)).quantity as q, (pg_temp.item(:kemiri)).amount_set_at as at;
create temp table rendang_uncooked as select pg_temp.uncook(:a1, :rendang) as j;
select pg_temp.ok((select not exists (select 1 from jsonb_array_elements(j -> 'items') i where i ->> 'id' = :kemiri) from rendang_uncooked)
                  and (select q = (pg_temp.item(:kemiri)).quantity and at = (pg_temp.item(:kemiri)).amount_set_at from kemiri_before),
  'un-cooking rendang skips the candlenuts (amount 0): not written');
select pg_temp.ok((pg_temp.item(:beef)).quantity = 1200 and (pg_temp.item(:santan)).quantity = 700 and (pg_temp.item(:shallot)).quantity = 1000,
  '... and puts back what the entries say came off (beef 300, santan 200, shallots 600)');

-- ---- Un-cook: owners any time, a staff phone only within 10 minutes (audit D1) -------------
select pg_temp.ok(pg_temp.cook(:p1, :tahugoreng, format('[{"item_id":"%s","amount":1,"unit":"pcs"}]', :tahu), :s1) is not null
                  and (pg_temp.item(:tahu)).quantity = 5,
  'tofu goreng is cooked again by a staff phone (1 tofu; 5 left)');
update public.menu_dishes set cooked_at = now() - interval '9 minutes' where id = :tahugoreng::uuid;
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.uncook_menu_dish(%L) $q$, :tahugoreng)) = ''
                  and (pg_temp.item(:tahu)).quantity = 6 and (pg_temp.dish(:tahugoreng)).cooked_at is null,
  'a staff phone may still Undo 9 minutes after cooking');
select pg_temp.ok(pg_temp.cook(:p1, :tahugoreng, format('[{"item_id":"%s","amount":1,"unit":"pcs"}]', :tahu), :s1) is not null,
  '(cooked again)');
update public.menu_dishes set cooked_at = now() - interval '11 minutes' where id = :tahugoreng::uuid;
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.uncook_menu_dish(%L) $q$, :tahugoreng)) like '%too_late%',
  'a staff phone can''t un-cook it 11 minutes after cooking (too_late)');
select pg_temp.ok((pg_temp.item(:tahu)).quantity = 5 and (pg_temp.dish(:tahugoreng)).cooked_by = :s1::uuid
                  and (pg_temp.dish(:tahugoreng)).cooked_at is not null,
  '... nothing went back, and Sari is still the cook');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.change_cooked_uses(%L, '[{"item_id":"%s","amount":2,"unit":"pcs"}]'::jsonb, %L, %L::jsonb) $q$,
                                             :tahugoreng, :tahu, :s1, pg_temp.was(:tahugoreng))) = ''
                  and (pg_temp.item(:tahu)).quantity = 4,
  '... but it may still change what was used, the same day (no 10-minute limit there)');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.uncook_menu_dish(%L) $q$, :tahugoreng)) = ''
                  and (pg_temp.item(:tahu)).quantity = 6 and (pg_temp.dish(:tahugoreng)).cooked_at is null,
  'an owner may mark it not cooked after 10 minutes (Mark not cooked)');
update public.menu_dishes set cooked_at = now() - interval '3 days', cooked_by = :s1::uuid, cooked_uses = '[]' where id = :raw::uuid;
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.uncook_menu_dish(%L) $q$, :raw)) like '%too_late%'
                  and (pg_temp.dish(:raw)).cooked_by = :s1::uuid,
  'a staff phone can''t erase who cooked a dish 3 days ago');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.uncook_menu_dish(%L) $q$, :opor)) = '',
  'a staff phone may Undo a dish an owner cooked a moment ago');

-- ---- Export ------------------------------------------------------------------------------
select pg_temp.ok((select exists (select 1 from jsonb_array_elements(j -> 'menu') m, jsonb_array_elements(m -> 'cooked_uses') u
                                   where m ->> 'title' = 'Gulai' and u ? 'said' and u ? 'planned')
                          and (j -> 'recipes') @> jsonb_build_array(jsonb_build_object('name', 'Rendang', 'hints_off', jsonb_build_array(:beef::uuid)))
                     from (select pg_temp.json_as(:a1, 'select public.export_household_data()') as j) e),
  'the export holds said, planned and hints_off');

-- ---- Grants ------------------------------------------------------------------------------
select pg_temp.ok((select bool_and(prosecdef and proconfig @> array['search_path=""'])
                     from pg_proc where proname in ('cook_menu_dish', 'uncook_menu_dish', 'change_cooked_uses')
                                    and pronamespace = 'public'::regnamespace),
  'the three are security definer with an empty search_path');
select pg_temp.ok(not has_function_privilege('anon', 'public.change_cooked_uses(uuid, jsonb, uuid, jsonb)', 'execute')
                  and not has_function_privilege('anon', 'public.cook_menu_dish(uuid, jsonb, uuid)', 'execute')
                  and not has_function_privilege('anon', 'public.uncook_menu_dish(uuid)', 'execute')
                  and has_function_privilege('authenticated', 'public.change_cooked_uses(uuid, jsonb, uuid, jsonb)', 'execute')
                  and has_function_privilege('service_role', 'public.change_cooked_uses(uuid, jsonb, uuid, jsonb)', 'execute')
                  and not exists (select 1 from information_schema.routine_privileges
                                   where routine_schema = 'public' and routine_name = 'change_cooked_uses' and grantee = 'PUBLIC'),
  'anon and PUBLIC can''t execute any of the three; authenticated and service_role can change');
select pg_temp.ok((select count(*) = 4 from pg_policies where schemaname = 'public' and tablename = 'recipes')
                  and (select count(*) = 4 from pg_policies where schemaname = 'public' and tablename = 'menu_dishes'),
  'no new policy on recipes or menu_dishes');

rollback;
