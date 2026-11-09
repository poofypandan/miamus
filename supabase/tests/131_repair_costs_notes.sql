-- Migration 131 checks: cost and receipt for owners only (table and bucket),
-- notes for the household with a 5-minute take-back, the warranty date,
-- photo retention for notes and receipts, the deleted-household sweep, the
-- export, and every new or replaced function's grants.
-- LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/131_repair_costs_notes.sql
\set ON_ERROR_STOP on
\pset footer off
begin;

create function pg_temp.ok(cond boolean, label text) returns text language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  return 'ok  ' || label;
end $$;
create function pg_temp.err_as(uid uuid, stmt text) returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
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

insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, anon, now(), now()
from (values
  ('00000000-0000-0000-0000-0000000131a1', 'owner131@test.local', false),
  ('00000000-0000-0000-0000-0000000131a2', 'other131@test.local', false),
  ('00000000-0000-0000-0000-0000000131b1', null, true),
  ('00000000-0000-0000-0000-0000000131b2', null, true)
) as u(id, email, anon);
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000131f1', 'Rumah Kamboja', '00000000-0000-0000-0000-0000000131a1'),
  ('00000000-0000-0000-0000-0000000131f2', 'Rumah lain', '00000000-0000-0000-0000-0000000131a2');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000131f1', '00000000-0000-0000-0000-0000000131a1', 'owner'),
  ('00000000-0000-0000-0000-0000000131f2', '00000000-0000-0000-0000-0000000131a2', 'owner');
insert into public.device_sessions (user_id, household_id) values
  ('00000000-0000-0000-0000-0000000131b1', '00000000-0000-0000-0000-0000000131f1'),
  ('00000000-0000-0000-0000-0000000131b2', '00000000-0000-0000-0000-0000000131f1');
insert into public.staff_profiles (id, household_id, name, archived_at) values
  ('00000000-0000-0000-0000-0000000131e1', '00000000-0000-0000-0000-0000000131f1', 'Sari', null),
  ('00000000-0000-0000-0000-0000000131e2', '00000000-0000-0000-0000-0000000131f1', 'Joko', now()),
  ('00000000-0000-0000-0000-0000000131e3', '00000000-0000-0000-0000-0000000131f2', 'Wati', null);
insert into public.repairs (id, household_id, title, status) values
  ('00000000-0000-0000-0000-0000000131d1', '00000000-0000-0000-0000-0000000131f1', 'AC netes', 'open'),
  ('00000000-0000-0000-0000-0000000131d9', '00000000-0000-0000-0000-0000000131f2', 'Other household', 'open');

\set owner '''00000000-0000-0000-0000-0000000131a1'''
\set other '''00000000-0000-0000-0000-0000000131a2'''
\set staff '''00000000-0000-0000-0000-0000000131b1'''
\set staff2 '''00000000-0000-0000-0000-0000000131b2'''

-- ---- Warranty --------------------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:owner, $q$
  update public.repairs set warranty_until = current_date + 90 where id = '00000000-0000-0000-0000-0000000131d1' $q$) = '',
  'an owner sets a warranty date');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.repairs (household_id, title, status, reported_by_staff, warranty_until)
  values ('00000000-0000-0000-0000-0000000131f1', 'x', 'reported', '00000000-0000-0000-0000-0000000131e1', current_date) $q$)
  like '%repair_staff_report_only%', 'a staff report can''t set one');

-- ---- Cost and receipt: owners only ------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:owner, $q$
  insert into public.repair_costs (repair_id, household_id, amount_idr, receipt_url, note, created_by)
  values ('00000000-0000-0000-0000-0000000131d1', '00000000-0000-0000-0000-0000000131f1', 350000,
          'http://x/storage/v1/object/public/owner-receipts/00000000-0000-0000-0000-0000000131f1/r.webp', '  Ganti kapasitor ',
          '00000000-0000-0000-0000-0000000131a2') $q$) = '', 'an owner records what it cost');
select pg_temp.ok((select amount_idr = 350000 and note = 'Ganti kapasitor' and created_by = '00000000-0000-0000-0000-0000000131a1'
                   from public.repair_costs where repair_id = '00000000-0000-0000-0000-0000000131d1'),
  'the server trims the note and decides who wrote it');
select pg_temp.ok(pg_temp.count_as(:staff, $q$ select count(*) from public.repair_costs $q$) = 0,
  'a staff phone can''t read costs');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.repair_costs (repair_id, household_id, amount_idr)
  values ('00000000-0000-0000-0000-0000000131d1', '00000000-0000-0000-0000-0000000131f1', 1) $q$) <> '',
  'nor write them');
