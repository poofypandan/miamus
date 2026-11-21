-- Household isolation (security audit, 20 Nov 2026).
--
-- Two households, A and B, each with an admin (a Google account) and a staff
-- phone (an anonymous session linked with a PIN). Every table, every storage
-- bucket and every function a client can call is tried across households, as
-- A's admin and as A's staff phone: reading B's rows, changing them, deleting
-- them, adding rows to B, moving A's rows into B, and pointing A's rows at B's
-- people, pets and routines. Every one must fail.
--
-- Positive controls make sure the test can see a leak: B's own admin (or
-- phone) does see each of B's rows, so a 0 from A means "refused", not
-- "nothing there".
--
-- New tables are covered automatically (the loops walk the catalogue). A new
-- table without household_id needs a line in pg_temp.scope below, or the
-- test fails and says so.
--
-- LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/177_household_isolation.sql
\set ON_ERROR_STOP on
\pset footer off
begin;

create function pg_temp.ok(cond boolean, label text) returns text language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  return 'ok  ' || label;
end $$;

-- Runs a statement as a session and always rolls it back. Returns
-- {state, msg} on an error, or {state: '', n: rows touched, v: first value}.
create function pg_temp.try_as(uid uuid, stmt text) returns jsonb language plpgsql as $$
declare
  n bigint;
  v text;
  result jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    if stmt ~* '^\s*(select|with)' then
      execute stmt into v;
      n := null;
    else
      execute stmt;
      get diagnostics n = row_count;
    end if;
    -- Undo whatever it did, success or not.
    raise exception using errcode = 'P0177', message = jsonb_build_object('n', n, 'v', v)::text;
  exception when others then
    if sqlstate = 'P0177' then
      result := jsonb_build_object('state', '') || sqlerrm::jsonb;
    else
      result := jsonb_build_object('state', sqlstate, 'msg', sqlerrm);
    end if;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return result;
end $$;

-- Refused: an RLS / privilege error, or nothing touched / nothing seen.
create function pg_temp.refused(r jsonb) returns boolean language sql as $$
  select r->>'state' = '42501'
      or (r->>'state' = '' and coalesce(r->>'n', '0') = '0' and coalesce(r->>'v', '0') in ('0', 'false', '[]', '{}', ''))
$$;

-- Refused by an error from the database, whatever the cause (a guard, RLS, a
-- missing grant). Used for inserts, where touching 0 rows is not possible.
create function pg_temp.errored(r jsonb) returns boolean language sql as $$
  select coalesce(r->>'state', '') not in ('')
$$;

create function pg_temp.url(path text) returns text language sql immutable as $$
  select 'https://iso177.supabase.co/storage/v1/object/public/household-logs/' || path
$$;

create function pg_temp.id(tag text, n int) returns uuid language sql immutable as $$
  select format('00000000-0000-0000-0177-0000000%s%s', tag, lpad(n::text, 4, '0'))::uuid
$$;

-- ---- Two households, the same shape -----------------------------------------------------
create function pg_temp.seed(t text) returns void language plpgsql as $$
declare
  hh uuid := pg_temp.id(t, 1);
  admin uuid := pg_temp.id(t, 2);
  phone uuid := pg_temp.id(t, 3);
  staff uuid := pg_temp.id(t, 4);
  pet uuid := pg_temp.id(t, 5);
