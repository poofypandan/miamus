-- Migration 148 checks: kitchen amounts and units (Phase 170 PR A).
-- Tracking is owner-only; a tracked status follows its amount; Running low
-- stays until the amount changes; Out empties; staff change amounts, buy
-- and tap states but never tracking, units or low levels; record_purchase
-- and adjust_inventory_quantity; removed or foreign staff ids refused; the
-- units; portions on food; the Features switch; grants.
-- LOCAL DATABASE ONLY. One transaction, rolled back. Run after 148 is
-- applied, or with it in the same transaction:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/148_kitchen_amounts.sql
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
-- Rows a statement touched as a session (an RLS-hidden row is 0, not an error).
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
create function pg_temp.item(p uuid) returns public.inventory_items language sql as $$
  select * from public.inventory_items where id = p
$$;

-- ---- Households ----------------------------------------------------------------------
-- f1: owner a1, staff phone p1, Sari (s1), removed Dewi (s2). f2: owner a9, Budi (s9).
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, anon, now(), now()
from (values
  ('00000000-0000-0000-0000-0000000148a1', 'one148@test.local', false),
  ('00000000-0000-0000-0000-0000000148a9', 'nine148@test.local', false),
  ('00000000-0000-0000-0000-0000000148b1', null, true)
) as u(id, email, anon);
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000148f1', 'Rumah Melati', '00000000-0000-0000-0000-0000000148a1'),
  ('00000000-0000-0000-0000-0000000148f2', 'Rumah Kenanga', '00000000-0000-0000-0000-0000000148a9');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000148f1', '00000000-0000-0000-0000-0000000148a1', 'owner'),
  ('00000000-0000-0000-0000-0000000148f2', '00000000-0000-0000-0000-0000000148a9', 'owner');
insert into public.device_sessions (user_id, household_id) values
  ('00000000-0000-0000-0000-0000000148b1', '00000000-0000-0000-0000-0000000148f1');
insert into public.staff_profiles (id, household_id, name, archived_at) values
  ('00000000-0000-0000-0000-0000000148c1', '00000000-0000-0000-0000-0000000148f1', 'Sari', null),
  ('00000000-0000-0000-0000-0000000148c2', '00000000-0000-0000-0000-0000000148f1', 'Dewi', now()),
  ('00000000-0000-0000-0000-0000000148c9', '00000000-0000-0000-0000-0000000148f2', 'Budi', null);
-- Rice with a Phase 110 count (2 kg) and the old default low level (2):
-- neither is used when tracking starts (D14). Soap stays untracked.
insert into public.inventory_items (id, household_id, scope, name, category, quantity, unit, min_threshold, last_audited_at) values
  ('00000000-0000-0000-0000-0000000148e1', '00000000-0000-0000-0000-0000000148f1', 'home', 'Beras', 'pantry', 2, 'kg', 2, '2026-10-03'),
  ('00000000-0000-0000-0000-0000000148e2', '00000000-0000-0000-0000-0000000148f1', 'home', 'Sabun', 'household_supplies', 0, 'pcs', 0, null),
  ('00000000-0000-0000-0000-0000000148e9', '00000000-0000-0000-0000-0000000148f2', 'home', 'Telur', 'fresh_food', 0, 'butir', 0, null);

\set a1 '''00000000-0000-0000-0000-0000000148a1'''
\set a9 '''00000000-0000-0000-0000-0000000148a9'''
\set p1 '''00000000-0000-0000-0000-0000000148b1'''
\set f1 '''00000000-0000-0000-0000-0000000148f1'''
\set f2 '''00000000-0000-0000-0000-0000000148f2'''
\set s1 '''00000000-0000-0000-0000-0000000148c1'''
\set s2 '''00000000-0000-0000-0000-0000000148c2'''
\set s9 '''00000000-0000-0000-0000-0000000148c9'''
\set rice '''00000000-0000-0000-0000-0000000148e1'''
\set soap '''00000000-0000-0000-0000-0000000148e2'''
\set eggs '''00000000-0000-0000-0000-0000000148e9'''