select pg_temp.ok(pg_temp.count_as(:other, $q$ select count(*) from public.repair_costs $q$) = 0,
  'another household''s owner sees none');
select pg_temp.ok(pg_temp.err_as(:owner, $q$
  insert into public.repair_costs (repair_id, household_id, amount_idr)
  values ('00000000-0000-0000-0000-0000000131d9', '00000000-0000-0000-0000-0000000131f1', 1) $q$) <> '',
  'a cost can''t point at another household''s repair');
select pg_temp.ok(pg_temp.err_as(:owner, $q$
  update public.repair_costs set amount_idr = -1 where repair_id = '00000000-0000-0000-0000-0000000131d1' $q$) <> '',
  'a cost is never negative');
select pg_temp.ok(not has_table_privilege('anon', 'public.repair_costs', 'select'), 'logged-out callers get no costs');

-- The bucket: owners of the household in the path, nobody else.
select set_config('request.jwt.claims', '', true);
insert into storage.objects (bucket_id, name, owner_id) values
  ('owner-receipts', '00000000-0000-0000-0000-0000000131f1/00000000-0000-0000-0000-0000000131d1/r.webp', null);
select pg_temp.ok((select public = false from storage.buckets where id = 'owner-receipts'), 'the receipts bucket is private');
select pg_temp.ok(pg_temp.count_as(:owner, $q$ select count(*) from storage.objects where bucket_id = 'owner-receipts' $q$) = 1,
  'an owner sees their receipt');
select pg_temp.ok(pg_temp.count_as(:staff, $q$ select count(*) from storage.objects where bucket_id = 'owner-receipts' $q$) = 0,
  'a staff phone can''t list or read receipts');
select pg_temp.ok(pg_temp.count_as(:other, $q$ select count(*) from storage.objects where bucket_id = 'owner-receipts' $q$) = 0,
  'nor can another household''s owner');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into storage.objects (bucket_id, name) values ('owner-receipts', '00000000-0000-0000-0000-0000000131f1/x/staff.webp') $q$) <> '',
  'a staff phone can''t upload a receipt');
select pg_temp.ok(pg_temp.err_as(:other, $q$
  insert into storage.objects (bucket_id, name) values ('owner-receipts', '00000000-0000-0000-0000-0000000131f1/x/other.webp') $q$) <> '',
  'nor another household''s owner into this one');
select pg_temp.ok(pg_temp.err_as(:owner, $q$
  insert into storage.objects (bucket_id, name) values ('owner-receipts', '00000000-0000-0000-0000-0000000131f1/x/mine.webp') $q$) = '',
  'an owner uploads one');
-- Deletes go through the Storage API (storage.protect_delete refuses SQL),
-- so check the rule itself: owners of the household only.
select pg_temp.ok(
  (select count(*) = 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
     and cmd = 'DELETE' and qual like '%owner-receipts%')
  and (select qual like '%household_members%' and qual not like '%get_user_household_ids%' from pg_policies
        where schemaname = 'storage' and tablename = 'objects' and policyname = 'owner_delete_owner_receipts'),
  'only owners of the household may delete receipts');

-- ---- Notes: the household's, taken back within 5 minutes ---------------------------
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.repair_notes (id, household_id, repair_id, body, staff_id, created_at)
  values ('00000000-0000-0000-0000-000000013101', '00000000-0000-0000-0000-0000000131f1', '00000000-0000-0000-0000-0000000131d1',
          '  Tukang perlu beli kapasitor, datang lagi Kamis ', '00000000-0000-0000-0000-0000000131e1', '2000-01-01') $q$) = '',
  'a staff phone adds a note');
select pg_temp.ok((select body = 'Tukang perlu beli kapasitor, datang lagi Kamis' and created_by = '00000000-0000-0000-0000-0000000131b1'
                     and created_at > now() - interval '1 minute'
                   from public.repair_notes where id = '00000000-0000-0000-0000-000000013101'),
  'trimmed, and stamped by the server');
select pg_temp.ok(pg_temp.err_as(:owner, $q$
  insert into public.repair_notes (id, household_id, repair_id, body)
  values ('00000000-0000-0000-0000-000000013102', '00000000-0000-0000-0000-0000000131f1', '00000000-0000-0000-0000-0000000131d1', 'Oke') $q$) = '',
  'an owner replies');
