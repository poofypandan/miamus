-- Migration 153 checks: the weekly menu and cooking from stock (Phase 170 PR C).
-- Owners plan dishes; staff phones read them but never write menu_dishes;
-- cooking goes only through cook_menu_dish / uncook_menu_dish (a retry is
-- refused, Undo puts back exactly what was taken, only tracked items of the
-- same household, only the household's own non-archived staff); the cooked_*
-- columns can't be written directly, not even by an owner; the shortfall
-- (to_buy_amount) stays until bought; kitchen notes are owners-only with the
-- one-time health-data OK; old menu days are pruned; the export includes it
-- all; grants.
-- LOCAL DATABASE ONLY. One transaction, rolled back. Run after 153 is
-- applied, or with it in the same transaction:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/153_kitchen_menu_and_cooking.sql
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
-- A function's jsonb answer, as a session.
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

-- ---- Households ----------------------------------------------------------------------
-- f1: owner a1, staff phone p1, staff Sari (s1), removed Dewi (s2).
-- f2: owner a9, staff Budi (s9).
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, anon, now(), now()
from (values
  ('00000000-0000-0000-0000-0000000153a1', 'one153@test.local', false),
  ('00000000-0000-0000-0000-0000000153a9', 'nine153@test.local', false),
  ('00000000-0000-0000-0000-0000000153b1', null, true)
) as u(id, email, anon);
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000153f1', 'Rumah Melati', '00000000-0000-0000-0000-0000000153a1'),
  ('00000000-0000-0000-0000-0000000153f2', 'Rumah Kenanga', '00000000-0000-0000-0000-0000000153a9');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000153f1', '00000000-0000-0000-0000-0000000153a1', 'owner'),
  ('00000000-0000-0000-0000-0000000153f2', '00000000-0000-0000-0000-0000000153a9', 'owner');
insert into public.device_sessions (user_id, household_id) values
  ('00000000-0000-0000-0000-0000000153b1', '00000000-0000-0000-0000-0000000153f1');
insert into public.staff_profiles (id, household_id, name, archived_at) values
  ('00000000-0000-0000-0000-0000000153c1', '00000000-0000-0000-0000-0000000153f1', 'Sari', null),
  ('00000000-0000-0000-0000-0000000153c2', '00000000-0000-0000-0000-0000000153f1', 'Dewi', now()),
  ('00000000-0000-0000-0000-0000000153c9', '00000000-0000-0000-0000-0000000153f2', 'Budi', null);
-- Chicken (tracked, 1.5 kg, low at 0.5), rice (tracked, 4 kg), salt
-- (untracked), and another household's eggs (tracked).
insert into public.inventory_items (id, household_id, scope, name, category, quantity, unit, min_threshold, track_amount) values
  ('00000000-0000-0000-0000-0000000153e1', '00000000-0000-0000-0000-0000000153f1', 'home', 'Ayam', 'fresh_food', 1.5, 'kg', 0.5, true),
  ('00000000-0000-0000-0000-0000000153e2', '00000000-0000-0000-0000-0000000153f1', 'home', 'Beras', 'pantry', 4, 'kg', 0, true),
  ('00000000-0000-0000-0000-0000000153e3', '00000000-0000-0000-0000-0000000153f1', 'home', 'Garam', 'pantry', 0, 'pcs', 0, false),
  ('00000000-0000-0000-0000-0000000153e9', '00000000-0000-0000-0000-0000000153f2', 'home', 'Telur', 'fresh_food', 10, 'butir', 0, true);
insert into public.recipes (id, household_id, name, servings) values
  ('00000000-0000-0000-0000-0000000153d1', '00000000-0000-0000-0000-0000000153f1', 'Soto ayam', 4);

\set a1 '''00000000-0000-0000-0000-0000000153a1'''
\set a9 '''00000000-0000-0000-0000-0000000153a9'''
\set p1 '''00000000-0000-0000-0000-0000000153b1'''
\set f1 '''00000000-0000-0000-0000-0000000153f1'''
\set f2 '''00000000-0000-0000-0000-0000000153f2'''
\set s1 '''00000000-0000-0000-0000-0000000153c1'''
\set s2 '''00000000-0000-0000-0000-0000000153c2'''
\set s9 '''00000000-0000-0000-0000-0000000153c9'''
\set chicken '''00000000-0000-0000-0000-0000000153e1'''
\set rice '''00000000-0000-0000-0000-0000000153e2'''
\set salt '''00000000-0000-0000-0000-0000000153e3'''
\set eggs '''00000000-0000-0000-0000-0000000153e9'''
\set soto '''00000000-0000-0000-0000-0000000153d1'''
\set lunch '''00000000-0000-0000-0000-00000153d901'''
\set dinner '''00000000-0000-0000-0000-00000153d902'''
\set other '''00000000-0000-0000-0000-00000153d909'''

-- ---- Owners plan, staff read --------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:a1, format($q$
  insert into public.menu_dishes (id, household_id, day, meal, recipe_id, title, servings, notes, cooked_at, cooked_uses)
  values (%L, %L, current_date, 'lunch', %L, '  Soto ayam ', 4, ' less spicy ', now(), '[{"item_id":"x","amount":9}]')
$q$, :lunch, :f1, :soto)) = '', 'an owner plans a dish with a recipe');
select pg_temp.ok((select title = 'Soto ayam' and notes = 'less spicy' and created_by = :a1::uuid
                          and cooked_at is null and cooked_by is null and cooked_uses is null
                     from public.menu_dishes where id = :lunch::uuid),
  '... trimmed, created by the owner, and a client can''t insert it already cooked');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$
  insert into public.menu_dishes (id, household_id, day, meal, title) values (%L, %L, current_date, 'dinner', 'Nasi goreng')