-- ---- Untracked: as before ------------------------------------------------------------
select pg_temp.ok((pg_temp.item(:rice)).track_amount = false and (pg_temp.item(:rice)).amount_set_at is null,
  'items start untracked, with no amount time');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.inventory_items set quantity = 0 where id = %L $q$, :rice)) = '', 'an untracked item''s count changes nothing else (status stays, no amount time) (runs)');
select pg_temp.ok((pg_temp.item(:rice)).stock_status = 'ok' and (pg_temp.item(:rice)).amount_set_at is null,
  'an untracked item''s count changes nothing else (status stays, no amount time)');
update public.inventory_items set quantity = 2 where id = :rice::uuid;

-- ---- Staff can't switch tracking, units or low levels (D3) ---------------------------
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.inventory_items set track_amount = true where id = %L $q$, :rice)) like '%inventory_owner_only%',
  'a staff phone can''t switch tracking on');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.inventory_items set unit = 'g' where id = %L $q$, :rice)) like '%inventory_owner_only%',
  '... nor change the unit');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.inventory_items set min_threshold = 1 where id = %L $q$, :rice)) like '%inventory_owner_only%',
  '... nor the low level');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ insert into public.inventory_items (household_id, scope, name, category, unit, track_amount) values (%L, 'home', 'Gula', 'pantry', 'kg', true) $q$, :f1)) like '%inventory_owner_only%',
  '... nor add an item');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ delete from public.inventory_items where id = %L $q$, :rice)) like '%inventory_owner_only%',
  '... nor delete one');

-- ---- The owner switches tracking on --------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ update public.inventory_items set track_amount = true, quantity = 4.5, min_threshold = 1, amount_set_by = %L where id = %L $q$, :s1, :rice)) = '',
  'the owner tracks rice: 4.5 kg, running low at 1');
select pg_temp.ok((pg_temp.item(:rice)).stock_status = 'ok' and (pg_temp.item(:rice)).amount_set_at is not null,
  '... enough, with the amount time stamped');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ update public.inventory_items set amount_set_at = '2020-01-01' where id = %L $q$, :rice)) = '', 'a client''s amount time is ignored (runs)');
select pg_temp.ok((pg_temp.item(:rice)).amount_set_at > now() - interval '1 minute',
  'a client''s amount time is ignored');
-- Back-date it, as if untouched for a while (the server's clock only moves forward).
alter table public.inventory_items disable trigger inventory_items_stamp_stock_status;
update public.inventory_items set amount_set_at = now() - interval '20 days' where id = :rice::uuid;
alter table public.inventory_items enable trigger inventory_items_stamp_stock_status;
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ update public.inventory_items set notes = 'karung 5 kg' where id = %L $q$, :rice)) = '', 'an edit that doesn''t touch the amount keeps its time (runs)');
select pg_temp.ok((pg_temp.item(:rice)).amount_set_at < now() - interval '19 days',
  'an edit that doesn''t touch the amount keeps its time');

-- ---- The status follows the amount ---------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.adjust_inventory_quantity(%L, -3.5, %L) $q$, :rice, :s1)) = '', 'staff minus to 1 kg (the low level): running low (runs)');
select pg_temp.ok((pg_temp.item(:rice)).quantity = 1 and (pg_temp.item(:rice)).stock_status = 'low',
  'staff minus to 1 kg (the low level): running low');
select pg_temp.ok((pg_temp.item(:rice)).stock_status_by = :s1::uuid and (pg_temp.item(:rice)).amount_set_by = :s1::uuid
                  and (pg_temp.item(:rice)).amount_set_at > now() - interval '1 minute',
  '... credited to Sari, with the time');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.adjust_inventory_quantity(%L, -5) $q$, :rice)) = '', 'minus past nothing floors at 0: out (two-argument call still works) (runs)');