begin
  insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at) values
    (admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-' || t || '@iso177.test', false, now(), now()),
    (phone, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now(), now());
  insert into public.households (id, name, owner_auth_id) values (hh, 'Rumah ' || upper(t), admin);
  insert into public.household_members (household_id, user_id, role) values (hh, admin, 'owner');
  insert into public.household_access_requests (user_id, status, decided_at) values (admin, 'approved', now());
  insert into public.user_preferences (user_id, locale) values (admin, 'en');
  insert into public.staff_profiles (id, household_id, name, pin, has_pin)
  values (staff, hh, 'Staf ' || upper(t), extensions.crypt('1234', extensions.gen_salt('bf')), true);
  insert into public.device_sessions (id, user_id, household_id, staff_id) values (pg_temp.id(t, 35), phone, hh, staff);
  -- Someone who left: what restore_staff_profile brings back.
  insert into public.staff_profiles (id, household_id, name, archived_at) values (pg_temp.id(t, 38), hh, 'Mantan ' || upper(t), now());

  insert into public.task_entities (id, household_id, entity_type, name) values (pet, hh, 'pet', 'Anjing ' || upper(t));
  insert into public.master_schedules (id, entity_id, title, module, frequency_type, fixed_times, proof)
  values (pg_temp.id(t, 6), pet, 'Makan', 'pet', 'fixed_time', '{08:00}', 'photo');
  insert into public.task_logs (id, schedule_id, entity_id, module, staff_id, photo_url)
  values (pg_temp.id(t, 7), pg_temp.id(t, 6), pet, 'pet', staff, pg_temp.url(hh::text || '/pets/proof.webp'));
  insert into public.medical_records (id, entity_id, record_type, title) values (pg_temp.id(t, 8), pet, 'vet', 'Kontrol');
  insert into public.routine_proposals (id, pet_id, title, category, time, staff_id)
  values (pg_temp.id(t, 9), pet, 'Makan siang', 'meal', '12:00', staff);

  insert into public.inventory_items (id, household_id, name, category, scope) values (pg_temp.id(t, 10), hh, 'Beras', 'pantry', 'home');
  insert into public.inventory_audit_logs (id, item_id, audited_by) values (pg_temp.id(t, 30), pg_temp.id(t, 10), staff);
  insert into public.inventory_alerts (id, household_id, item_type) values (pg_temp.id(t, 11), hh, 'Sabun');

  insert into public.household_locations (id, household_id, name) values (pg_temp.id(t, 12), hh, 'Dapur');
  insert into public.household_tasks (id, household_id, title, location_id, assigned_to)
  values (pg_temp.id(t, 13), hh, 'Sapu lantai', pg_temp.id(t, 12), staff);
  insert into public.household_tasks (id, household_id, title, category, status, before_photo_url, after_photo_url)
  values (pg_temp.id(t, 14), hh, 'Listrik', 'bill', 'completed', pg_temp.url(hh::text || '/bills/before.webp'), pg_temp.url(hh::text || '/bills/after.webp'));
  insert into public.bill_payments (id, household_id, task_id, amount_idr) values (pg_temp.id(t, 15), hh, pg_temp.id(t, 14), 500000);

  insert into public.repairs (id, household_id, title) values (pg_temp.id(t, 16), hh, 'Keran bocor');
  insert into public.repair_costs (repair_id, household_id, amount_idr) values (pg_temp.id(t, 16), hh, 250000);
  insert into public.repair_notes (id, household_id, repair_id, body) values (pg_temp.id(t, 17), hh, pg_temp.id(t, 16), 'Tukang datang besok');
  insert into public.repair_visits (id, household_id, repair_id, before_photo_url)
  values (pg_temp.id(t, 18), hh, pg_temp.id(t, 16), pg_temp.url(hh::text || '/repairs/before.webp'));
  insert into public.repair_supervision (id, household_id, visit_id, staff_id) values (pg_temp.id(t, 32), hh, pg_temp.id(t, 18), staff);
  insert into public.repair_visit_push_sent (visit_id, household_id, push) values (pg_temp.id(t, 18), hh, 'arrival');

  insert into public.food_items (id, household_id, name) values (pg_temp.id(t, 19), hh, 'Rendang');
  insert into public.food_portion_ops (op_id, food_id, household_id) values (pg_temp.id(t, 31), pg_temp.id(t, 19), hh);
  insert into public.recipes (id, household_id, name) values (pg_temp.id(t, 20), hh, 'Nasi goreng');
  insert into public.recipe_ingredients (id, household_id, recipe_id, name) values (pg_temp.id(t, 21), hh, pg_temp.id(t, 20), 'Telur');
  insert into public.menu_dishes (id, household_id, day, meal, title) values (pg_temp.id(t, 22), hh, current_date, 'lunch', 'Nasi goreng');

  insert into public.leave_requests (id, household_id, staff_id, start_date, end_date, status, fallback_action)
  values (pg_temp.id(t, 23), hh, staff, current_date - 1, current_date + 1, 'approved', 'unassign');
  insert into public.task_exceptions (id, household_id, occurs_on, reason, note, chore_id, staff_id)
  values (pg_temp.id(t, 24), hh, current_date, 'other', 'Hujan', pg_temp.id(t, 13), staff);
  insert into public.feedback (id, household_id, message, staff_id) values (pg_temp.id(t, 25), hh, 'Bagus', staff);

  insert into public.household_features (household_id, feature, enabled) values (hh, 'repairs', true);
  insert into public.kakak_settings (household_id, allowed, enabled) values (hh, true, true);
  insert into public.kakak_requests (id, household_id, user_id) values (pg_temp.id(t, 26), hh, admin);
  insert into public.kakak_usage (household_id, day, calls) values (hh, (now() at time zone 'Asia/Jakarta')::date, 1);
  insert into public.kakak_voice_holds (id, household_id, day, chars) values (pg_temp.id(t, 33), hh, (now() at time zone 'Asia/Jakarta')::date, 10);
  insert into public.owner_invites (id, household_id, token, expires_at) values (pg_temp.id(t, 27), hh, 'owner-invite-177' || t, now() + interval '1 day');
  insert into public.staff_invites (id, household_id, token, expires_at) values (pg_temp.id(t, 28), hh, 'staff-invite-177' || t, now() + interval '1 day');
  insert into public.staff_claim_links (token, household_id) values (case t when 'a' then 'AAAAAAAA77' else 'BBBBBBBB77' end, hh);
  insert into public.push_subscriptions (id, user_id, household_id, subscription)
  values (pg_temp.id(t, 29), admin, hh, jsonb_build_object('endpoint', 'https://fcm.googleapis.com/fcm/send/iso177' || t,
                                                           'keys', jsonb_build_object('p256dh', 'k', 'auth', 'a')));
  insert into public.staff_push_people (device_user_id, staff_id, household_id) values (phone, staff, hh);
  insert into public.staff_sign_in_attempts (user_id, household_id, staff_id, kind, success) values
    (phone, hh, staff, 'pin', true),
    -- A claim the claim functions can find: the person claimed their name
    -- on this phone today (staff_claims_today, undo_staff_claim).
    (phone, hh, staff, 'claim', true);
  -- The phone's own push subscription: what makes its staff member a push
  -- target (staff_will_be_notified).
  insert into public.push_subscriptions (id, user_id, household_id, subscription)
  values (pg_temp.id(t, 36), phone, hh, jsonb_build_object('endpoint', 'https://fcm.googleapis.com/fcm/send/iso177phone' || t,
                                                           'keys', jsonb_build_object('p256dh', 'k', 'auth', 'a')));

  insert into public.household_setup (household_id) values (hh);
  insert into public.north_star_days (day, household_id, due, closed) values (current_date - 1, hh, 1, 1);
  insert into public.routine_push_sent (schedule_id, occurs_on, slot_time, push, household_id)
  values (pg_temp.id(t, 6), current_date, '08:00', 'staff_reminder', hh);
  insert into public.household_deletions (household_id, requested_by, delete_after) values (hh, admin, now() + interval '7 days');
  insert into public.account_deletions (user_id) values (admin);

  -- One photo in each bucket, under the household's folder.
  insert into storage.objects (bucket_id, name, owner, owner_id) values
    ('household-logs', hh::text || '/pets/proof.webp', phone, phone::text),
    ('inventory_audits', hh::text || '/stock/shelf.webp', phone, phone::text),
    ('owner-receipts', hh::text || '/repairs/receipt.webp', admin, admin::text);
end $$;

select pg_temp.seed('a');
select pg_temp.seed('b');

-- A dish of B's cooked a minute ago, for the un-cook and change probes
-- (written as an old row: cooking goes through functions only).
set local session_replication_role = replica;
insert into public.menu_dishes (id, household_id, day, meal, title, cooked_at, cooked_uses)
values (pg_temp.id('b', 34), pg_temp.id('b', 1), current_date, 'dinner', 'Soto', now() - interval '1 minute', '[]');
set local session_replication_role = origin;

-- Household C: a household nobody here belongs to, holding only what a
-- "move A's rows to another household" probe needs to point at (a pet, an
-- item, an account). Empty otherwise, so a move can never be refused by
-- colliding with an existing row instead of by isolation (Codex, PR #158).
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at) values
  (pg_temp.id('c', 2), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-c@iso177.test', false, now(), now()),
  (pg_temp.id('c', 9), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operator@iso177.test', false, now(), now());
insert into public.households (id, name, owner_auth_id) values (pg_temp.id('c', 1), 'Rumah C', pg_temp.id('c', 2));
insert into public.task_entities (id, household_id, entity_type, name) values (pg_temp.id('c', 5), pg_temp.id('c', 1), 'pet', 'Kucing C');
insert into public.inventory_items (id, household_id, name, category, scope) values (pg_temp.id('c', 10), pg_temp.id('c', 1), 'Gula C', 'pantry', 'home');

-- Service-wide tables hold a row, so an empty read proves a refusal.
insert into public.platform_admins (user_id) values (pg_temp.id('c', 9));
insert into public.north_star_recorded_days (day) values (date '2001-01-01') on conflict do nothing;

-- Quiet hours (21.00-06.00 WIB) would empty staff_will_be_notified whatever
-- the household: off for this test (rolled back with it).
create or replace function public.staff_push_quiet(p_now timestamptz default null) returns boolean
language sql stable set search_path = '' as $$ select false $$;

\set hA '''00000000-0000-0000-0177-0000000a0001'''
\set adminA '''00000000-0000-0000-0177-0000000a0002'''
\set phoneA '''00000000-0000-0000-0177-0000000a0003'''
\set hB '''00000000-0000-0000-0177-0000000b0001'''
\set adminB '''00000000-0000-0000-0177-0000000b0002'''
\set phoneB '''00000000-0000-0000-0177-0000000b0003'''
\set hC '''00000000-0000-0000-0177-0000000c0001'''

-- ---- Which rows are B's, for every table ---------------------------------------------------
-- key: the column that names the household (or the thing that does);
-- a/b: its value for A and for B. Tables with household_id need no line.
create temp table scope (tbl text primary key, key text, a uuid, b uuid, c uuid);
insert into pg_temp.scope
select c.table_name, 'household_id', :hA::uuid, :hB::uuid, :hC::uuid
  from information_schema.columns c
  join pg_tables t on t.schemaname = 'public' and t.tablename = c.table_name
 where c.table_schema = 'public' and c.column_name = 'household_id';
insert into pg_temp.scope values
  ('households', 'id', :hA, :hB, :hC),
  ('household_access_requests', 'user_id', :adminA, :adminB, pg_temp.id('c', 2)),
  ('user_preferences', 'user_id', :adminA, :adminB, pg_temp.id('c', 2)),
  ('account_deletions', 'user_id', :adminA, :adminB, pg_temp.id('c', 2)),
  ('task_logs', 'entity_id', pg_temp.id('a', 5), pg_temp.id('b', 5), pg_temp.id('c', 5)),
  ('master_schedules', 'entity_id', pg_temp.id('a', 5), pg_temp.id('b', 5), pg_temp.id('c', 5)),
  ('medical_records', 'entity_id', pg_temp.id('a', 5), pg_temp.id('b', 5), pg_temp.id('c', 5)),
  ('routine_proposals', 'pet_id', pg_temp.id('a', 5), pg_temp.id('b', 5), pg_temp.id('c', 5)),
  ('inventory_audit_logs', 'item_id', pg_temp.id('a', 10), pg_temp.id('b', 10), pg_temp.id('c', 10)),
  -- Settings for the whole service, no household's: no client may read them.
  ('kakak_config', null, null, null, null),
  ('signup_config', null, null, null, null),
  ('north_star_recorded_days', null, null, null, null),
  -- Who runs Miamus: no household's, and no client reads it.
  ('platform_admins', null, null, null, null);

select pg_temp.ok(not exists (
  select 1 from pg_tables t where t.schemaname = 'public'
     and not exists (select 1 from pg_temp.scope s where s.tbl = t.tablename)
), 'every public table is in scope (a new table without household_id needs a line in pg_temp.scope)');

-- Every table holds a row of B's to find (the seed above is complete).
do $$
declare s record; n bigint;
begin
  for s in select * from pg_temp.scope where key is not null loop
    execute format('select count(*) from public.%I where %I = %L', s.tbl, s.key, s.b) into n;
    if n = 0 then raise exception 'FAIL: the seed has no row of B''s in %', s.tbl; end if;
  end loop;
end $$;
select pg_temp.ok(true, 'the seed holds a row of B''s in every household table');
select pg_temp.ok((select count(*) from public.kakak_config) > 0 and (select count(*) from public.signup_config) > 0
                  and (select count(*) from public.north_star_recorded_days) > 0 and (select count(*) from public.platform_admins) > 0,
  'every service-wide table holds a row (so a client''s empty read is a refusal)');

-- Copies of B's rows (new ids) and of A's rows moved to B, for the insert
-- attacks: every column a client could send, generated ones left out.
create function pg_temp.insertable_columns(tbl text) returns text language sql stable as $$
  select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position)
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = tbl
     and c.is_generated = 'NEVER' and coalesce(c.identity_generation, '') <> 'ALWAYS'
$$;
do $$
declare s record; has_id boolean;
begin
  for s in select * from pg_temp.scope where key is not null loop
    has_id := exists (select 1 from information_schema.columns c where c.table_schema = 'public'
                        and c.table_name = s.tbl and c.column_name = 'id' and c.data_type = 'uuid');
    execute format('create temp table %I as select %s from public.%I where %I = %L limit 1',
                   'b_' || s.tbl, pg_temp.insertable_columns(s.tbl), s.tbl, s.key, s.b);
    execute format('create temp table %I as select %s from public.%I where %I = %L limit 1',
                   'a2b_' || s.tbl, pg_temp.insertable_columns(s.tbl), s.tbl, s.key, s.a);
    execute format('update %I set %I = %L', 'a2b_' || s.tbl, s.key, s.b);
    if has_id then
      execute format('update %I set id = gen_random_uuid()', 'b_' || s.tbl);
      execute format('update %I set id = gen_random_uuid()', 'a2b_' || s.tbl);
    end if;
    execute format('grant select on %I to authenticated', 'b_' || s.tbl);
    execute format('grant select on %I to authenticated', 'a2b_' || s.tbl);
  end loop;
end $$;

-- ---- Positive controls: B sees its own rows ------------------------------------------------
do $$
declare s record; r jsonb; who uuid;
begin
  for s in
    select sc.* from pg_temp.scope sc
     where sc.key is not null
       and exists (select 1 from information_schema.role_column_grants g
                    where g.table_schema = 'public' and g.table_name = sc.tbl
                      and g.grantee = 'authenticated' and g.privilege_type = 'SELECT' and g.column_name = sc.key)
  loop
    -- A phone's link and its push names are its own; everything else, the admin's.
    who := case when s.tbl = 'device_sessions' then pg_temp.id('b', 3) else pg_temp.id('b', 2) end;
    r := pg_temp.try_as(who, format('select count(*) from public.%I where %I = %L', s.tbl, s.key, s.b));
    if r->>'state' <> '' or (r->>'v')::int = 0 then
      raise exception 'FAIL: control: B''s own % does not see B''s row in % (%)',
        case when who = pg_temp.id('b', 3) then 'phone' else 'admin' end, s.tbl, r;
    end if;
  end loop;
end $$;
select pg_temp.ok(true, 'control: B''s admin (and phone, for its link) sees B''s row in every table clients may read');

-- ---- A's admin and A's phone against every table of B's -----------------------------------
create temp table results (actor text, tbl text, attack text, r jsonb, pass boolean);
do $$
declare s record; a record; r jsonb; cols text;
begin
  for a in select * from (values ('admin', pg_temp.id('a', 2)), ('phone', pg_temp.id('a', 3))) v(name, uid) loop
    for s in select * from pg_temp.scope order by tbl loop
      if s.key is null then
        -- Service-wide settings: no client reads or writes them.
        -- Never empty (checked above): 0 rows seen means hidden.
        r := pg_temp.try_as(a.uid, format('select count(*) from public.%I', s.tbl));
        insert into pg_temp.results values (a.name, s.tbl, 'read service settings', r, r->>'state' = '42501' or r->>'v' = '0');
        r := pg_temp.try_as(a.uid, format('delete from public.%I', s.tbl));
        insert into pg_temp.results values (a.name, s.tbl, 'delete service settings', r, pg_temp.refused(r));
        continue;
      end if;
      cols := pg_temp.insertable_columns(s.tbl);

      r := pg_temp.try_as(a.uid, format('select count(*) from public.%I where %I = %L', s.tbl, s.key, s.b));
      insert into pg_temp.results values (a.name, s.tbl, 'read B''s rows', r, pg_temp.refused(r));

      r := pg_temp.try_as(a.uid, format('update public.%I set %I = %I where %I = %L', s.tbl, s.key, s.key, s.key, s.b));
      insert into pg_temp.results values (a.name, s.tbl, 'update B''s rows', r, pg_temp.refused(r));

      r := pg_temp.try_as(a.uid, format('delete from public.%I where %I = %L', s.tbl, s.key, s.b));
      insert into pg_temp.results values (a.name, s.tbl, 'delete B''s rows', r, pg_temp.refused(r));

      -- bill_payments_server_fields runs before RLS and reads tasks with the
      -- caller's own rights, so it refuses (23514) before the policy is ever
      -- asked. Off for the write probes on that table, so its RLS is what
      -- answers (the guard is tested by 138's own test).
      if s.tbl = 'bill_payments' then
        alter table public.bill_payments disable trigger bill_payments_server_fields;
      end if;

      -- Inserts: a row that collides with an existing key is skipped
      -- (on conflict do nothing), so only a refusal (42501: RLS, a missing
      -- grant, or a guard) passes; never a unique-key error (Codex, PR #158).
      r := pg_temp.try_as(a.uid, format('insert into public.%I (%s) select %s from %I on conflict do nothing', s.tbl, cols, cols, 'b_' || s.tbl));
      insert into pg_temp.results values (a.name, s.tbl, 'add a row to B', r, r->>'state' = '42501');

      r := pg_temp.try_as(a.uid, format('insert into public.%I (%s) select %s from %I on conflict do nothing', s.tbl, cols, cols, 'a2b_' || s.tbl));
      insert into pg_temp.results values (a.name, s.tbl, 'copy an A row into B', r, r->>'state' = '42501');

      -- Moves go to household C, which holds nothing to collide with: refused,
      -- or the row stays in A (some tables pin household_id in a trigger).
      r := pg_temp.try_as(a.uid, format('with moved as (update public.%I set %I = %L where %I = %L returning %I) select count(*) from moved where %I = %L',
                                        s.tbl, s.key, s.c, s.key, s.a, s.key, s.key, s.c));
      insert into pg_temp.results values (a.name, s.tbl, 'move A''s rows to another household', r, pg_temp.refused(r));

      if s.tbl = 'bill_payments' then
        alter table public.bill_payments enable trigger bill_payments_server_fields;
      end if;
    end loop;
  end loop;
end $$;

select actor, tbl, attack, r from pg_temp.results where not pass order by 1, 2, 3;
select pg_temp.ok(not exists (select 1 from pg_temp.results where not pass),
  format('A''s admin and A''s phone are refused on every table of B''s (%s attacks; failures listed above)',
         (select count(*) from pg_temp.results)));

-- ---- Owner-only inside one household: staff never read them -------------------------------
-- Prices (bill payments, repair costs), Kakak's use and settings, invites,
-- and the feedback inbox: B's own phone sees none of B's rows.
do $$
declare t text; r jsonb;
begin
  foreach t in array array['bill_payments', 'repair_costs', 'kakak_requests', 'kakak_settings',
                           'owner_invites', 'staff_invites', 'feedback', 'household_members',
                           'push_subscriptions', 'household_access_requests', 'user_preferences'] loop
    r := pg_temp.try_as(pg_temp.id('b', 3),
           format('select count(*) from public.%I where %I = %L', t,
                  (select key from pg_temp.scope where tbl = t), (select b from pg_temp.scope where tbl = t))
           -- A phone sees its own push subscription; never the admin's.
           || case when t = 'push_subscriptions' then format(' and user_id = %L', pg_temp.id('b', 2)) else '' end);
    if not pg_temp.refused(r) then
      raise exception 'FAIL: B''s own staff phone reads owner-only %: %', t, r;
    end if;
  end loop;
end $$;
select pg_temp.ok(true, 'staff never read owner-only tables of their own household (prices, Kakak, invites, feedback, admins)');

-- ---- Storage: the photos of B's home ------------------------------------------------------
do $$
declare a record; b text; r jsonb; bad text := '';
begin
  for a in select * from (values ('admin', pg_temp.id('a', 2)), ('phone', pg_temp.id('a', 3))) v(name, uid) loop
    foreach b in array array['household-logs', 'inventory_audits', 'owner-receipts'] loop
      r := pg_temp.try_as(a.uid, format($q$select count(*) from storage.objects where bucket_id = %L and name like %L$q$,
                                        b, pg_temp.id('b', 1)::text || '/%'));
      if not pg_temp.refused(r) then bad := bad || format(' [%s reads %s: %s]', a.name, b, r); end if;
      r := pg_temp.try_as(a.uid, format($q$select count(*) from storage.objects where bucket_id = %L$q$, b));
      if r->>'state' = '' and (r->>'v')::int > 1 then bad := bad || format(' [%s lists %s beyond A: %s]', a.name, b, r); end if;
      r := pg_temp.try_as(a.uid, format($q$insert into storage.objects (bucket_id, name, owner, owner_id) values (%L, %L, %L, %L)$q$,
                                        b, pg_temp.id('b', 1)::text || '/planted.webp', a.uid, a.uid::text));
      if not pg_temp.errored(r) then bad := bad || format(' [%s uploads into B''s %s]', a.name, b); end if;
      r := pg_temp.try_as(a.uid, format($q$update storage.objects set name = name || '.x' where bucket_id = %L and name like %L$q$,
                                        b, pg_temp.id('b', 1)::text || '/%'));
      if not pg_temp.refused(r) then bad := bad || format(' [%s renames B''s %s: %s]', a.name, b, r); end if;
      r := pg_temp.try_as(a.uid, format($q$delete from storage.objects where bucket_id = %L and name like %L$q$,
                                        b, pg_temp.id('b', 1)::text || '/%'));
      if not pg_temp.refused(r) then bad := bad || format(' [%s deletes B''s %s: %s]', a.name, b, r); end if;
      -- Moving one of A's own photos under B's folder.
      r := pg_temp.try_as(a.uid, format($q$update storage.objects set name = %L where bucket_id = %L and name like %L$q$,
                                        pg_temp.id('b', 1)::text || '/moved.webp', b, pg_temp.id('a', 1)::text || '/%'));
      if not pg_temp.refused(r) then bad := bad || format(' [%s moves an A photo into B''s %s: %s]', a.name, b, r); end if;
      -- A folder that only looks like B's: case, a leading slash, a path trick.
      r := pg_temp.try_as(a.uid, format($q$insert into storage.objects (bucket_id, name, owner) values (%L, %L, %L)$q$,
                                        b, upper(pg_temp.id('b', 1)::text) || '/x.webp', a.uid));
      if not pg_temp.errored(r) then bad := bad || format(' [%s uploads into B''s %s in capitals]', a.name, b); end if;
      r := pg_temp.try_as(a.uid, format($q$insert into storage.objects (bucket_id, name, owner) values (%L, %L, %L)$q$,
                                        b, pg_temp.id('a', 1)::text || '/../' || pg_temp.id('b', 1)::text || '/x.webp', a.uid));
      if r->>'state' = '' then
        -- Allowed only because the name starts with A's folder; it must never read as B's.
        if public.storage_object_household(pg_temp.id('a', 1)::text || '/../' || pg_temp.id('b', 1)::text || '/x.webp')
           is distinct from pg_temp.id('a', 1) then
          bad := bad || format(' [%s plants a ../ path in %s]', a.name, b);
        end if;
      end if;
    end loop;
  end loop;
  if bad <> '' then raise exception 'FAIL: storage:%', bad; end if;
end $$;
select pg_temp.ok(true, 'storage: A''s admin and phone cannot list, open, upload into, rename, move into or delete B''s photos in any bucket');

-- Controls: B sees its own photos; B's staff never sees B's receipts.
select pg_temp.ok((pg_temp.try_as(:adminB, format($q$select count(*) from storage.objects where name like %L$q$, :hB || '/%'))->>'v')::int = 3,
  'control: B''s admin sees B''s three photos');
select pg_temp.ok((pg_temp.try_as(:phoneB, format($q$select count(*) from storage.objects where bucket_id in ('household-logs', 'inventory_audits') and name like %L$q$, :hB || '/%'))->>'v')::int = 2,
  'control: B''s phone sees B''s proof and stock photos');
select pg_temp.ok(pg_temp.refused(pg_temp.try_as(:phoneB, format($q$select count(*) from storage.objects where bucket_id = 'owner-receipts' and name like %L$q$, :hB || '/%'))),
  'staff never open their own household''s receipts');
select pg_temp.ok(pg_temp.try_as(null, $q$select count(*) from storage.objects$q$)->>'v' = '0'
                  or pg_temp.try_as(null, $q$select count(*) from storage.objects$q$)->>'state' = '42501',
  'a session with no user sees no photo at all');

-- ---- Functions a client can call, pointed at B --------------------------------------------
-- Each call names the refusal it must get (a pattern on "state:message",
-- or on "v=<value>" for one that answers instead of raising), for A's admin
-- and A's phone, and a control: the same call (or its success form) by B's
-- own admin or phone, which must succeed. So an unrelated error, a void
-- success, or an input that matches nothing can't pass (Codex, PR #158).
create function pg_temp.outcome(r jsonb) returns text language sql immutable as $$
  select case when r->>'state' <> '' then (r->>'state') || ':' || (r->>'msg') else 'v=' || coalesce(r->>'v', 'null') end
$$;
create temp table rpc (label text, stmt text, expect_admin text, expect_phone text,
                       control_by text, control_stmt text, control_expect text);
insert into pg_temp.rpc values
  ('list B''s phones', format('select count(*) from public.list_linked_phones(%L)', :hB),
   '^42501:admins_only$', '^42501:admins_only$', 'admin', null, '^v=[1-9]'),
  ('read B''s house code', format('select public.my_house_code(%L)', :hB),
   '^42501:admins_only$', '^42501:admins_only$', 'admin', null, '^v=[A-HJKMNP-Z2-9]{6}$'),
  ('rotate B''s house code', format('select public.rotate_house_code(%L)', :hB),
   '^42501:admins_only$', '^42501:admins_only$', 'admin', null, '^v=[A-HJKMNP-Z2-9]{6}$'),
  ('unlink B''s phone', format('select public.remove_linked_phone(%L, %L)', :hB, pg_temp.id('b', 35)),
   '^42501:admins_only$', '^42501:admins_only$', 'admin', null, '^v=true$'),
  ('save a push subscription under B', format($q$select public.save_push_subscription(%L, '{"endpoint":"https://fcm.googleapis.com/fcm/send/x177","keys":{"p256dh":"k","auth":"a"}}')$q$, :hB),
   '^42501:not a member of this household$', '^42501:not a member of this household$', 'admin', null, '^v=$'),
  ('switch a feature for B', format('select public.set_household_feature(%L, %L, false)', :hB, 'repairs'),
   '^42501:not_admin$', '^42501:not_admin$', 'admin', null, '^v=$'),
  ('switch B''s pets', format('select public.set_household_has_pets(%L, true)', :hB),
   '^42501:not_admin$', '^42501:not_admin$', 'admin', null, '^v=$'),
  ('switch Kakak for B', format('select public.set_kakak_enabled(%L, false)', :hB),
   '^42501:not_admin$', '^42501:not_admin$', 'admin', null, '^v=$'),
  ('write B''s kitchen notes', format('select public.set_kitchen_notes(%L, %L, false)', :hB, 'Tanpa kacang'),
   '^42501:admins_only$', '^42501:admins_only$', 'admin', null, '^v=\{'),
  ('make B''s staff claim link', format('select public.staff_claim_link(%L)', :hB),
   '^42501:not_admin$', '^42501:not_admin$', 'admin', null, '^v=[A-Z2-9]{10}$'),
  ('read B''s claims', format('select count(*) from public.staff_claims_today(%L)', :hB),
   '^42501:not_admin$', '^42501:not_admin$', 'admin', null, '^v=1$'),
  ('undo a claim in B', format('select public.undo_staff_claim(%L, %L)', :hB, pg_temp.id('b', 4)),
   '^42501:not_admin$', '^42501:not_admin$', 'admin', null, '^v=true$'),
  ('start a Kakak call for B', format($q$select public.kakak_begin(%L)->>'reason'$q$, :hB),
   '^v=not_admin$', '^v=not_admin$', 'admin', format($q$select public.kakak_begin(%L)->>'ok'$q$, :hB), '^v=true$'),
  ('read B''s Kakak status', format('select count(*) from public.kakak_status(%L)', :hB),
   '^42501:not_admin$', '^42501:not_admin$', 'admin', null, '^v=1$'),
  ('reserve B''s voice budget', format($q$select public.kakak_voice_reserve(%L, 10, 1000)->>'reason'$q$, :hB),
   '^v=not_admin$', '^v=not_admin$', 'admin', format($q$select public.kakak_voice_reserve(%L, 10, 1000)->>'ok'$q$, :hB), '^v=true$'),
  ('spend B''s voice budget', format($q$select public.kakak_voice_spend(%L, 10, 1000)->>'reason'$q$, :hB),
   '^v=not_admin$', '^v=not_admin$', 'admin', format($q$select public.kakak_voice_spend(%L, 10, 1000)->>'ok'$q$, :hB), '^v=true$'),
  -- These two answer {"ok": false} both when refused and when the hold isn't
  -- found; the control proves B's hold is found.
  ('settle B''s voice hold', format($q$select public.kakak_voice_settle(%L, %L)->>'ok'$q$, :hB, pg_temp.id('b', 33)),
   '^v=false$', '^v=false$', 'admin', null, '^v=true$'),
  ('release B''s voice hold', format($q$select public.kakak_voice_release(%L, %L)->>'ok'$q$, :hB, pg_temp.id('b', 33)),
   '^v=false$', '^v=false$', 'admin', null, '^v=true$'),
  ('record B''s Kakak call', format($q$select public.kakak_record(%L, 'm', 'message', '{}', 1, 0, 0, 1, 1, 1)$q$, pg_temp.id('b', 26)),
   '^42501:not_admin$', '^42501:not_admin$', 'admin', null, '^v=$'),
  ('set B''s Kakak result', format($q$select public.kakak_set_result(%L, 'confirmed')$q$, pg_temp.id('b', 26)),
   '^42501:not_admin$', '^42501:not_admin$', 'admin', null, '^v=$'),
  ('record B''s setup', format($q$select public.record_household_setup(%L, '{"rooms_added": 1}')$q$, :hB),
   '^42501:members_only$', '^28000:not_authenticated$', 'admin', null, '^v=$'),
  -- Answers false when refused; B's phone asking proves B's admin is a target.
  ('ask whether B''s owners get requests', format('select public.household_requests_push_on(%L)', :hB),
   '^v=false$', '^v=false$', 'phone', null, '^v=true$'),
  ('make a profile in B', format('select count(*) from public.ensure_my_member_profile(%L)', :hB),
   '^42501:not_a_household_member$', '^42501:not_a_household_member$', 'admin', null, '^v=1$'),
  ('archive B''s staff', format('select public.archive_staff_profile(%L)', pg_temp.id('b', 4)),
   '^42501:No such person in your household$', '^42501:No such person in your household$', 'admin', null, '^v=\('),
  ('restore B''s staff', format('select public.restore_staff_profile(%L)', pg_temp.id('b', 38)),
   '^42501:No such person in your household$', '^42501:No such person in your household$', 'admin', null, '^v=\('),
  ('reset B''s staff PIN', format('select public.set_staff_pin(%L, null)', pg_temp.id('b', 4)),
   '^42501:staff_not_found$', '^42501:staff_not_found$', 'admin', null, '^v=$'),
  ('set B''s staff PIN', format($q$select public.set_staff_pin(%L, '9999')$q$, pg_temp.id('b', 4)),
   '^42501:staff_not_found$', '^42501:staff_not_found$', 'admin', null, '^v=$'),
  ('check B''s staff PIN', format($q$select public.check_staff_pin(%L, '1234')->>'status'$q$, pg_temp.id('b', 4)),
   '^v=no_pin$', '^v=no_pin$', 'phone', null, '^v=ok$'),
  ('take B''s staff pushes', format($q$select public.set_my_push_person(%L, true, '1234')->>'status'$q$, pg_temp.id('b', 4)),
   '^42501:staff_phones_only$', '^22023:not_on_roster$', 'phone', null, '^v=ok$'),
  ('cook B''s dish', format($q$select public.cook_menu_dish(%L, '[]', null)$q$, pg_temp.id('b', 22)),
   '^42501:not_found$', '^42501:not_found$', 'admin', null, '^v=\{'),
  ('uncook B''s dish', format('select public.uncook_menu_dish(%L)', pg_temp.id('b', 34)),
   '^42501:not_found$', '^42501:not_found$', 'admin', null, '^v=\{'),
  ('change B''s cooked amounts', format($q$select public.change_cooked_uses(%L, '[]', null, null)$q$, pg_temp.id('b', 34)),
   '^42501:not_found$', '^42501:not_found$', 'admin', null, '^v=\{'),
  ('eat B''s food', format('select public.eat_food_portion(%L, %L, null)', pg_temp.id('b', 19), pg_temp.id('b', 37)),
   '^42501:not_found$', '^42501:not_found$', 'phone', null, '^v=\{'),
  ('undo B''s portion', format('select public.undo_food_portion(%L, %L)', pg_temp.id('b', 19), pg_temp.id('b', 31)),
   '^42501:not_found$', '^42501:not_found$', 'phone', null, '^v=\{'),
  ('end B''s leave', format('select public.end_leave_early(%L, current_date)', pg_temp.id('b', 23)),
   '^22023:leave_not_active$', '^22023:leave_not_active$', 'admin', null, '^v=\('),
  ('ask which of B''s staff get pushes', format('select cardinality(public.staff_will_be_notified(array[%L]::uuid[], false))', pg_temp.id('b', 4)),
   '^v=0$', '^42501:admins_only$', 'admin', null, '^v=1$');

create temp table rpc_results (actor text, label text, r jsonb, pass boolean);
do $$
declare a record; x record; r jsonb;
begin
  for x in select * from pg_temp.rpc loop
    for a in select * from (values ('admin', pg_temp.id('a', 2)), ('phone', pg_temp.id('a', 3))) v(name, uid) loop
      r := pg_temp.try_as(a.uid, x.stmt);
      insert into pg_temp.rpc_results values (a.name, x.label, r,
        pg_temp.outcome(r) ~ case a.name when 'admin' then x.expect_admin else x.expect_phone end);
    end loop;
    r := pg_temp.try_as(case x.control_by when 'admin' then pg_temp.id('b', 2) else pg_temp.id('b', 3) end,
                        coalesce(x.control_stmt, x.stmt));
    insert into pg_temp.rpc_results values ('control: B''s ' || x.control_by, x.label, r, pg_temp.outcome(r) ~ x.control_expect);
  end loop;
end $$;
select actor, label, pg_temp.outcome(r) from pg_temp.rpc_results where not pass order by 1, 2;
select pg_temp.ok(not exists (select 1 from pg_temp.rpc_results where not pass),
  format('every client function pointed at B refuses A''s admin and A''s phone with its own refusal, and works for B (%s calls; failures listed above)',
         (select count(*) from pg_temp.rpc_results)));

-- Nothing of B's moved while all of that was tried.
select pg_temp.ok((select pin = extensions.crypt('1234', pin) and has_pin and archived_at is null
                     from public.staff_profiles where id = pg_temp.id('b', 4))
                  and (select allowed and enabled from public.kakak_settings where household_id = :hB)
                  and (select enabled from public.household_features where household_id = :hB and feature = 'repairs'),
  'B''s PIN, Kakak switch and features are untouched');

-- The export is A's alone.
select pg_temp.ok(position(:hB in (pg_temp.try_as(:adminA, 'select public.export_household_data()::text')->>'v')) = 0
                  and position('Rumah B' in (pg_temp.try_as(:adminA, 'select public.export_household_data()::text')->>'v')) = 0
                  and position('Staf B' in (pg_temp.try_as(:adminA, 'select public.export_household_data()::text')->>'v')) = 0,
  'A''s export holds nothing of B''s');
select pg_temp.ok(pg_temp.try_as(:phoneA, 'select public.export_household_data()::text')->>'state' = '42501',
  'a staff phone cannot export');

-- ---- A's rows pointing at B's people, pets, routines and things ----------------------------
-- Nobody can learn B's ids through Miamus; this is the second wall, for the
-- day one leaks. A row that names B's staff member would put that name in
-- A's export and A's pushes.
-- expect: the guard that must refuse it (a pattern on the error, always
-- 42501), or 'stamped' for a statement whose answer counts B's ids that got
-- stored (must be 0: the guard overwrites the column). A refusal for any
-- other reason (a unique key, a check) is not a pass (Codex, PR #158).
create temp table refs (label text, actor uuid, stmt text, expect text default 'other_household_reference');
insert into pg_temp.refs (label, actor, stmt) values
  ('a log in B''s staff member''s name', :phoneA, format($q$insert into public.task_logs (entity_id, schedule_id, module, staff_id) values (%L, %L, 'pet', %L)$q$, pg_temp.id('a', 5), pg_temp.id('a', 6), pg_temp.id('b', 4))),
  ('a log on B''s routine', :phoneA, format($q$insert into public.task_logs (entity_id, schedule_id, module) values (%L, %L, 'pet')$q$, pg_temp.id('a', 5), pg_temp.id('b', 6))),
  ('a schedule suggestion in B''s staff member''s name', :phoneA, format($q$insert into public.routine_proposals (pet_id, title, category, time, staff_id) values (%L, 'x', 'meal', '09:00', %L)$q$, pg_temp.id('a', 5), pg_temp.id('b', 4))),
  ('a shopping request for B''s pet', :phoneA, format($q$insert into public.inventory_alerts (household_id, item_type, pet_id) values (%L, 'x', %L)$q$, :hA, pg_temp.id('b', 5))),
  ('a shopping request in B''s staff member''s name', :phoneA, format($q$insert into public.inventory_alerts (household_id, item_type, staff_id) values (%L, 'x', %L)$q$, :hA, pg_temp.id('b', 4))),
  ('a stock status in B''s staff member''s name', :phoneA, format($q$update public.inventory_items set stock_status = 'low', stock_status_by = %L where id = %L$q$, pg_temp.id('b', 4), pg_temp.id('a', 10))),
  ('a stock count in B''s staff member''s name', :phoneA, format($q$insert into public.inventory_audit_logs (item_id, audited_by) values (%L, %L)$q$, pg_temp.id('a', 10), pg_temp.id('b', 4))),
  ('a chore for B''s staff member', :adminA, format($q$insert into public.household_tasks (household_id, title, assigned_to) values (%L, 'x', %L)$q$, :hA, pg_temp.id('b', 4))),
  ('a chore finished by B''s staff member', :adminA, format($q$update public.household_tasks set completed_by = %L where id = %L$q$, pg_temp.id('b', 4), pg_temp.id('a', 13))),
  ('a chore under B''s chore', :adminA, format($q$insert into public.household_tasks (household_id, title, parent_task_id) values (%L, 'x', %L)$q$, :hA, pg_temp.id('b', 13))),
  ('a routine for B''s staff member', :adminA, format($q$insert into public.master_schedules (entity_id, title, module, frequency_type, staff_id) values (%L, 'x', 'pet', 'fixed_time', %L)$q$, pg_temp.id('a', 5), pg_temp.id('b', 4))),
  ('couldn''t-do on B''s chore', :phoneA, format($q$insert into public.task_exceptions (household_id, occurs_on, note, reason, chore_id) values (%L, current_date, 'Hujan', 'other', %L)$q$, :hA, pg_temp.id('b', 13))),
  ('couldn''t-do in B''s staff member''s name', :phoneA, format($q$insert into public.task_exceptions (household_id, occurs_on, note, reason, chore_id, staff_id) values (%L, current_date, 'Hujan', 'other', %L, %L)$q$, :hA, pg_temp.id('a', 13), pg_temp.id('b', 4))),
  ('couldn''t-do on B''s routine', :phoneA, format($q$insert into public.task_exceptions (household_id, occurs_on, note, reason, schedule_id, entity_id, slot_time) values (%L, current_date, 'Hujan', 'other', %L, %L, '08:00')$q$, :hA, pg_temp.id('b', 6), pg_temp.id('a', 5))),
  ('couldn''t-do for B''s pet', :phoneA, format($q$with ins as (insert into public.task_exceptions (household_id, occurs_on, note, reason, schedule_id, entity_id, slot_time) values (%L, current_date, 'Hujan', 'other', %L, %L, '08:00') returning entity_id) select count(*) from ins where entity_id = %L$q$, :hA, pg_temp.id('a', 6), pg_temp.id('b', 5), pg_temp.id('b', 5))),
  ('couldn''t-do on B''s shopping item', :phoneA, format($q$insert into public.task_exceptions (household_id, occurs_on, note, reason, chore_id, inventory_item_id) values (%L, current_date, 'Hujan', 'out_of_stock', %L, %L)$q$, :hA, pg_temp.id('a', 13), pg_temp.id('b', 10))),
  ('a repair reported by B''s staff member', :phoneA, format($q$insert into public.repairs (household_id, title, status, reported_by_staff) values (%L, 'x', 'reported', %L)$q$, :hA, pg_temp.id('b', 4))),
  ('a repair note by B''s staff member', :phoneA, format($q$insert into public.repair_notes (household_id, repair_id, body, staff_id) values (%L, %L, 'x', %L)$q$, :hA, pg_temp.id('a', 16), pg_temp.id('b', 4))),
  ('a walk-in logged by B''s staff member', :phoneA, format($q$insert into public.repair_visits (household_id, repair_id, before_photo_url, logged_by_staff) values (%L, %L, %L, %L)$q$, :hA, pg_temp.id('a', 16), pg_temp.url(:hA || '/repairs/b.webp'), pg_temp.id('b', 4))),
  ('supervision by B''s staff member', :phoneA, format($q$insert into public.repair_supervision (household_id, visit_id, staff_id) values (%L, %L, %L)$q$, :hA, pg_temp.id('a', 18), pg_temp.id('b', 4))),
  ('feedback in B''s staff member''s name', :phoneA, format($q$insert into public.feedback (household_id, message, staff_id) values (%L, 'x', %L)$q$, :hA, pg_temp.id('b', 4))),
  ('food added by B''s staff member', :phoneA, format($q$insert into public.food_items (household_id, name, added_by) values (%L, 'x', %L)$q$, :hA, pg_temp.id('b', 4))),
  ('leave for B''s staff member', :phoneA, format($q$insert into public.leave_requests (household_id, staff_id, start_date, end_date) values (%L, %L, current_date, current_date)$q$, :hA, pg_temp.id('b', 4))),
  ('a dish cooked by B''s staff member', :adminA, format($q$update public.menu_dishes set cooked_at = now(), cooked_by = %L where id = %L$q$, pg_temp.id('b', 4), pg_temp.id('a', 22))),
  ('a proof photo from B''s folder', :phoneA, format($q$insert into public.task_logs (entity_id, schedule_id, module, photo_url) values (%L, %L, 'pet', %L)$q$, pg_temp.id('a', 5), pg_temp.id('a', 6), 'https://x.supabase.co/storage/v1/object/public/household-logs/' || :hB || '/pets/proof.webp')),
  ('a repair photo from B''s folder', :adminA, format($q$insert into public.repairs (household_id, title, status, photo_url) values (%L, 'x', 'open', %L)$q$, :hA, pg_temp.url(:hB || '/repairs/before.webp'))),
  ('a repair note photo from B''s folder', :adminA, format($q$insert into public.repair_notes (household_id, repair_id, body, photo_url) values (%L, %L, 'x', %L)$q$, :hA, pg_temp.id('a', 16), pg_temp.url(:hB || '/repairs/before.webp'))),
  ('a vet document from B''s folder', :adminA, format($q$insert into public.medical_records (entity_id, record_type, title, document_photo_url) values (%L, 'vet', 'x', %L)$q$, pg_temp.id('a', 5), pg_temp.url(:hB || '/pets/proof.webp'))),
  ('a food photo from B''s folder', :phoneA, format($q$insert into public.food_items (household_id, name, photo_url) values (%L, 'x', %L)$q$, :hA, pg_temp.url(:hB || '/food/x.webp'))),
  ('a stock photo from B''s folder', :adminA, format($q$update public.inventory_items set photo_url = %L where id = %L$q$, replace(pg_temp.url(:hB || '/stock/shelf.webp'), 'household-logs', 'inventory_audits'), pg_temp.id('a', 10))),
  ('a stock count photo from B''s folder', :phoneA, format($q$insert into public.inventory_audit_logs (item_id, photo_url) values (%L, %L)$q$, pg_temp.id('a', 10), replace(pg_temp.url(:hB || '/stock/shelf.webp'), 'household-logs', 'inventory_audits'))),
  ('a bill receipt from B''s folder', :adminA, format($q$update public.bill_payments set receipt_url = %L where id = %L$q$, replace(pg_temp.url(:hB || '/repairs/receipt.webp'), 'household-logs', 'owner-receipts'), pg_temp.id('a', 15))),
  ('a repair receipt from B''s folder', :adminA, format($q$update public.repair_costs set receipt_url = %L where repair_id = %L$q$, replace(pg_temp.url(:hB || '/repairs/receipt.webp'), 'household-logs', 'owner-receipts'), pg_temp.id('a', 16))),
  ('a pet avatar from B''s folder', :adminA, format($q$update public.task_entities set metadata = jsonb_build_object('avatar', %L::text) where id = %L$q$, pg_temp.url(:hB || '/pets/proof.webp'), pg_temp.id('a', 5))),
  ('a photo outside any household folder', :phoneA, format($q$insert into public.task_logs (entity_id, schedule_id, module, photo_url) values (%L, %L, 'pet', %L)$q$, pg_temp.id('a', 5), pg_temp.id('a', 6), pg_temp.url('loose/proof.webp'))),
  ('a chore photo from B''s folder', :phoneA, format($q$update public.household_tasks set status = 'completed', completed_by = %L, before_photo_url = %L, after_photo_url = %L where id = %L$q$, pg_temp.id('a', 4), 'https://x.supabase.co/storage/v1/object/public/household-logs/' || :hB || '/pets/proof.webp', 'https://x.supabase.co/storage/v1/object/public/household-logs/' || :hB || '/pets/proof.webp', pg_temp.id('a', 13)));

-- Refused by the older guards, under their own names.
update pg_temp.refs set expect = 'cooked_through_functions_only' where label = 'a dish cooked by B''s staff member';
update pg_temp.refs set expect = 'staff_not_in_household' where label in ('a repair note by B''s staff member', 'food added by B''s staff member');
update pg_temp.refs set expect = 'staff_not_in_household' where label = 'a repair reported by B''s staff member';
update pg_temp.refs set expect = 'routine_staff' where label = 'a routine for B''s staff member';
update pg_temp.refs set expect = 'repair_visit_staff' where label = 'a walk-in logged by B''s staff member';
update pg_temp.refs set expect = 'task_exception_person' where label = 'couldn''t-do in B''s staff member''s name';
update pg_temp.refs set expect = 'task_exception_task' where label in ('couldn''t-do on B''s chore', 'couldn''t-do on B''s routine');
update pg_temp.refs set expect = 'task_exception_item' where label = 'couldn''t-do on B''s shopping item';
update pg_temp.refs set expect = 'feedback_not_this_staff' where label = 'feedback in B''s staff member''s name';
update pg_temp.refs set expect = 'new row violates row-level security policy%' where label = 'leave for B''s staff member';
update pg_temp.refs set expect = 'supervision_person' where label = 'supervision by B''s staff member';
update pg_temp.refs set expect = 'stamped' where label = 'couldn''t-do for B''s pet';

create temp table ref_results (label text, r jsonb, pass boolean);
do $$
declare x record; r jsonb;
begin
  for x in select * from pg_temp.refs loop
    r := pg_temp.try_as(x.actor, x.stmt);
    insert into pg_temp.ref_results values (x.label, r,
      case when x.expect = 'stamped' then r->>'state' = '' and r->>'v' = '0'
           else r->>'state' = '42501' and r->>'msg' like x.expect end);
  end loop;
end $$;
select label, r from pg_temp.ref_results where not pass order by 1;
select pg_temp.ok(not exists (select 1 from pg_temp.ref_results where not pass),
  format('A''s rows can''t name B''s staff, pets, routines, chores, items or photos (%s tries; failures listed above)',
         (select count(*) from pg_temp.ref_results)));

-- Control: the same writes with A's own ids still work.
select pg_temp.ok(pg_temp.try_as(:phoneA, format($q$insert into public.task_logs (entity_id, schedule_id, module, staff_id) values (%L, %L, 'pet', %L)$q$, pg_temp.id('a', 5), pg_temp.id('a', 6), pg_temp.id('a', 4)))->>'state' = '',
  'control: A''s phone still logs a routine in A''s staff member''s name');
select pg_temp.ok(pg_temp.try_as(:phoneA, format($q$insert into public.inventory_alerts (household_id, item_type, pet_id, staff_id) values (%L, 'x', %L, %L)$q$, :hA, pg_temp.id('a', 5), pg_temp.id('a', 4)))->>'state' = '',
  'control: A''s phone still asks for something for A''s pet');
select pg_temp.ok(pg_temp.try_as(:phoneA, format($q$insert into public.routine_proposals (pet_id, title, category, time, staff_id) values (%L, 'x', 'meal', '09:00', %L)$q$, pg_temp.id('a', 5), pg_temp.id('a', 4)))->>'state' = '',
  'control: A''s phone still suggests a schedule change');
select pg_temp.ok(pg_temp.try_as(:phoneA, format($q$insert into public.inventory_audit_logs (item_id, audited_by) values (%L, %L)$q$, pg_temp.id('a', 10), pg_temp.id('a', 4)))->>'state' = '',
  'control: A''s phone still records a stock count');
select pg_temp.ok(pg_temp.try_as(:adminA, format($q$insert into public.household_tasks (household_id, title, assigned_to, parent_task_id) values (%L, 'x', %L, %L)$q$, :hA, pg_temp.id('a', 4), pg_temp.id('a', 13)))->>'state' = '',
  'control: A''s admin still assigns a chore under another');
select pg_temp.ok(pg_temp.try_as(:phoneA, format($q$update public.inventory_items set stock_status = 'low', stock_status_by = %L where id = %L$q$, pg_temp.id('a', 4), pg_temp.id('a', 10)))->>'n' = '1',
  'control: A''s phone still marks stock low');
select pg_temp.ok(pg_temp.try_as(:phoneA, format($q$insert into public.repairs (household_id, title, status, reported_by_staff) values (%L, 'x', 'reported', %L)$q$, :hA, pg_temp.id('a', 4)))->>'state' = '',
  'control: A''s phone still reports a repair in A''s staff member''s name');
select pg_temp.ok(pg_temp.try_as(:adminA, format($q$update public.bill_payments set receipt_url = %L where id = %L$q$, replace(pg_temp.url(:hA || '/bills/receipt.webp'), 'household-logs', 'owner-receipts'), pg_temp.id('a', 15)))->>'n' = '1',
  'control: A''s admin still attaches a receipt from A''s own folder to a bill payment');
select pg_temp.ok(pg_temp.try_as(:adminA, format($q$insert into public.repairs (household_id, title, status, photo_url) values (%L, 'x', 'open', %L)$q$, :hA, pg_temp.url(:hA || '/repairs/new.webp')))->>'state' = '',
  'control: A''s admin still reports a repair with a photo from A''s own folder');
select pg_temp.ok(pg_temp.try_as(:phoneA, format($q$insert into public.task_logs (entity_id, schedule_id, module, photo_url) values (%L, %L, 'pet', %L)$q$, pg_temp.id('a', 5), pg_temp.id('a', 6), pg_temp.url(:hA || '/pets/new.webp')))->>'state' = '',
  'control: A''s phone still saves a photo from A''s own folder');
select pg_temp.ok(pg_temp.try_as(:adminA, format($q$update public.task_entities set metadata = jsonb_build_object('avatar', %L::text) where id = %L$q$, pg_temp.url(:hA || '/pets/avatar.webp'), pg_temp.id('a', 5)))->>'n' = '1',
  'control: A''s admin still sets a pet photo from A''s own folder');
-- A photo saved before 177 (the founding household's early files had no
-- folder): the row stays editable as long as the photo itself isn't changed.
set local session_replication_role = replica;  -- written as an old row: no triggers
update public.household_tasks set photo_url = pg_temp.url('legacy/proof.webp') where id = pg_temp.id('a', 13);
update public.task_entities set metadata = jsonb_build_object('avatar', pg_temp.url('legacy/avatar.webp')) where id = pg_temp.id('a', 5);
set local session_replication_role = origin;
select pg_temp.ok(pg_temp.try_as(:adminA, format($q$update public.household_tasks set title = 'Sapu dan pel' where id = %L$q$, pg_temp.id('a', 13)))->>'n' = '1'
                  and pg_temp.try_as(:adminA, format($q$update public.task_entities set name = 'Mocha', metadata = metadata || '{"breed": "kampung"}' where id = %L$q$, pg_temp.id('a', 5)))->>'n' = '1',
  'control: rows holding an old photo without a folder stay editable');


rollback;