select pg_temp.ok(pg_temp.count_as(:staff2, $q$ select count(*) from public.repair_notes $q$) = 2, 'everyone in the household reads them');
select pg_temp.ok(pg_temp.count_as(:other, $q$ select count(*) from public.repair_notes $q$) = 0, 'another household doesn''t');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.repair_notes (household_id, repair_id, body, staff_id)
  values ('00000000-0000-0000-0000-0000000131f1', '00000000-0000-0000-0000-0000000131d1', 'x', '00000000-0000-0000-0000-0000000131e2') $q$)
  like '%staff_archived%', 'someone removed can''t write notes');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.repair_notes (household_id, repair_id, body)
  values ('00000000-0000-0000-0000-0000000131f1', '00000000-0000-0000-0000-0000000131d9', 'x') $q$) <> '',
  'a note can''t go on another household''s repair');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.repair_notes (household_id, repair_id, body)
  values ('00000000-0000-0000-0000-0000000131f1', '00000000-0000-0000-0000-0000000131d1', '   ') $q$) <> '',
  'a note says something');
select pg_temp.ok(pg_temp.count_as(:staff, $q$
  with u as (update public.repair_notes set body = 'changed' returning 1) select count(*) from u $q$) = 0,
  'nobody edits a note');
select pg_temp.ok(pg_temp.count_as(:staff2, $q$
  with d as (delete from public.repair_notes where id = '00000000-0000-0000-0000-000000013101' returning 1) select count(*) from d $q$) = 0,
  'another phone can''t take someone''s note back');
select pg_temp.ok(pg_temp.count_as(:staff, $q$
  with d as (delete from public.repair_notes where id = '00000000-0000-0000-0000-000000013102' returning 1) select count(*) from d $q$) = 0,
  'a staff phone can''t delete an owner''s note');
select set_config('request.jwt.claims', '', true);
set local session_replication_role = replica;
update public.repair_notes set created_at = now() - interval '6 minutes' where id = '00000000-0000-0000-0000-000000013101';
set local session_replication_role = origin;
select pg_temp.ok(pg_temp.count_as(:staff, $q$
  with d as (delete from public.repair_notes where id = '00000000-0000-0000-0000-000000013101' returning 1) select count(*) from d $q$) = 0,
  'its author can''t take it back after 5 minutes');
select pg_temp.ok(pg_temp.count_as(:owner, $q$
  with d as (delete from public.repair_notes where id = '00000000-0000-0000-0000-000000013101' returning 1) select count(*) from d $q$) = 1,
  'an owner can delete any note');

-- ---- Photos and receipts kept as long as their repair ------------------------------
select set_config('request.jwt.claims', '', true);
set local session_replication_role = replica;
insert into storage.objects (bucket_id, name, created_at, metadata) values
  ('household-logs', '00000000-0000-0000-0000-0000000131f1/repairs/notes/open.webp', now() - interval '400 days', '{"size": 1}'),
  ('household-logs', '00000000-0000-0000-0000-0000000131f1/repairs/notes/old.webp',  now() - interval '900 days', '{"size": 1}'),
  ('owner-receipts', '00000000-0000-0000-0000-0000000131f1/open.webp',    now() - interval '400 days', '{"size": 1}'),
  ('owner-receipts', '00000000-0000-0000-0000-0000000131f1/old.webp',     now() - interval '900 days', '{"size": 1}'),
  ('owner-receipts', '00000000-0000-0000-0000-0000000131f1/orphan.webp',  now() - interval '3 days',   '{"size": 1}'),
  ('owner-receipts', '00000000-0000-0000-0000-0000000131f1/fresh.webp',   now() - interval '1 hour',   '{"size": 1}');
insert into public.repairs (id, household_id, title, status, closed_at) values
  ('00000000-0000-0000-0000-0000000131d2', '00000000-0000-0000-0000-0000000131f1', 'Old', 'fixed', now() - interval '900 days');
insert into public.repair_notes (household_id, repair_id, body, photo_url) values
  ('00000000-0000-0000-0000-0000000131f1', '00000000-0000-0000-0000-0000000131d1', 'open',
   'http://x/storage/v1/object/public/household-logs/00000000-0000-0000-0000-0000000131f1/repairs/notes/open.webp'),
  ('00000000-0000-0000-0000-0000000131f1', '00000000-0000-0000-0000-0000000131d2', 'old',
   'http://x/storage/v1/object/public/household-logs/00000000-0000-0000-0000-0000000131f1/repairs/notes/old.webp');