select pg_temp.ok((pg_temp.item(:rice)).quantity = 0 and (pg_temp.item(:rice)).stock_status = 'out',
  'minus past nothing floors at 0: out (two-argument call still works)');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.inventory_items set quantity = 3, amount_set_by = %L where id = %L $q$, :s1, :rice)) = '', 'Set amount to 3 kg: enough (runs)');
select pg_temp.ok((pg_temp.item(:rice)).stock_status = 'ok',
  'Set amount to 3 kg: enough');

-- ---- A person's tap ------------------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.inventory_items set stock_status = 'low', stock_status_by = %L where id = %L $q$, :s1, :rice)) = '', 'a tap on Running low keeps the amount (runs)');
select pg_temp.ok((pg_temp.item(:rice)).stock_status = 'low' and (pg_temp.item(:rice)).quantity = 3,
  'a tap on Running low keeps the amount');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ update public.inventory_items set notes = null where id = %L $q$, :rice)) = '', '... and stays while the amount doesn''t change (runs)');
select pg_temp.ok((pg_temp.item(:rice)).stock_status = 'low',
  '... and stays while the amount doesn''t change');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.adjust_inventory_quantity(%L, 0.5, %L) $q$, :rice, :s1)) = '', '... until the amount next changes (runs)');
select pg_temp.ok((pg_temp.item(:rice)).stock_status = 'ok',
  '... until the amount next changes');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.inventory_items set stock_status = 'out', stock_status_by = %L where id = %L $q$, :s1, :rice)) = '', 'a tap on Out empties a tracked item (runs)');
select pg_temp.ok((pg_temp.item(:rice)).quantity = 0 and (pg_temp.item(:rice)).stock_status = 'out',
  'a tap on Out empties a tracked item');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.inventory_items set stock_status = 'out' where id = %L $q$, :soap)) = '', 'untracked items tap as before (runs)');
select pg_temp.ok((pg_temp.item(:soap)).stock_status = 'out',
  'untracked items tap as before');

-- ---- Bought --------------------------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.record_purchase(%L, 5, %L) $q$, :rice, :s1)) = '', 'staff buy 5 kg: added, enough, kept as the pre-fill (runs)');
select pg_temp.ok((pg_temp.item(:rice)).quantity = 5 and (pg_temp.item(:rice)).stock_status = 'ok'
                  and (pg_temp.item(:rice)).last_bought_amount = 5,
  'staff buy 5 kg: added, enough, kept as the pre-fill');
update public.inventory_items set min_threshold = 6 where id = :rice::uuid;
select pg_temp.ok((pg_temp.item(:rice)).stock_status = 'low', 'raising the low level above the amount: running low');
select pg_temp.ok((pg_temp.item(:rice)).stock_status_by is null,
  '... credited to nobody, not to whoever last changed the amount (code review)');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.record_purchase(%L, 0.2, %L) $q$, :rice, :s1)) = '', 'buying too little leaves it running low (runs)');
select pg_temp.ok((pg_temp.item(:rice)).quantity = 5.2 and (pg_temp.item(:rice)).stock_status = 'low',
  'buying too little leaves it running low');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.record_purchase(%L, null, %L) $q$, :rice, :s1)) = '', 'Skip amount: enough, the amount and pre-fill unchanged (runs)');
select pg_temp.ok((pg_temp.item(:rice)).quantity = 5.2 and (pg_temp.item(:rice)).stock_status = 'ok'
                  and (pg_temp.item(:rice)).last_bought_amount = 0.2,
  'Skip amount: enough, the amount and pre-fill unchanged');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.record_purchase(%L, 3, %L) $q$, :soap, :s1)) = '', 'buying an untracked item only sets enough (runs)');
select pg_temp.ok((pg_temp.item(:soap)).quantity = 0 and (pg_temp.item(:soap)).stock_status = 'ok'
                  and (pg_temp.item(:soap)).last_bought_amount is null,
  'buying an untracked item only sets enough');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.record_purchase(%L, 0, %L) $q$, :rice, :s1)) like '%bad_amount%',
  'a purchase of 0 is refused');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.record_purchase(%L, -1) $q$, :rice)) like '%bad_amount%',
  '... and a negative one');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.record_purchase(%L, 100001) $q$, :rice)) like '%bad_amount%',
  '... and one over 100,000');
