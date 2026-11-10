-- Migration 138 checks: owners record a bill's payment (amount and/or
-- receipt), the server stamps who, when and which bill; staff phones, other
-- households and logged-out callers see and write nothing; a payment can't
-- point at another household's chore or move; deleting the bill takes its
-- payments; payments go after 2 years; bill receipts are kept as long as
-- their payment (not swept the next night), then listed; the export has
-- them; grants.
-- LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/138_bill_payments.sql
\set ON_ERROR_STOP on
\pset footer off
begin;

create function pg_temp.ok(cond boolean, label text) returns text language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  return 'ok  ' || label;
end $$;
-- Runs a statement as someone and returns the error it raised ('' if none).
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
    return sqlerrm;
  end;
  execute 'reset role';
  return '';
end $$;
create function pg_temp.count_as(uid uuid, stmt text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute stmt into n;
  execute 'reset role';
  return n;
end $$;

-- a1 owns f1; a2 owns f2; b1 is f1's staff phone.
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, anon, now(), now()
from (values
  ('00000000-0000-0000-0000-0000000138a1', 'owner138@test.local', false),
  ('00000000-0000-0000-0000-0000000138a2', 'other138@test.local', false),
  ('00000000-0000-0000-0000-0000000138b1', null, true)
) as u(id, email, anon);
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000138f1', 'Rumah Melati', '00000000-0000-0000-0000-0000000138a1'),
  ('00000000-0000-0000-0000-0000000138f2', 'Rumah Kenanga', '00000000-0000-0000-0000-0000000138a2');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000138f1', '00000000-0000-0000-0000-0000000138a1', 'owner'),
  ('00000000-0000-0000-0000-0000000138f2', '00000000-0000-0000-0000-0000000138a2', 'owner');
insert into public.device_sessions (user_id, household_id) values
  ('00000000-0000-0000-0000-0000000138b1', '00000000-0000-0000-0000-0000000138f1');

-- f1: a monthly bill (template) with its 20 Nov day written and done; a
-- one-off bill; f2: a one-off of its own.
insert into public.household_tasks (id, household_id, title, category, recurrence, due_date, status,
                                    before_photo_url, after_photo_url)
values
  ('00000000-0000-0000-0000-0000000138d1', '00000000-0000-0000-0000-0000000138f1', 'Electricity (PLN)', 'bill',
   'monthly', '2026-10-20', 'pending', null, null),
  ('00000000-0000-0000-0000-0000000138d2', '00000000-0000-0000-0000-0000000138f1', 'Electricity (PLN)', 'bill',
   'none', '2026-11-20', 'completed', 'x/b.jpg', 'x/a.jpg'),
  ('00000000-0000-0000-0000-0000000138d3', '00000000-0000-0000-0000-0000000138f1', 'PBB', 'bill',
   'none', '2026-08-31', 'pending', null, null),
  ('00000000-0000-0000-0000-0000000138e1', '00000000-0000-0000-0000-0000000138f2', 'Internet', 'bill',
   'none', '2026-11-20', 'pending', null, null);
update public.household_tasks set parent_task_id = '00000000-0000-0000-0000-0000000138d1'
 where id = '00000000-0000-0000-0000-0000000138d2';

\set owner '''00000000-0000-0000-0000-0000000138a1'''
\set other '''00000000-0000-0000-0000-0000000138a2'''
\set staff '''00000000-0000-0000-0000-0000000138b1'''

-- ---- Owners record a payment ------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:owner, $q$
  insert into public.bill_payments (household_id, task_id, amount_idr, receipt_url, paid_at, series_id, created_by)
  values ('00000000-0000-0000-0000-0000000138f1', '00000000-0000-0000-0000-0000000138d2', 418500,
          'http://x/storage/v1/object/public/owner-receipts/00000000-0000-0000-0000-0000000138f1/bills/d1/fresh.webp',
          '2020-01-01', '00000000-0000-0000-0000-0000000138d3', '00000000-0000-0000-0000-0000000138a2') $q$) = '',
  'an owner records a payment for a paid day');
select pg_temp.ok((select series_id = '00000000-0000-0000-0000-0000000138d1'
                          and created_by = '00000000-0000-0000-0000-0000000138a1'
                          and paid_at > now() - interval '1 minute'
                     from public.bill_payments where task_id = '00000000-0000-0000-0000-0000000138d2'),
  '... the server stamps the bill (the repeat), who and when, whatever was sent');
select pg_temp.ok(pg_temp.err_as(:owner, $q$
  insert into public.bill_payments (household_id, task_id, amount_idr)
  values ('00000000-0000-0000-0000-0000000138f1', '00000000-0000-0000-0000-0000000138d3', 1200000) $q$) = '',
  'a one-off bill, amount only');
select pg_temp.ok((select series_id = task_id from public.bill_payments
                    where task_id = '00000000-0000-0000-0000-0000000138d3'),
  '... its bill is itself');