update public.repair_costs set receipt_url = 'http://x/storage/v1/object/public/owner-receipts/00000000-0000-0000-0000-0000000131f1/open.webp'
 where repair_id = '00000000-0000-0000-0000-0000000131d1';
insert into public.repair_costs (repair_id, household_id, receipt_url) values
  ('00000000-0000-0000-0000-0000000131d2', '00000000-0000-0000-0000-0000000131f1',
   'http://x/storage/v1/object/public/owner-receipts/00000000-0000-0000-0000-0000000131f1/old.webp');
set local session_replication_role = origin;

create temp table secret as
  select coalesce(
    (select decrypted_secret from vault.decrypted_secrets where name = 'task_photo_retention_secret'),
    'test-secret-131') as s;
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'task_photo_retention_secret') then
    perform vault.create_secret('test-secret-131', 'task_photo_retention_secret', 'test');
  end if;
end $$;
select pg_temp.ok((select array_agg(name order by name) from public.task_photos_due_for_pruning((select s from secret), 1000)
                    where name like '00000000-0000-0000-0000-0000000131f1/repairs/notes/%')
                  = array['00000000-0000-0000-0000-0000000131f1/repairs/notes/old.webp'],
  'a note''s photo goes 2 years after its repair closes, never while it''s open');
select pg_temp.ok((select array_agg(name order by name) from public.repair_receipts_due_for_pruning((select s from secret), 1000)
                    where name like '00000000-0000-0000-0000-0000000131f1/%')
                  = array['00000000-0000-0000-0000-0000000131f1/old.webp', '00000000-0000-0000-0000-0000000131f1/orphan.webp'],
  'receipts due: a closed-over-2-years repair''s, and ones no cost points at after a day — not an open repair''s or a fresh upload');
do $$ begin
  perform public.repair_receipts_due_for_pruning('wrong', 10);
  raise exception 'FAIL: wrong secret accepted';
exception when insufficient_privilege then null; end $$;
select pg_temp.ok(true, 'the receipts clean-up refuses a wrong secret');

-- Deleting a repair takes its cost and notes with it.
select pg_temp.ok(pg_temp.err_as(:owner, $q$ delete from public.repairs where id = '00000000-0000-0000-0000-0000000131d1' $q$) = '',
  'an owner deletes a repair');
select pg_temp.ok(not exists (select 1 from public.repair_costs where repair_id = '00000000-0000-0000-0000-0000000131d1')
                  and not exists (select 1 from public.repair_notes where repair_id = '00000000-0000-0000-0000-0000000131d1'),
  'its cost and notes go with it');
select pg_temp.ok((select count(*) = 1 from public.repair_receipts_due_for_pruning((select s from secret), 1000)
                    where name = '00000000-0000-0000-0000-0000000131f1/open.webp'),
  'and its receipt is due');

-- The deleted-household sweep covers receipts.
select pg_temp.ok(exists (select 1 from pg_proc where proname = 'orphaned_household_photos'
                           and prosrc like '%owner-receipts%'), 'the deleted-household sweep includes receipts');

-- ---- Export -------------------------------------------------------------------------
create temp table exported (data jsonb);
grant insert on exported to authenticated;
select pg_temp.ok(pg_temp.err_as(:owner, $q$ insert into exported select public.export_household_data() $q$) = '', 'an owner exports');
select pg_temp.ok((select data ? 'repair_costs' and data ? 'repair_notes' and jsonb_array_length(data -> 'repair_costs') = 1 from exported),
  'the export has costs and notes');

-- ---- Grants -------------------------------------------------------------------------
select pg_temp.ok(
  not exists (
    select 1 from unnest(array[
      'public.repairs_guard()', 'public.repair_costs_server_fields()', 'public.repair_notes_guard()',
      'public.task_photos_due_for_pruning(text,integer)', 'public.repair_receipts_due_for_pruning(text,integer)',
      'public.orphaned_household_photos(text,integer)'
    ]) f
    where has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute')
  ), 'no new or replaced function is callable from the API');
select pg_temp.ok(has_function_privilege('service_role', 'public.repair_receipts_due_for_pruning(text,integer)', 'execute'),
  'the Edge Function (service role) can list receipts');
select pg_temp.ok(
  (select bool_and(proconfig = array['search_path=""']) from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('repairs_guard', 'repair_costs_server_fields', 'repair_notes_guard', 'task_photos_due_for_pruning',
                      'repair_receipts_due_for_pruning', 'orphaned_household_photos', 'export_household_data')),
  'every new or replaced function has an empty search_path');

rollback;