-- The Undo: the amount back off, the status and pre-fill as they were.
select pg_temp.ok((select quantity from public.record_purchase(:rice, 2, :s1)) = 7.2, 'buy 2 kg more (7.2 kg)');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.adjust_inventory_quantity(%L, -2, %L); update public.inventory_items set stock_status = 'ok', last_bought_amount = 0.2 where id = %L $q$, :rice, :s1, :rice)) = '', 'a staff phone undoes a purchase: amount and pre-fill back (runs)');
select pg_temp.ok((pg_temp.item(:rice)).quantity = 5.2 and (pg_temp.item(:rice)).last_bought_amount = 0.2,
  'a staff phone undoes a purchase: amount and pre-fill back');

-- ---- People, households, logged-out callers ------------------------------------------
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.adjust_inventory_quantity(%L, 1, %L) $q$, :rice, :s2)) like '%staff_archived%',
  'a removed staff member''s id is refused on an amount');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.record_purchase(%L, 1, %L) $q$, :rice, :s2)) like '%staff_archived%',
  '... and on a purchase');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ update public.inventory_items set quantity = 1, amount_set_by = %L where id = %L $q$, :s9, :rice)) like '%staff_not_in_household%',
  'another household''s staff id is refused');
select pg_temp.ok(pg_temp.rows_as(:p1, format($q$ select public.adjust_inventory_quantity(%L, 1) $q$, :eggs)) = 0, 'a staff phone can''t change another household''s item (RLS hides it) (runs)');
select pg_temp.ok((pg_temp.item(:eggs)).quantity = 0,
  'a staff phone can''t change another household''s item (RLS hides it)');
select pg_temp.ok(pg_temp.rows_as(:a9, format($q$ update public.inventory_items set track_amount = true, quantity = 9 where id = %L $q$, :rice)) = 0, 'another household''s owner can''t either (runs)');
select pg_temp.ok((pg_temp.item(:rice)).quantity = 5.2,
  'another household''s owner can''t either');
select pg_temp.ok(pg_temp.err_as(null, format($q$ select public.record_purchase(%L, 1) $q$, :rice)) like '%permission denied%',
  'a logged-out caller can''t buy');
select pg_temp.ok(pg_temp.err_as(null, format($q$ select public.adjust_inventory_quantity(%L, 1) $q$, :rice)) like '%permission denied%',
  '... nor adjust');

-- ---- Turning tracking off ------------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ update public.inventory_items set track_amount = false where id = %L $q$, :rice)) = '', 'tracking off keeps the numbers and the status (runs)');
select pg_temp.ok((pg_temp.item(:rice)).quantity = 5.2 and (pg_temp.item(:rice)).stock_status = 'ok',
  'tracking off keeps the numbers and the status');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ update public.inventory_items set stock_status = 'out' where id = %L $q$, :rice)) = '', '... and Out no longer empties it (runs)');
select pg_temp.ok((pg_temp.item(:rice)).quantity = 5.2,
  '... and Out no longer empties it');

-- ---- Units ---------------------------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ update public.inventory_items set unit = u from (values ('buah'), ('butir'), ('ikat'), ('siung'), ('lembar'), ('batang'), ('bungkus'), ('sachet'), ('kg')) v(u) where id = %L $q$, :rice)) = '',
  'the new kitchen units are accepted');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ update public.inventory_items set unit = 'sdm' where id = %L $q$, :rice)) like '%inventory_items_unit_check%',
  'sdm is recipe-only, refused on stock');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ update public.inventory_items set last_bought_amount = 0 where id = %L $q$, :rice)) like '%last_bought_amount_check%',
  'a pre-fill of 0 is refused');

-- ---- A new item tracked from the start ------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ insert into public.inventory_items (household_id, scope, name, category, unit, quantity, min_threshold, track_amount) values (%L, 'home', 'Minyak', 'pantry', 'L', 0.4, 0.5, true) $q$, :f1)) = '',
  'the owner adds an item tracked from the start');