select pg_temp.ok(pg_temp.err_as(:owner, $q$
  insert into public.bill_payments (household_id, task_id) values
    ('00000000-0000-0000-0000-0000000138f1', '00000000-0000-0000-0000-0000000138d1') $q$)
  like '%bill_payments_not_empty%', 'a payment with neither amount nor receipt is refused');
select pg_temp.ok(pg_temp.err_as(:owner, $q$
  insert into public.bill_payments (household_id, task_id, amount_idr) values
    ('00000000-0000-0000-0000-0000000138f1', '00000000-0000-0000-0000-0000000138d3', 5) $q$)
  like '%bill_payments_task_key%', 'one payment per paid day');
select pg_temp.ok(pg_temp.err_as(:owner, $q$
  insert into public.bill_payments (household_id, task_id, amount_idr) values
    ('00000000-0000-0000-0000-0000000138f1', '00000000-0000-0000-0000-0000000138d1', -1) $q$)
  like '%bill_payments_amount_check%', 'a negative amount is refused');
select pg_temp.ok(pg_temp.err_as(:owner, $q$
  update public.bill_payments set amount_idr = 420000 where task_id = '00000000-0000-0000-0000-0000000138d2' $q$) = '',
  'an owner changes the amount');
select pg_temp.ok(pg_temp.err_as(:owner, $q$
  update public.bill_payments set task_id = '00000000-0000-0000-0000-0000000138d1'
   where task_id = '00000000-0000-0000-0000-0000000138d2' $q$) = 'bill_payment_fixed',
  'a payment can''t move to another day');

-- ---- Nobody else ------------------------------------------------------------------
select pg_temp.ok(pg_temp.count_as(:staff, $q$ select count(*) from public.bill_payments $q$) = 0,
  'a staff phone reads no payments');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.bill_payments (household_id, task_id, amount_idr) values
    ('00000000-0000-0000-0000-0000000138f1', '00000000-0000-0000-0000-0000000138d1', 1) $q$)
  like '%row-level security%', 'a staff phone can''t record one');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  update public.bill_payments set amount_idr = 1 $q$) = ''
  and (select amount_idr = 420000 from public.bill_payments where task_id = '00000000-0000-0000-0000-0000000138d2'),
  'a staff phone''s update changes nothing');
select pg_temp.ok(pg_temp.count_as(:other, $q$ select count(*) from public.bill_payments $q$) = 0,
  'another household''s owner reads none');
select pg_temp.ok(pg_temp.err_as(:other, $q$
  insert into public.bill_payments (household_id, task_id, amount_idr) values
    ('00000000-0000-0000-0000-0000000138f1', '00000000-0000-0000-0000-0000000138d1', 1) $q$)
  like '%row-level security%', 'another household''s owner can''t write into this one');
select pg_temp.ok(pg_temp.err_as(:other, $q$
  insert into public.bill_payments (household_id, task_id, amount_idr) values
    ('00000000-0000-0000-0000-0000000138f2', '00000000-0000-0000-0000-0000000138d1', 1) $q$)
  like '%bill_payments_task_fkey%', '... nor point their own payment at this household''s chore');
select pg_temp.ok(pg_temp.err_as(null, $q$ select count(*) from public.bill_payments $q$) like '%permission denied%',
  'logged out: no access at all');

-- ---- Receipts kept as long as their payment ----------------------------------------
select set_config('request.jwt.claims', '', true);
set local session_replication_role = replica;
insert into storage.objects (bucket_id, name, created_at, metadata) values
  ('owner-receipts', '00000000-0000-0000-0000-0000000138f1/bills/d1/fresh.webp',  now() - interval '1 hour',   '{"size": 1}'),
  ('owner-receipts', '00000000-0000-0000-0000-0000000138f1/bills/d1/kept.webp',   now() - interval '400 days', '{"size": 1}'),
  ('owner-receipts', '00000000-0000-0000-0000-0000000138f1/bills/d1/old.webp',    now() - interval '900 days', '{"size": 1}'),
  ('owner-receipts', '00000000-0000-0000-0000-0000000138f1/bills/d1/orphan.webp', now() - interval '3 days',   '{"size": 1}');
-- Two older payments, backdated (triggers off for the setup only).
insert into public.household_tasks (id, household_id, parent_task_id, title, category, due_date, status,
                                    before_photo_url, after_photo_url)
values
  ('00000000-0000-0000-0000-0000000138d4', '00000000-0000-0000-0000-0000000138f1', '00000000-0000-0000-0000-0000000138d1',
   'Electricity (PLN)', 'bill', '2025-10-20', 'completed', 'x/b.jpg', 'x/a.jpg'),
  ('00000000-0000-0000-0000-0000000138d5', '00000000-0000-0000-0000-0000000138f1', '00000000-0000-0000-0000-0000000138d1',
   'Electricity (PLN)', 'bill', '2024-05-20', 'completed', 'x/b.jpg', 'x/a.jpg');