$q$, :dinner, :f1)) = '', 'an owner plans a dish with just a name');
select pg_temp.ok(pg_temp.rows_as(:p1, format($q$ select * from public.menu_dishes where household_id = %L $q$, :f1)) = 2,
  'a staff phone reads the day''s dishes (Menu hari ini)');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ insert into public.menu_dishes (household_id, day, meal, title) values (%L, current_date, 'lunch', 'Mie') $q$, :f1)) like '%row-level security%',
  'a staff phone can''t add a dish');
select pg_temp.ok(pg_temp.rows_as(:p1, format($q$ update public.menu_dishes set title = 'Mie' where id = %L $q$, :lunch)) = 0,
  '... nor change one (no rows)');
select pg_temp.ok(pg_temp.rows_as(:p1, format($q$ update public.menu_dishes set cooked_at = now(), cooked_uses = '[{"item_id":"%s","amount":5}]' where id = %L $q$, :rice, :lunch)) = 0,
  '... nor mark one cooked directly (no rows)');
select pg_temp.ok(pg_temp.rows_as(:p1, format($q$ delete from public.menu_dishes where id = %L $q$, :lunch)) = 0,
  '... nor delete one (no rows)');
select pg_temp.ok(pg_temp.rows_as(:a9, format($q$ select * from public.menu_dishes where household_id = %L $q$, :f1)) = 0,
  'another household''s owner can''t see the menu');
select pg_temp.ok(pg_temp.rows_as(:a9, format($q$ update public.menu_dishes set title = 'X' where id = %L $q$, :lunch)) = 0
                  and pg_temp.rows_as(:a9, format($q$ delete from public.menu_dishes where id = %L $q$, :lunch)) = 0,
  '... nor change or delete it');
select pg_temp.ok(pg_temp.err_as(:a9, format($q$ insert into public.menu_dishes (household_id, day, meal, title) values (%L, current_date, 'lunch', 'X') $q$, :f1)) like '%row-level security%',
  '... nor add to it');
select pg_temp.ok(pg_temp.err_as(:a9, format($q$ insert into public.menu_dishes (household_id, day, meal, recipe_id, title) values (%L, current_date, 'lunch', %L, 'X') $q$, :f2, :soto)) like '%menu_dishes_recipe_fkey%',
  'a dish can''t use another household''s recipe');
select pg_temp.ok(pg_temp.err_as(null, $q$ select count(*) from public.menu_dishes $q$) like '%permission denied%',
  'a logged-out caller can''t read the menu');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ insert into public.menu_dishes (household_id, day, meal, title) values (%L, current_date, 'snack', 'X') $q$, :f1)) like '%menu_dishes_meal_check%',
  'meals are breakfast, lunch or dinner');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ insert into public.menu_dishes (household_id, day, meal, title) values (%L, current_date, 'lunch', '  ') $q$, :f1)) like '%menu_dishes_title_length%',
  'a dish needs a title');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ insert into public.menu_dishes (household_id, day, meal, title, servings) values (%L, current_date, 'lunch', 'X', 51) $q$, :f1)) like '%menu_dishes_servings_check%',
  'servings stay 1–50');

