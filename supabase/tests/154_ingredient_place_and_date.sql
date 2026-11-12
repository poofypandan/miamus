-- Migration 154 checks: where an ingredient is kept and when it expires
-- (Phase 176 PR 1). Two nullable columns on inventory_items (kept_in,
-- expires_on); the check refuses a fifth place; a staff phone may move and
-- date an ingredient but still can't add, rename or change tracking; an item
-- that is Out has no date, on both of the amount trigger's exits (INSERT and
-- UPDATE) and on every way to Out (a tap, an amount reaching 0, the stepper
-- RPC, a status written with a date); the trigger's other rules are as 153
-- left them; another household can't read or write them; anon gets nothing;
-- the export carries both columns; grants.
-- LOCAL DATABASE ONLY. One transaction, rolled back. Run after 154 is
-- applied, or with it in the same transaction:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/154_ingredient_place_and_date.sql
-- The 148 and 153 tests still pass after 154 (the trigger's earlier rules).
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
create function pg_temp.item(p uuid) returns public.inventory_items language sql as $$
  select * from public.inventory_items where id = p
$$;

-- ---- Households ----------------------------------------------------------------------
-- f1: owner a1, staff phone p1, staff Sari (s1). f2: owner a9.
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, anon, now(), now()
from (values
  ('00000000-0000-0000-0000-0000000154a1', 'one154@test.local', false),
  ('00000000-0000-0000-0000-0000000154a9', 'nine154@test.local', false),
  ('00000000-0000-0000-0000-0000000154b1', null, true)
) as u(id, email, anon);
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000154f1', 'Rumah Melati', '00000000-0000-0000-0000-0000000154a1'),
  ('00000000-0000-0000-0000-0000000154f2', 'Rumah Kenanga', '00000000-0000-0000-0000-0000000154a9');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000154f1', '00000000-0000-0000-0000-0000000154a1', 'owner'),
  ('00000000-0000-0000-0000-0000000154f2', '00000000-0000-0000-0000-0000000154a9', 'owner');
insert into public.device_sessions (user_id, household_id) values
  ('00000000-0000-0000-0000-0000000154b1', '00000000-0000-0000-0000-0000000154f1');
insert into public.staff_profiles (id, household_id, name, archived_at) values
  ('00000000-0000-0000-0000-0000000154c1', '00000000-0000-0000-0000-0000000154f1', 'Sari', null);
-- Chicken (tracked, 6 pcs, low at 2), rice (untracked), santan (untracked),
-- and another household's eggs (tracked). Added the way an older app adds
-- them: without the two new columns.
insert into public.inventory_items (id, household_id, scope, name, category, quantity, unit, min_threshold, track_amount) values
  ('00000000-0000-0000-0000-0000000154e1', '00000000-0000-0000-0000-0000000154f1', 'home', 'Dada Ayam', 'fresh_food', 6, 'pcs', 2, true),
  ('00000000-0000-0000-0000-0000000154e2', '00000000-0000-0000-0000-0000000154f1', 'home', 'Beras', 'pantry', 0, 'kg', 0, false),
  ('00000000-0000-0000-0000-0000000154e3', '00000000-0000-0000-0000-0000000154f1', 'home', 'Santan', 'pantry', 0, 'pcs', 0, false),
  ('00000000-0000-0000-0000-0000000154e9', '00000000-0000-0000-0000-0000000154f2', 'home', 'Telur', 'fresh_food', 10, 'butir', 0, true);

\set a1 '''00000000-0000-0000-0000-0000000154a1'''
\set a9 '''00000000-0000-0000-0000-0000000154a9'''
\set p1 '''00000000-0000-0000-0000-0000000154b1'''
\set f1 '''00000000-0000-0000-0000-0000000154f1'''
\set s1 '''00000000-0000-0000-0000-0000000154c1'''
\set chicken '''00000000-0000-0000-0000-0000000154e1'''
\set rice '''00000000-0000-0000-0000-0000000154e2'''
\set santan '''00000000-0000-0000-0000-0000000154e3'''
\set eggs '''00000000-0000-0000-0000-0000000154e9'''

-- ---- The columns ----------------------------------------------------------------------
select pg_temp.ok((select count(*) = 2 from information_schema.columns
                    where table_schema = 'public' and table_name = 'inventory_items'
                      and ((column_name = 'kept_in' and data_type = 'text')
                           or (column_name = 'expires_on' and data_type = 'date'))
                      and is_nullable = 'YES' and column_default is null),
  'kept_in (text) and expires_on (date): nullable, no default');
select pg_temp.ok((pg_temp.item(:chicken)).kept_in is null and (pg_temp.item(:chicken)).expires_on is null
                  and (pg_temp.item(:rice)).kept_in is null and (pg_temp.item(:rice)).expires_on is null,
  'an item added without them has neither (nothing is filled in or backfilled)');

-- ---- The four places, and no fifth -----------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ update public.inventory_items set kept_in = 'garage' where id = %L $q$, :chicken)) like '%inventory_items_kept_in_check%',
  'an owner can''t put an ingredient in the garage');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.inventory_items set kept_in = 'Fridge' where id = %L $q$, :chicken)) like '%inventory_items_kept_in_check%',
  '... nor a staff phone, nor in capitals');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ insert into public.inventory_items (household_id, scope, name, category, unit, kept_in) values (%L, 'home', 'Gula', 'pantry', 'kg', 'garage') $q$, :f1)) like '%inventory_items_kept_in_check%',
  '... nor add one there');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ update public.inventory_items set kept_in = 'pantry', expires_on = '2026-12-01' where id = %L $q$, :rice)) = ''
                  and (pg_temp.item(:rice)).kept_in = 'pantry' and (pg_temp.item(:rice)).expires_on = '2026-12-01',
  'an owner sets the place and the date');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ update public.inventory_items set kept_in = null, expires_on = null where id = %L $q$, :rice)) = ''
                  and (pg_temp.item(:rice)).kept_in is null and (pg_temp.item(:rice)).expires_on is null,
  '... and clears both back to "nobody said"');