select pg_temp.ok((select stock_status = 'low' and amount_set_at is not null from public.inventory_items where name = 'Minyak' and household_id = :f1::uuid),
  'an item added tracked starts with its status derived and its time stamped');

-- ---- Portions on food (D7) -----------------------------------------------------------
insert into public.food_items (id, household_id, name, kept_in)
values ('00000000-0000-0000-0000-0000000148d1', :f1, 'Rendang', 'fridge');
select pg_temp.ok(pg_temp.err_as(:p1, $q$ update public.food_items set portions = 3 where id = '00000000-0000-0000-0000-0000000148d1' $q$) = '',
  'a staff phone sets portions on food');
select pg_temp.ok(pg_temp.err_as(:p1, $q$ update public.food_items set portions = 100 where id = '00000000-0000-0000-0000-0000000148d1' $q$) like '%food_items_portions_check%',
  '... up to 99');

-- ---- Ate 1 portion: relative, retry-safe (Codex, PR #93) -----------------------------
\set rendang '''00000000-0000-0000-0000-0000000148d1'''
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.eat_food_portion(%L, 1, '00000000-0000-0000-0000-00000148a001', %L) $q$, :rendang, :s1)) = '',
  'a staff phone eats one portion');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.eat_food_portion(%L, 1, '00000000-0000-0000-0000-00000148a002') $q$, :rendang)) = '',
  'an owner eats another, from a phone that still showed 3');
select pg_temp.ok((select portions from public.food_items where id = :rendang::uuid) = 1,
  'two taps at once take two portions: 3 → 1, none lost');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.eat_food_portion(%L, 1, '00000000-0000-0000-0000-00000148a001', %L) $q$, :rendang, :s1)) = '',
  'the first tap is retried after a lost answer (same op id)');
select pg_temp.ok((select portions = 1 and outcome is null from public.food_items where id = :rendang::uuid),
  '... and changes nothing');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.eat_food_portion(%L, 1, '00000000-0000-0000-0000-00000148a003', %L) $q$, :rendang, :s1)) = '',
  'the last portion is eaten');
select pg_temp.ok((select portions = 0 and outcome = 'eaten' and finished_by = :s1::uuid and finished_at is not null
                     from public.food_items where id = :rendang::uuid),
  '... and the food is finished as Eaten, by Sari');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.eat_food_portion(%L, 1, '00000000-0000-0000-0000-00000148a004') $q$, :rendang)) = ''
                  , 'a late tap on finished food runs');
select pg_temp.ok((select portions from public.food_items where id = :rendang::uuid) = 0,
  '... and takes nothing below 0');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.eat_food_portion(%L, -1, '00000000-0000-0000-0000-00000148a005', %L) $q$, :rendang, :s1)) = '',
  'Undo of the last portion');
select pg_temp.ok((select portions = 1 and outcome is null and finished_at is null and finished_by is null
                     from public.food_items where id = :rendang::uuid),
  '... brings the food back with 1 portion');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.eat_food_portion(%L, 0, '00000000-0000-0000-0000-00000148a006') $q$, :rendang)) like '%bad_value%',
  'a count of 0 is refused');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.eat_food_portion(%L, 1, null) $q$, :rendang)) like '%bad_value%',
  '... and a tap with no op id');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.eat_food_portion(%L, 1, '00000000-0000-0000-0000-00000148a007', %L) $q$, :rendang, :s2)) like '%staff_not_in_household%',
  'a removed staff member''s id is refused');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.eat_food_portion(%L, 1, '00000000-0000-0000-0000-00000148a008', %L) $q$, :rendang, :s9)) like '%staff_not_in_household%',
  '... and another household''s');
select pg_temp.ok(pg_temp.err_as(:a9, format($q$ select public.eat_food_portion(%L, 1, '00000000-0000-0000-0000-00000148a009') $q$, :rendang)) like '%not_found%',
  'another household''s owner can''t eat this household''s food');