insert into public.bill_payments (household_id, task_id, series_id, amount_idr, receipt_url, paid_at) values
  ('00000000-0000-0000-0000-0000000138f1', '00000000-0000-0000-0000-0000000138d4', '00000000-0000-0000-0000-0000000138d1', 390000,
   'http://x/storage/v1/object/public/owner-receipts/00000000-0000-0000-0000-0000000138f1/bills/d1/kept.webp', now() - interval '400 days'),
  ('00000000-0000-0000-0000-0000000138f1', '00000000-0000-0000-0000-0000000138d5', '00000000-0000-0000-0000-0000000138d1', 350000,
   'http://x/storage/v1/object/public/owner-receipts/00000000-0000-0000-0000-0000000138f1/bills/d1/old.webp', now() - interval '900 days');
set local session_replication_role = origin;

create temp table secret as
  select coalesce(
    (select decrypted_secret from vault.decrypted_secrets where name = 'task_photo_retention_secret'),
    'test-secret-138') as s;
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'task_photo_retention_secret') then
    perform vault.create_secret('test-secret-138', 'task_photo_retention_secret', 'test');
  end if;
end $$;
select pg_temp.ok((select array_agg(name order by name) from public.repair_receipts_due_for_pruning((select s from secret), 1000)
                    where name like '00000000-0000-0000-0000-0000000138f1/bills/%')
                  = array['00000000-0000-0000-0000-0000000138f1/bills/d1/old.webp',
                          '00000000-0000-0000-0000-0000000138f1/bills/d1/orphan.webp'],
  'receipts due: a payment''s over 2 years old, and one no payment points at after a day; not a fresh or a kept one');
select pg_temp.ok(exists (select 1 from pg_proc where proname = 'orphaned_household_photos'
                           and prosrc like '%bill_payments%'),
  'the deleted-household sweep never lists a payment''s receipt');

-- ---- After 2 years ------------------------------------------------------------------
select pg_temp.ok(public.prune_old_bill_payments() = 1, 'the nightly clean-up deletes the payment over 2 years old');
select pg_temp.ok(not exists (select 1 from public.bill_payments where task_id = '00000000-0000-0000-0000-0000000138d5')
              and exists (select 1 from public.bill_payments where task_id = '00000000-0000-0000-0000-0000000138d4'),
  '... and keeps the one from last year');
select pg_temp.ok((select schedule = '50 19 * * *' from cron.job where jobname = 'prune-old-bill-payments'),
  'it runs nightly, before the photo clean-up');

-- ---- Export ---------------------------------------------------------------------------
create temp table exported (data jsonb);
grant insert on exported to authenticated;
select pg_temp.ok(pg_temp.err_as(:owner, $q$ insert into exported select public.export_household_data() $q$) = '',
  'an owner exports');
select pg_temp.ok((select jsonb_array_length(data -> 'bill_payments') = 3
                          and data ? 'repair_costs' and data ? 'feedback' and data ? 'chores'
                     from exported),
  'the export has the household''s payments, and everything it had before');
select pg_temp.ok(pg_temp.err_as(:staff, $q$ insert into exported select public.export_household_data() $q$) like '%admins_only%',
  'a staff phone can''t export');

-- ---- Deleting the bill ------------------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:owner, $q$ delete from public.household_tasks where id = '00000000-0000-0000-0000-0000000138d1' $q$) = '',
  'an owner deletes the repeating bill');
select pg_temp.ok(not exists (select 1 from public.bill_payments where series_id = '00000000-0000-0000-0000-0000000138d1'),
  '... and its days'' payments go with it');

-- ---- Grants -----------------------------------------------------------------------------
select pg_temp.ok(
  not exists (
    select 1 from unnest(array[
      'public.bill_payments_server_fields()', 'public.prune_old_bill_payments()',
      'public.repair_receipts_due_for_pruning(text,integer)', 'public.orphaned_household_photos(text,integer)'
    ]) f
    where has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute')
  ), 'no new or replaced function is callable from the API');
select pg_temp.ok(not has_function_privilege('anon', 'public.export_household_data()', 'execute')
              and has_function_privilege('authenticated', 'public.export_household_data()', 'execute'),
  'the export: signed-in callers only (it checks for an owner itself), as before');
select pg_temp.ok(has_function_privilege('service_role', 'public.repair_receipts_due_for_pruning(text,integer)', 'execute'),
  'the Edge Function (service role) can still list receipts');
select pg_temp.ok(not has_table_privilege('anon', 'public.bill_payments', 'select'),
  'the table is closed to logged-out callers');
select pg_temp.ok(
  (select bool_and(proconfig = array['search_path=""']) from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('bill_payments_server_fields', 'prune_old_bill_payments', 'repair_receipts_due_for_pruning',
                      'orphaned_household_photos', 'export_household_data')),
  'every new or replaced function has an empty search_path');

rollback;