select pg_temp.ok((select bool_and(pg_temp.err_as(:a1, format($q$ update public.inventory_items set kept_in = %L where id = %L $q$, place, :rice)) = '')
                     from unnest(array['fridge', 'freezer', 'pantry', 'counter']) as place)
                  and (pg_temp.item(:rice)).kept_in = 'counter',
  'each of the four places is accepted');

-- ---- A staff phone moves and dates -------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.inventory_items set kept_in = 'freezer', expires_on = '2026-12-20' where id = %L $q$, :chicken)) = '',
  'a staff phone puts the chicken in the freezer with a date (runs)');
select pg_temp.ok((pg_temp.item(:chicken)).kept_in = 'freezer' and (pg_temp.item(:chicken)).expires_on = '2026-12-20'
                  and (pg_temp.item(:chicken)).quantity = 6 and (pg_temp.item(:chicken)).stock_status = 'ok',
  '... saved, and the amount and status are untouched');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.inventory_items set kept_in = 'fridge' where id = %L $q$, :chicken)) = ''
                  and (pg_temp.item(:chicken)).kept_in = 'fridge' and (pg_temp.item(:chicken)).expires_on = '2026-12-20',
  'moving it alone keeps its date (moving and dating are separate writes)');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.inventory_items set expires_on = '2026-11-14' where id = %L $q$, :chicken)) = ''
                  and (pg_temp.item(:chicken)).kept_in = 'fridge' and (pg_temp.item(:chicken)).expires_on = '2026-11-14',
  'dating it alone keeps its place');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.inventory_items set name = 'Ayam', kept_in = 'counter' where id = %L $q$, :chicken)) like '%inventory_owner_only%'
                  and (pg_temp.item(:chicken)).name = 'Dada Ayam' and (pg_temp.item(:chicken)).kept_in = 'fridge',
  'a staff phone still can''t rename (the whole write is refused, place included)');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.inventory_items set track_amount = false where id = %L $q$, :chicken)) like '%inventory_owner_only%',
  '... nor switch tracking');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.inventory_items set unit = 'kg', min_threshold = 0 where id = %L $q$, :chicken)) like '%inventory_owner_only%',
  '... nor change the unit or the low level');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ insert into public.inventory_items (household_id, scope, name, category, unit, kept_in, expires_on) values (%L, 'home', 'Gula', 'pantry', 'kg', 'pantry', '2027-01-01') $q$, :f1)) like '%inventory_owner_only%',
  '... nor add an ingredient, with a place or without');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ delete from public.inventory_items where id = %L $q$, :chicken)) like '%inventory_owner_only%',
  '... nor delete one');