select pg_temp.ok(pg_temp.err_as(null, format($q$ select public.eat_food_portion(%L, 1, '00000000-0000-0000-0000-00000148a010') $q$, :rendang)) like '%permission denied%',
  'a logged-out caller can''t call it');
select pg_temp.ok((select portions from public.food_items where id = :rendang::uuid) = 1,
  'none of the refused calls changed anything');
select pg_temp.ok(pg_temp.err_as(:p1, $q$ select count(*) from public.food_portion_ops $q$) like '%permission denied%',
  'the op ids are not readable by sessions');
select pg_temp.ok(not has_function_privilege('anon', 'public.eat_food_portion(uuid, int, uuid, uuid)', 'execute')
                  and has_function_privilege('authenticated', 'public.eat_food_portion(uuid, int, uuid, uuid)', 'execute')
                  and (select prosecdef from pg_proc where proname = 'eat_food_portion'),
  'eat_food_portion: security definer, authenticated, not anon');

-- ---- The Features switch -------------------------------------------------------------
select pg_temp.ok((public.household_feature_defaults() ->> 'kitchen')::boolean = false,
  'Kitchen amounts defaults off for new households');
select pg_temp.ok(not public.household_feature_on(:f1, 'kitchen'),
  '... so a household created after 148 starts off');
select pg_temp.ok(pg_temp.err_as(:a1, format($q$ select public.set_household_feature(%L, 'kitchen', true) $q$, :f1)) = '', 'an owner switches it on (runs)');
select pg_temp.ok(public.household_feature_on(:f1, 'kitchen'),
  'an owner switches it on');
select pg_temp.ok(pg_temp.err_as(:p1, format($q$ select public.set_household_feature(%L, 'kitchen', false) $q$, :f1)) like '%not_admin%',
  'a staff phone can''t switch it');
select pg_temp.ok(not exists (
    select 1 from public.households h
     where h.created_at < (select min(created_at) from public.households where id in (:f1, :f2))
       and h.id not in (select household_id from public.household_features where feature = 'kitchen' and enabled)
  ),
  'every household that existed when 148 ran has it on');

-- ---- Grants --------------------------------------------------------------------------
select pg_temp.ok(not has_function_privilege('anon', 'public.adjust_inventory_quantity(uuid, numeric, uuid)', 'execute')
                  and has_function_privilege('authenticated', 'public.adjust_inventory_quantity(uuid, numeric, uuid)', 'execute')
                  and has_function_privilege('service_role', 'public.adjust_inventory_quantity(uuid, numeric, uuid)', 'execute'),
  'adjust_inventory_quantity: authenticated and service_role, not anon');
select pg_temp.ok(not has_function_privilege('anon', 'public.record_purchase(uuid, numeric, uuid)', 'execute')
                  and has_function_privilege('authenticated', 'public.record_purchase(uuid, numeric, uuid)', 'execute')
                  and has_function_privilege('service_role', 'public.record_purchase(uuid, numeric, uuid)', 'execute'),
  'record_purchase: authenticated and service_role, not anon');
select pg_temp.ok(not exists (select 1 from pg_proc where proname = 'adjust_inventory_quantity' and pronargs = 2),
  'the two-argument overload is gone (no ambiguity)');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.inventory_items_owner_guard()', 'execute')
                  and not has_function_privilege('anon', 'public.inventory_items_owner_guard()', 'execute'),
  'the guard: service_role only');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.stamp_inventory_stock_status()', 'execute')
                  and not has_function_privilege('authenticated', 'public.refuse_archived_staff_on_stock()', 'execute'),
  'the trigger functions: not callable');
select pg_temp.ok((select prosecdef = false from pg_proc where proname = 'record_purchase')
                  and (select prosecdef = false from pg_proc where proname = 'adjust_inventory_quantity'),
  'record_purchase and adjust_inventory_quantity are security invoker');
select pg_temp.ok(not has_function_privilege('anon', 'public.household_feature_defaults()', 'execute'),
  'household_feature_defaults: not anon');

rollback;