-- ---- The cooked columns have one door ---------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ update public.menu_dishes set cooked_at = now() where id = %L $q$, :lunch)) like '%cooked_through_functions_only%',
  'an owner can''t set cooked_at directly');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ update public.menu_dishes set cooked_uses = '[{"item_id":"%s","amount":5}]' where id = %L $q$, :rice, :lunch)) like '%cooked_through_functions_only%',
  '... nor cooked_uses');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ update public.menu_dishes set cooked_by = %L where id = %L $q$, :s1, :lunch)) like '%cooked_through_functions_only%',
  '... nor cooked_by');
select pg_temp.ok(pg_temp.rows_as(:a1, format($q$ update public.menu_dishes set servings = 6, title = 'Soto ayam' where id = %L $q$, :lunch)) = 1,
  '... but changes the servings');
select pg_temp.ok(pg_temp.rows_as(:a1, format($q$ update public.menu_dishes set household_id = %L where id = %L $q$, :f2, :lunch)) = 0
                  or (select household_id = :f1::uuid from public.menu_dishes where id = :lunch::uuid),
  'a dish can''t move to another household');

-- ---- Cooking ---------------------------------------------------------------------
select pg_temp.ok((pg_temp.json_as(:p1, format($q$
  select public.cook_menu_dish(%L, '[{"item_id":"%s","amount":1},{"item_id":"%s","amount":0.25},{"item_id":"%s","amount":0.25}]'::jsonb, %L)
$q$, :lunch, :chicken, :rice, :rice, :s1)) -> 'dish' ->> 'cooked_by') = trim(both '''' from :'s1'),
  'a staff phone cooks the dish as Sari');
select pg_temp.ok((select quantity = 0.5 and stock_status = 'low' and amount_set_by = :s1::uuid from public.inventory_items where id = :chicken::uuid)
                  and (select quantity = 3.5 from public.inventory_items where id = :rice::uuid),
  '... chicken 1.5 → 0.5 (running low), rice 4 → 3.5 (the same item twice is summed)');
select pg_temp.ok((select cooked_at is not null and cooked_by = :s1::uuid
                          and jsonb_array_length(cooked_uses) = 2
                          and (select sum((u ->> 'amount')::numeric) from jsonb_array_elements(cooked_uses) u) = 1.5
                     from public.menu_dishes where id = :lunch::uuid),
  '... and the dish keeps what was taken, who and when');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.cook_menu_dish(%L, '[{"item_id":"%s","amount":1}]'::jsonb, %L) $q$, :lunch, :chicken, :s1)) like '%already_cooked%',
  'a second call (a retry after a weak signal) is refused');
select pg_temp.ok((select quantity = 0.5 from public.inventory_items where id = :chicken::uuid),
  '... and takes nothing off twice');

select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.uncook_menu_dish(%L) $q$, :lunch)) = '',
  'Batalkan: a staff phone undoes it');
select pg_temp.ok((select quantity = 1.5 and stock_status = 'ok' from public.inventory_items where id = :chicken::uuid)
                  and (select quantity = 4 from public.inventory_items where id = :rice::uuid),
  '... chicken back to 1.5 (enough), rice back to 4: exactly what was taken');
select pg_temp.ok((select cooked_at is null and cooked_by is null and cooked_uses is null from public.menu_dishes where id = :lunch::uuid),
  '... and the three columns are cleared');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.uncook_menu_dish(%L) $q$, :lunch)) = '',
  'undoing a dish that isn''t cooked changes nothing (runs)');
select pg_temp.ok((select quantity = 1.5 from public.inventory_items where id = :chicken::uuid),
  'undoing a dish that isn''t cooked changes nothing');

-- Floored at 0: Undo returns what was actually taken, not what was asked.
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.cook_menu_dish(%L, '[{"item_id":"%s","amount":5}]'::jsonb, null) $q$, :lunch, :chicken)) = '',
  'an owner cooks it, asking for 5 kg of 1.5');
select pg_temp.ok((select quantity = 0 and stock_status = 'out' from public.inventory_items where id = :chicken::uuid)
                  and (select (cooked_uses -> 0 ->> 'amount')::numeric = 1.5 and cooked_by is null from public.menu_dishes where id = :lunch::uuid),
  '... the chicken is out, and 1.5 kg is what it keeps');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.uncook_menu_dish(%L) $q$, :lunch)) = '',
  '... and Mark not cooked puts 1.5 kg back (runs)');
select pg_temp.ok((select quantity = 1.5 and stock_status = 'ok' from public.inventory_items where id = :chicken::uuid),
  '... and Mark not cooked puts 1.5 kg back');

-- A dish with no recipe is just marked cooked.
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.cook_menu_dish(%L, '[]'::jsonb, %L) $q$, :dinner, :s1)) = '',
  'a dish with no recipe is just marked cooked (runs)');
select pg_temp.ok((select cooked_at is not null and cooked_uses = '[]'::jsonb from public.menu_dishes where id = :dinner::uuid),
  'a dish with no recipe is just marked cooked');

-- Refusals.
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.cook_menu_dish(%L, '[{"item_id":"%s","amount":1}]'::jsonb, %L) $q$, :lunch, :salt, :s1)) like '%item_not_tracked%',
  'cooking can''t take off an untracked item');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.cook_menu_dish(%L, '[{"item_id":"%s","amount":1}]'::jsonb, %L) $q$, :lunch, :eggs, :s1)) like '%item_not_tracked%'
                  and (select quantity = 10 from public.inventory_items where id = :eggs::uuid),
  '... nor another household''s item');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.cook_menu_dish(%L, '[{"item_id":"%s","amount":0}]'::jsonb, %L) $q$, :lunch, :chicken, :s1)) like '%bad_amount%'
                  and pg_temp.err_as(:p1, format($q$ select public.cook_menu_dish(%L, '[{"item_id":"%s","amount":100001}]'::jsonb, %L) $q$, :lunch, :chicken, :s1)) like '%bad_amount%'
                  and pg_temp.err_as(:p1, format($q$ select public.cook_menu_dish(%L, '[{"item_id":"%s"}]'::jsonb, %L) $q$, :lunch, :chicken, :s1)) like '%bad_amount%',
  'amounts are > 0 and <= 100,000');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.cook_menu_dish(%L, '{"item_id":"x"}'::jsonb, %L) $q$, :lunch, :s1)) like '%bad_uses%',
  'uses must be a list');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.cook_menu_dish(%L, '[]'::jsonb, %L) $q$, :lunch, :s2)) like '%staff_not_in_household%',
  'a removed person''s name is refused');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.cook_menu_dish(%L, '[]'::jsonb, %L) $q$, :lunch, :s9)) like '%staff_not_in_household%',
  '... and another household''s staff');
select pg_temp.ok(pg_temp.err_as(:a9, format($q$ select public.cook_menu_dish(%L, '[]'::jsonb, null) $q$, :lunch)) like '%not_found%'
                  and pg_temp.err_as(:a9, format($q$ select public.uncook_menu_dish(%L) $q$, :dinner)) like '%not_found%',
  'another household''s owner can''t cook or undo the dish');
select pg_temp.ok(pg_temp.err_as(null, format($q$ select public.cook_menu_dish(%L, '[]'::jsonb, null) $q$, :lunch)) like '%permission denied%'
                  and pg_temp.err_as(null, format($q$ select public.uncook_menu_dish(%L) $q$, :dinner)) like '%permission denied%',
  'a logged-out caller can''t call either');
select pg_temp.ok((select cooked_at is null from public.menu_dishes where id = :lunch::uuid)
                  and (select quantity = 1.5 from public.inventory_items where id = :chicken::uuid),
  'none of the refused calls cooked anything or moved the chicken');

-- ---- A unit changed between cooking and Undo (Codex, PR #101) ----------------------------
-- Rice is in kg; cooking takes 0,5 kg and keeps the unit with it.
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.cook_menu_dish(%L, '[{"item_id":"%s","amount":0.5,"unit":"kg"}]'::jsonb, null) $q$, :lunch, :rice)) = '',
  'cooking 0,5 kg of rice (runs)');
select pg_temp.ok((select cooked_uses = '[{"item_id": "00000000-0000-0000-0000-0000000153e2", "amount": 0.5, "unit": "kg"}]'::jsonb from public.menu_dishes where id = :lunch::uuid),
  '... cooked_uses keeps the unit');
-- The owner switches rice to grams: 3,5 kg is 3500 g.
select pg_temp.ok(pg_temp.rows_as(:a1, format($q$ update public.inventory_items set unit = 'g', quantity = 3500 where id = %L $q$, :rice)) = 1,
  'the owner switches rice to grams (3500 g)');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.uncook_menu_dish(%L) $q$, :lunch)) = '',
  'Undo after the unit change (runs)');
select pg_temp.ok((select quantity = 4000 and unit = 'g' from public.inventory_items where id = :rice::uuid),
  '... puts back 500 g, not 0,5 g');
-- Cooking 500 g asked in grams; the owner switches rice to buah; Undo skips it.
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.cook_menu_dish(%L, '[{"item_id":"%s","amount":500,"unit":"g"}]'::jsonb, null) $q$, :lunch, :rice)) = '',
  'cooking 500 g of rice (runs)');
select pg_temp.ok(pg_temp.rows_as(:a1, format($q$ update public.inventory_items set unit = 'buah', quantity = 7 where id = %L $q$, :rice)) = 1,
  'the owner switches rice to buah (7)');
select pg_temp.ok((pg_temp.json_as(:a1, format($q$ select public.uncook_menu_dish(%L) $q$, :lunch)) -> 'skipped' -> 0 ->> 'item_id') = '00000000-0000-0000-0000-0000000153e2',
  'Undo across units that don''t convert skips rice and says so');
select pg_temp.ok((select quantity = 7 and unit = 'buah' from public.inventory_items where id = :rice::uuid)
                  and (select cooked_at is null from public.menu_dishes where id = :lunch::uuid),
  '... rice keeps 7 buah (no wrong number), and the dish is not cooked any more');
-- The phone saw grams; the item is in buah now: cooking refuses rather than guess.
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.cook_menu_dish(%L, '[{"item_id":"%s","amount":500,"unit":"g"}]'::jsonb, null) $q$, :lunch, :rice)) like '%unit_mismatch%',
  'cooking in a unit that no longer converts is refused');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.cook_menu_dish(%L, '[{"item_id":"%s","amount":1,"unit":"buah"},{"item_id":"%s","amount":1,"unit":"pcs"}]'::jsonb, null) $q$, :lunch, :rice, :rice)) like '%unit_mismatch%',
  '... and so is one item in two units');
select pg_temp.ok(pg_temp.rows_as(:a1, format($q$ update public.inventory_items set unit = 'kg', quantity = 4 where id = %L $q$, :rice)) = 1,
  '(rice back to 4 kg)');
select pg_temp.ok(public.convert_kitchen_amount(500, 'g', 'kg') = 0.5 and public.convert_kitchen_amount(1.5, 'L', 'ml') = 1500
                  and public.convert_kitchen_amount(3, 'butir', 'pcs') = 3 and public.convert_kitchen_amount(2, 'ikat', 'ikat') = 2
                  and public.convert_kitchen_amount(1, 'g', 'buah') is null and public.convert_kitchen_amount(1, 'ikat', 'siung') is null,
  'convert_kitchen_amount: exact conversions only (D4)');

-- ---- The shortfall (Add missing to Shopping) ---------------------------------------------
select pg_temp.ok(pg_temp.rows_as(:a1, format($q$ update public.inventory_items set stock_status = 'low', to_buy_amount = 0.5 where id = %L $q$, :chicken)) = 1,
  'Add missing: the owner puts chicken on the list with 500 g to buy (runs)');
select pg_temp.ok((select stock_status = 'low' and to_buy_amount = 0.5 and quantity = 1.5 from public.inventory_items where id = :chicken::uuid),
  'Add missing: the owner puts chicken on the list with 500 g to buy');
select pg_temp.ok(pg_temp.rows_as(:a1, format($q$ update public.inventory_items set stock_status = 'low', to_buy_amount = 1 where id = %L $q$, :salt)) = 1,
  '... and salt (untracked) (runs)');
select pg_temp.ok((select stock_status = 'low' and to_buy_amount = 1 from public.inventory_items where id = :salt::uuid),
  '... and salt (untracked)');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ update public.inventory_items set to_buy_amount = 0 where id = %L $q$, :salt)) like '%inventory_items_to_buy_amount_check%',
  'a shortfall is > 0');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.cook_menu_dish(%L, '[{"item_id":"%s","amount":0.5}]'::jsonb, null) $q$, :lunch, :chicken)) = '',
  'cooking moves the chicken to 1 kg (above its low level) and it stays on the list until bought (runs)');
select pg_temp.ok((select quantity = 1 and stock_status = 'low' and to_buy_amount = 0.5 from public.inventory_items where id = :chicken::uuid),
  'cooking moves the chicken to 1 kg (above its low level) and it stays on the list until bought');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.uncook_menu_dish(%L) $q$, :lunch)) = '',
  '(undone)');
select pg_temp.ok(pg_temp.rows_as(:p1, format($q$ select * from public.record_purchase(%L, 0.5, %L) $q$, :chicken, :s1)) = 1,
  'a staff phone buys 500 g: the shortfall clears (runs)');
select pg_temp.ok((select quantity = 2 and stock_status = 'ok' and to_buy_amount is null from public.inventory_items where id = :chicken::uuid),
  'a staff phone buys 500 g: the shortfall clears');
select pg_temp.ok(pg_temp.rows_as(:p1, format($q$ update public.inventory_items set stock_status = 'ok' where id = %L $q$, :salt)) = 1,
  'a staff tap on Enough clears it too (runs)');
select pg_temp.ok((select to_buy_amount is null from public.inventory_items where id = :salt::uuid),
  'a staff tap on Enough clears it too');
select pg_temp.ok(pg_temp.rows_as(:p1, format($q$ update public.inventory_items set stock_status = 'low', to_buy_amount = 2 where id = %L $q$, :salt)) = 1,
  'to_buy_amount is not owner-only (staff phones may set and clear it)');
-- An owner changes the unit: the shortfall follows it, or goes (Codex, PR #101).
select pg_temp.ok(pg_temp.rows_as(:a1, format($q$ update public.inventory_items set stock_status = 'low', to_buy_amount = 0.5 where id = %L $q$, :chicken)) = 1,
  '(chicken on the list, 0,5 kg to buy)');
select pg_temp.ok(pg_temp.rows_as(:a1, format($q$ update public.inventory_items set unit = 'g', quantity = 2000, min_threshold = 300 where id = %L $q$, :chicken)) = 1,
  'the owner switches chicken to grams (runs)');
select pg_temp.ok((select to_buy_amount = 500 from public.inventory_items where id = :chicken::uuid),
  '... and the shortfall reads 500 g, not 0,5 g');
select pg_temp.ok(pg_temp.rows_as(:a1, format($q$ update public.inventory_items set unit = 'kg', quantity = 2, min_threshold = 0.3, to_buy_amount = 0.75 where id = %L $q$, :chicken)) = 1,
  'back to kg, sending the shortfall too (runs)');
select pg_temp.ok((select to_buy_amount = 0.75 from public.inventory_items where id = :chicken::uuid),
  '... a write that sets the shortfall itself keeps what it sent');
select pg_temp.ok(pg_temp.rows_as(:a1, format($q$ update public.inventory_items set unit = 'buah' where id = %L $q$, :chicken)) = 1,
  'the owner switches chicken to buah (runs)');
select pg_temp.ok((select to_buy_amount is null from public.inventory_items where id = :chicken::uuid),
  '... units that don''t convert clear the shortfall');
select pg_temp.ok(pg_temp.rows_as(:a1, format($q$ update public.inventory_items set unit = 'kg', quantity = 2, stock_status = 'ok' where id = %L $q$, :chicken)) = 1,
  '(chicken back to 2 kg, enough)');

-- ---- Kitchen notes ----------------------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.set_kitchen_notes(%L, '  Tanpa babi. Raka alergi kacang. ', false) $q$, :f1)) = '',
  'an owner saves the kitchen note (trimmed) (runs)');
select pg_temp.ok((select kitchen_notes = 'Tanpa babi. Raka alergi kacang.' and kitchen_notes_confirmed_at is null from public.households where id = :f1::uuid),
  'an owner saves the kitchen note (trimmed)');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.set_kitchen_notes(%L, 'Tanpa babi. Raka alergi kacang.', true) $q$, :f1)) = '',
  '... and the health-data OK is stamped with who and when (runs)');
select pg_temp.ok((select kitchen_notes_confirmed_at is not null and kitchen_notes_confirmed_by = :a1::uuid from public.households where id = :f1::uuid),
  '... and the health-data OK is stamped with who and when');
select pg_temp.ok((select pg_temp.json_as(:a1, format($q$ select public.set_kitchen_notes(%L, 'Tanpa babi.', true) $q$, :f1)) ->> 'kitchen_notes' = 'Tanpa babi.')
                  and (select kitchen_notes_confirmed_by = :a1::uuid from public.households where id = :f1::uuid),
  '... once: a later save keeps the first OK');
select pg_temp.ok(pg_temp.rows_as(:p1, format($q$ select kitchen_notes from public.households where id = %L and kitchen_notes = 'Tanpa babi.' $q$, :f1)) = 1,
  'a staff phone reads the note');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.set_kitchen_notes(%L, 'X', true) $q$, :f1)) like '%admins_only%',
  'a staff phone can''t change it');
select pg_temp.ok(pg_temp.rows_as(:p1, format($q$ update public.households set kitchen_notes = 'X' where id = %L $q$, :f1)) = 0,
  '... nor write the column directly');
select pg_temp.ok(pg_temp.err_as(:a9, format($q$ select public.set_kitchen_notes(%L, 'X', true) $q$, :f1)) like '%admins_only%',
  'another household''s owner can''t change it');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.set_kitchen_notes(%L, repeat('a', 301), true) $q$, :f1)) like '%bad_value%',
  'the note is 300 characters at most');
select pg_temp.ok(pg_temp.err_as(null, format($q$ select public.set_kitchen_notes(%L, 'X', true) $q$, :f1)) like '%permission denied%',
  'a logged-out caller can''t call it');
select pg_temp.ok((select kitchen_notes = 'Tanpa babi.' from public.households where id = :f1::uuid),
  '... so it is untouched');

-- ---- A deleted recipe leaves the dish ---------------------------------------------------
select pg_temp.ok(pg_temp.rows_as(:a1, format($q$ delete from public.recipes where id = %L $q$, :soto)) = 1,
  'deleting the recipe keeps the dish''s title, without the link (runs)');
select pg_temp.ok((select recipe_id is null and title = 'Soto ayam' and household_id = :f1::uuid from public.menu_dishes where id = :lunch::uuid),
  'deleting the recipe keeps the dish''s title, without the link');

-- ---- Export ---------------------------------------------------------------------------
select pg_temp.ok((select jsonb_array_length(j -> 'menu') = 2
                          and j -> 'household' ->> 'kitchen_notes' = 'Tanpa babi.'
                          and j -> 'household' ->> 'kitchen_notes_confirmed_by' = 'one153@test.local'
                          and (j -> 'menu') @> '[{"title": "Nasi goreng", "cooked_by": "Sari"}]'
                          and j -> 'my_notifications' ? 'repair_arrivals'
                          and j -> 'my_notifications' ? 'repair_finished'
                          and j -> 'my_notifications' ? 'staff_requests'
                     from (select pg_temp.json_as(:a1, 'select public.export_household_data()') as j) e),
  'the export includes the menu (who cooked), the kitchen note and the repair push switches');
select pg_temp.ok((select jsonb_array_length(j -> 'menu') = 0 and j -> 'household' ->> 'kitchen_notes' is null
                     from (select pg_temp.json_as(:a9, 'select public.export_household_data()') as j) e),
  '... and not another household''s');
select pg_temp.ok((select j ? 'recipes' and j ? 'food' and j ? 'repair_walk_ins' and j ? 'setup' and j ? 'linked_phones'
                     from (select pg_temp.json_as(:a1, 'select public.export_household_data()') as j) e),
  '... and still everything 151 exported');
select pg_temp.ok(pg_temp.err_as(:p1, 'select public.export_household_data()') like '%admins_only%',
  'a staff phone can''t export');

-- ---- Menu days are kept one year ----------------------------------------------------------
insert into public.menu_dishes (id, household_id, day, meal, title)
values (:other, :f1, current_date - 400, 'lunch', 'Opor ayam');
select pg_temp.ok(public.prune_old_menu_dishes() >= 1,
  'the nightly job deletes menu days older than a year and keeps today''s (runs)');
select pg_temp.ok(not exists (select 1 from public.menu_dishes where id = :other::uuid)
                  and exists (select 1 from public.menu_dishes where id = :lunch::uuid),
  'the nightly job deletes menu days older than a year and keeps today''s');

-- ---- Deleted with the household ----------------------------------------------------------
-- The note lives on the household's own row, and its dishes cascade with it.
update public.households set kitchen_notes = 'Raka alergi kacang.' where id = :f2::uuid;
insert into public.menu_dishes (household_id, day, meal, title) values (:f2, current_date, 'lunch', 'Soto');
delete from public.households where id = :f2::uuid;
select pg_temp.ok(not exists (select 1 from public.households where id = :f2::uuid and kitchen_notes is not null)
                  and not exists (select 1 from public.menu_dishes where household_id = :f2::uuid),
  'deleting a household deletes its kitchen note and its menu');

-- ---- Grants ---------------------------------------------------------------------------
select pg_temp.ok(not has_function_privilege('anon', 'public.cook_menu_dish(uuid, jsonb, uuid)', 'execute')
                  and not has_function_privilege('public', 'public.cook_menu_dish(uuid, jsonb, uuid)', 'execute')
                  and has_function_privilege('authenticated', 'public.cook_menu_dish(uuid, jsonb, uuid)', 'execute')
                  and has_function_privilege('service_role', 'public.cook_menu_dish(uuid, jsonb, uuid)', 'execute'),
  'cook_menu_dish: authenticated and service_role, not public or anon');
select pg_temp.ok(not has_function_privilege('anon', 'public.uncook_menu_dish(uuid)', 'execute')
                  and not has_function_privilege('public', 'public.uncook_menu_dish(uuid)', 'execute')
                  and has_function_privilege('authenticated', 'public.uncook_menu_dish(uuid)', 'execute'),
  'uncook_menu_dish: authenticated, not public or anon');
select pg_temp.ok(not has_function_privilege('anon', 'public.set_kitchen_notes(uuid, text, boolean)', 'execute')
                  and not has_function_privilege('public', 'public.set_kitchen_notes(uuid, text, boolean)', 'execute')
                  and has_function_privilege('authenticated', 'public.set_kitchen_notes(uuid, text, boolean)', 'execute'),
  'set_kitchen_notes: authenticated, not public or anon');
select pg_temp.ok(not has_function_privilege('anon', 'public.convert_kitchen_amount(numeric, text, text)', 'execute')
                  and not has_function_privilege('public', 'public.convert_kitchen_amount(numeric, text, text)', 'execute')
                  and has_function_privilege('authenticated', 'public.convert_kitchen_amount(numeric, text, text)', 'execute')
                  and (select not prosecdef and provolatile = 'i' and proconfig @> array['search_path=""'] from pg_proc where proname = 'convert_kitchen_amount'),
  'convert_kitchen_amount: invoker, immutable, empty search_path; authenticated (the trigger calls it), not anon');
select pg_temp.ok(not has_function_privilege('anon', 'public.prune_old_menu_dishes()', 'execute')
                  and not has_function_privilege('authenticated', 'public.prune_old_menu_dishes()', 'execute')
                  and has_function_privilege('service_role', 'public.prune_old_menu_dishes()', 'execute'),
  'prune_old_menu_dishes: service_role only');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.menu_dishes_server_fields()', 'execute')
                  and not has_function_privilege('anon', 'public.menu_dishes_server_fields()', 'execute')
                  and not has_function_privilege('authenticated', 'public.stamp_inventory_stock_status()', 'execute'),
  'the trigger functions: not callable');
select pg_temp.ok(not has_function_privilege('anon', 'public.record_purchase(uuid, numeric, uuid)', 'execute')
                  and has_function_privilege('authenticated', 'public.record_purchase(uuid, numeric, uuid)', 'execute')
                  and (select prosecdef = false from pg_proc where proname = 'record_purchase'),
  'record_purchase: still security invoker, authenticated, not anon');
select pg_temp.ok((select bool_and(prosecdef and proconfig @> array['search_path=""'])
                     from pg_proc where proname in ('cook_menu_dish', 'uncook_menu_dish', 'set_kitchen_notes', 'prune_old_menu_dishes')),
  'the four new functions: security definer, empty search_path');
select pg_temp.ok(not has_function_privilege('anon', 'public.export_household_data()', 'execute')
                  and has_function_privilege('authenticated', 'public.export_household_data()', 'execute')
                  and (select prosecdef from pg_proc where proname = 'export_household_data'),
  'export_household_data: still security definer, authenticated, not anon');
select pg_temp.ok(not has_table_privilege('anon', 'public.menu_dishes', 'select')
                  and has_table_privilege('authenticated', 'public.menu_dishes', 'select')
                  and (select relrowsecurity from pg_class where oid = 'public.menu_dishes'::regclass),
  'menu_dishes: row level security on, authenticated (RLS decides), never anon');
select pg_temp.ok(not exists (
    select 1 from pg_policies
     where tablename = 'menu_dishes' and cmd <> 'SELECT'
       and coalesce(qual, '') || coalesce(with_check, '') not like '%is_household_admin%'
  ),
  'every write policy on menu_dishes checks is_household_admin');
select pg_temp.ok(exists (select 1 from pg_indexes where tablename = 'menu_dishes' and indexdef like '%(recipe_id, household_id)%')
                  and exists (select 1 from pg_indexes where tablename = 'menu_dishes' and indexdef like '%(cooked_by)%')
                  and exists (select 1 from pg_indexes where tablename = 'households' and indexdef like '%(kitchen_notes_confirmed_by)%'),
  'foreign keys are indexed');

rollback;