select pg_temp.ok((select prosrc not like '%kept_in%' and prosrc not like '%expires_on%' and prosecdef
                     from pg_proc where proname = 'inventory_items_owner_guard'),
  'the owner guard is unchanged: the two columns are not in its owner-only list');

-- ---- Another household -------------------------------------------------------------------
select pg_temp.ok(pg_temp.rows_as(:a9, format($q$ select kept_in, expires_on from public.inventory_items where id = %L $q$, :chicken)) = 0,
  'another household''s owner can''t read the place or date');
select pg_temp.ok(pg_temp.rows_as(:a9, format($q$ update public.inventory_items set kept_in = 'counter', expires_on = '2020-01-01' where id = %L $q$, :chicken)) = 0
                  and (pg_temp.item(:chicken)).kept_in = 'fridge' and (pg_temp.item(:chicken)).expires_on = '2026-11-14',
  '... nor write them');
select pg_temp.ok(pg_temp.rows_as(:p1, format($q$ update public.inventory_items set kept_in = 'counter' where id = %L $q$, :eggs)) = 0
                  and (pg_temp.item(:eggs)).kept_in is null,
  '... and a staff phone can''t move another household''s eggs');

-- ---- Out has no date: the UPDATE exit ---------------------------------------------------------
-- Running low keeps the date.
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.inventory_items set stock_status = 'low', stock_status_by = %L where id = %L $q$, :s1, :chicken)) = ''
                  and (pg_temp.item(:chicken)).stock_status = 'low' and (pg_temp.item(:chicken)).expires_on = '2026-11-14',
  'a tap on Running low keeps the date');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.inventory_items set quantity = 1, amount_set_by = %L where id = %L $q$, :s1, :chicken)) = ''
                  and (pg_temp.item(:chicken)).stock_status = 'low' and (pg_temp.item(:chicken)).expires_on = '2026-11-14',
  'an amount down to the low level keeps it too');
-- Tracked, a tap on Out (the trigger's "Out empties it" branch).
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.inventory_items set quantity = 6, amount_set_by = %L where id = %L $q$, :s1, :chicken)) = ''
                  and (pg_temp.item(:chicken)).stock_status = 'ok', '(back to 6: enough)');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.inventory_items set stock_status = 'out', stock_status_by = %L where id = %L $q$, :s1, :chicken)) = '',
  'a tap on Out, tracked item (runs)');
select pg_temp.ok((pg_temp.item(:chicken)).stock_status = 'out' and (pg_temp.item(:chicken)).quantity = 0
                  and (pg_temp.item(:chicken)).expires_on is null and (pg_temp.item(:chicken)).kept_in = 'fridge',
  '... empties it and clears the date; the place stays');
-- Bought again: no date comes back; the place is kept.
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.record_purchase(%L, 4, %L) $q$, :chicken, :s1)) = ''
                  and (pg_temp.item(:chicken)).stock_status = 'ok' and (pg_temp.item(:chicken)).quantity = 4
                  and (pg_temp.item(:chicken)).expires_on is null and (pg_temp.item(:chicken)).kept_in = 'fridge',
  'bought again: still no date, still in the fridge');
-- Tracked, the amount reaching 0 (Set amount).
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.inventory_items set expires_on = '2026-11-20' where id = %L $q$, :chicken)) = ''
                  and (pg_temp.item(:chicken)).expires_on = '2026-11-20', '(dated again)');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.inventory_items set quantity = 0, amount_set_by = %L where id = %L $q$, :s1, :chicken)) = ''
                  and (pg_temp.item(:chicken)).stock_status = 'out' and (pg_temp.item(:chicken)).expires_on is null,
  'Set amount to 0: Out, and the date is cleared');
-- Tracked, the stepper RPC using the last of it (cooking takes off the same way).
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.inventory_items set quantity = 2, expires_on = '2026-11-21', amount_set_by = %L where id = %L $q$, :s1, :chicken)) = ''
                  and (pg_temp.item(:chicken)).expires_on = '2026-11-21' and (pg_temp.item(:chicken)).stock_status = 'low', '(2 left, dated)');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.adjust_inventory_quantity(%L, -2, %L) $q$, :chicken, :s1)) = ''
                  and (pg_temp.item(:chicken)).stock_status = 'out' and (pg_temp.item(:chicken)).quantity = 0
                  and (pg_temp.item(:chicken)).expires_on is null,
  'minus taps to nothing (adjust_inventory_quantity): Out, and the date is cleared');
-- A date sent with Out, or to an item that is Out, doesn't stick.
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.inventory_items set expires_on = '2026-11-30' where id = %L $q$, :chicken)) = ''
                  and (pg_temp.item(:chicken)).expires_on is null,
  'a date set on an item that is Out is not kept');
-- Untracked, a tap on Out (the trigger's final rules).
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.inventory_items set expires_on = '2026-11-25' where id = %L $q$, :santan)) = ''
                  and (pg_temp.item(:santan)).expires_on = '2026-11-25', '(santan dated)');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.inventory_items set stock_status = 'out', stock_status_by = %L where id = %L $q$, :s1, :santan)) = ''
                  and (pg_temp.item(:santan)).stock_status = 'out' and (pg_temp.item(:santan)).expires_on is null,
  'a tap on Out, untracked item: the date is cleared');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.inventory_items set stock_status = 'ok', expires_on = '2026-12-05' where id = %L $q$, :santan)) = ''
                  and (pg_temp.item(:santan)).stock_status = 'ok' and (pg_temp.item(:santan)).expires_on = '2026-12-05',
  'back to Enough with a new date in the same write: the new date is kept');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ update public.inventory_items set stock_status = 'out', expires_on = '2026-12-31' where id = %L $q$, :santan)) = ''
                  and (pg_temp.item(:santan)).expires_on is null,
  'Out written together with a date: no date');

-- ---- Out has no date: the INSERT exit -------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ insert into public.inventory_items (household_id, scope, name, category, quantity, unit, min_threshold, track_amount, kept_in, expires_on) values (%L, 'home', 'Udang', 'fresh_food', 0, 'g', 0, true, 'freezer', '2026-12-01') $q$, :f1)) = '',
  'adding a tracked item with nothing left and a date (runs)');
select pg_temp.ok((select stock_status = 'out' and expires_on is null and kept_in = 'freezer' and amount_set_at is not null
                     from public.inventory_items where name = 'Udang' and household_id = :f1::uuid),
  '... starts Out with no date, in the freezer');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ insert into public.inventory_items (household_id, scope, name, category, unit, stock_status, expires_on) values (%L, 'home', 'Kecap', 'pantry', 'pcs', 'out', '2027-03-01') $q$, :f1)) = '',
  'adding an untracked item as Out with a date (runs)');
select pg_temp.ok((select stock_status = 'out' and expires_on is null
                         from public.inventory_items where name = 'Kecap' and household_id = :f1::uuid),
  '... has no date');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ insert into public.inventory_items (household_id, scope, name, category, quantity, unit, min_threshold, track_amount, kept_in, expires_on) values (%L, 'home', 'Daging sapi', 'fresh_food', 1, 'kg', 0, true, 'freezer', '2026-12-22') $q$, :f1)) = '',
  'adding an item that is there, with a place and a date (runs)');
select pg_temp.ok((select stock_status = 'ok' and expires_on = '2026-12-22' and kept_in = 'freezer'
                         from public.inventory_items where name = 'Daging sapi' and household_id = :f1::uuid),
  '... keeps both');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ insert into public.inventory_items (household_id, scope, name, category, quantity, unit, min_threshold, track_amount, expires_on) values (%L, 'home', 'Tahu', 'fresh_food', 1, 'pcs', 2, true, '2026-11-15') $q$, :f1)) = '',
  'adding one that starts Running low, with a date (runs)');
select pg_temp.ok((select stock_status = 'low' and expires_on = '2026-11-15' and kept_in is null
                         from public.inventory_items where name = 'Tahu' and household_id = :f1::uuid),
  '... keeps its date');

-- ---- The trigger's earlier rules are as 153 left them ----------------------------------------
-- (The full 148 and 153 tests are run after 154 as well.)
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ update public.inventory_items set stock_status = 'low', to_buy_amount = 3 where id = %L $q$, :rice)) = ''
                  and (pg_temp.item(:rice)).to_buy_amount = 3,
  'a shortfall is stored while Running low');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.inventory_items set kept_in = 'pantry', expires_on = '2027-02-01' where id = %L $q$, :rice)) = ''
                  and (pg_temp.item(:rice)).to_buy_amount = 3 and (pg_temp.item(:rice)).stock_status = 'low',
  'moving and dating leave the shortfall and status alone');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.inventory_items set stock_status = 'ok' where id = %L $q$, :rice)) = ''
                  and (pg_temp.item(:rice)).to_buy_amount is null and (pg_temp.item(:rice)).expires_on = '2027-02-01',
  'back to Enough clears the shortfall (153), the date stays');
select pg_temp.ok((select stock_status_at > now() - interval '1 minute' from public.inventory_items where id = :rice::uuid),
  'the status time is still stamped by the server');
-- A move doesn't count as a status change.
alter table public.inventory_items disable trigger inventory_items_stamp_stock_status;
update public.inventory_items set stock_status_at = '2026-01-01', amount_set_at = '2026-01-01' where id = :chicken::uuid;
alter table public.inventory_items enable trigger inventory_items_stamp_stock_status;
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.inventory_items set kept_in = 'freezer' where id = %L $q$, :chicken)) = ''
                  and (pg_temp.item(:chicken)).stock_status_at = '2026-01-01' and (pg_temp.item(:chicken)).amount_set_at = '2026-01-01',
  'a move stamps neither the status time nor the amount time');

-- ---- Export ---------------------------------------------------------------------------
select pg_temp.ok((select (j -> 'supplies') @> jsonb_build_array(jsonb_build_object('name', 'Daging sapi', 'kept_in', 'freezer', 'expires_on', '2026-12-22'))
                          and (select bool_and(s ? 'kept_in' and s ? 'expires_on') from jsonb_array_elements(j -> 'supplies') s)
                     from (select pg_temp.json_as(:a1, 'select public.export_household_data()') as j) e),
  'the export carries every item''s place and date');
select pg_temp.ok((select not (j -> 'supplies') @> '[{"name": "Dada Ayam"}]'
                     from (select pg_temp.json_as(:a9, 'select public.export_household_data()') as j) e),
  '... and not another household''s');

-- ---- anon and grants ---------------------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(null, 'select kept_in, expires_on from public.inventory_items') like '%permission denied%',
  'anon can''t read the place or date');
select pg_temp.ok(pg_temp.err_as(null, format($q$ update public.inventory_items set kept_in = 'fridge' where id = %L $q$, :chicken)) like '%permission denied%',
  '... nor write them');
select pg_temp.ok(not has_table_privilege('anon', 'public.inventory_items', 'select')
                  and not has_table_privilege('anon', 'public.inventory_items', 'update')
                  and not has_table_privilege('anon', 'public.inventory_items', 'insert')
                  and not has_column_privilege('anon', 'public.inventory_items', 'kept_in', 'select')
                  and not has_column_privilege('anon', 'public.inventory_items', 'expires_on', 'update'),
  'anon: no table or column privilege');
select pg_temp.ok((select count(*) = 4 and bool_and(roles = '{authenticated}')
                     from pg_policies where schemaname = 'public' and tablename = 'inventory_items'),
  'inventory_items: still the four tenant policies, authenticated only; no new policy');
select pg_temp.ok((select relrowsecurity from pg_class where oid = 'public.inventory_items'::regclass),
  '... row level security still on');
select pg_temp.ok((select array_agg(tgname::text order by tgname) = array['inventory_items_owner_guard', 'inventory_items_refuse_archived_staff', 'inventory_items_stamp_stock_status']
                     from pg_trigger where tgrelid = 'public.inventory_items'::regclass and not tgisinternal),
  'the same three triggers, in the same (name) order');
select pg_temp.ok((select not prosecdef and proconfig @> array['search_path=""']
                     from pg_proc where proname = 'stamp_inventory_stock_status')
                  and not has_function_privilege('anon', 'public.stamp_inventory_stock_status()', 'execute')
                  and not has_function_privilege('authenticated', 'public.stamp_inventory_stock_status()', 'execute'),
  'stamp_inventory_stock_status: not security definer, empty search_path, not callable');
select pg_temp.ok(not has_function_privilege('anon', 'public.inventory_items_owner_guard()', 'execute')
                  and not has_function_privilege('authenticated', 'public.inventory_items_owner_guard()', 'execute'),
  'inventory_items_owner_guard: still not callable');

rollback;
