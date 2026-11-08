-- Migration 127 checks: the household download, scheduled deletion and the
-- photo clean-up that follows it. Admins download; only the founder
-- schedules (or any admin once no founder is a member); any admin cancels;
-- staff phones, other households and logged-out callers get nothing; the job
-- deletes every kind of row and nothing of other households; the photo
-- finder lists only files nobody owns any more.
-- LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/127_household_data_rights.sql
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
-- Runs a statement as someone and returns the error it raised ('' if none).
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

-- Pushes, captured instead of sent (replaced for this transaction only).
create temp table pushes (household uuid, title_en text, body_en text, title_id text, body_id text, url text, excluded uuid);
grant insert on pushes to authenticated;
create or replace function public.queue_owner_push(
  p_household_id uuid, p_title_en text, p_body_en text, p_title_id text, p_body_id text,
  p_url text default '/', p_tag text default null, p_exclude_user_id uuid default null)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  insert into pg_temp.pushes values (p_household_id, p_title_en, p_body_en, p_title_id, p_body_id, p_url, p_exclude_user_id);
  return true;
end $$;

-- Three households.
-- A (f1): founder a1, co-admin a3, staff phone b1, staff Sari (e1).
-- B (f2): admin a2, staff phone b2.
-- C (f3): its founder a5 left; admin a4 remains.
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, anon, now(), now()
from (values
  ('00000000-0000-0000-0000-0000000127a1', 'founder127@test.local', false),
  ('00000000-0000-0000-0000-0000000127a2', 'other127@test.local', false),
  ('00000000-0000-0000-0000-0000000127a3', 'coadmin127@test.local', false),
  ('00000000-0000-0000-0000-0000000127a4', 'left127@test.local', false),
  ('00000000-0000-0000-0000-0000000127a5', 'gone127@test.local', false),
  ('00000000-0000-0000-0000-0000000127b1', null, true),
  ('00000000-0000-0000-0000-0000000127b2', null, true)
) as u(id, email, anon);
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000127f1', 'Rumah Kenanga', '00000000-0000-0000-0000-0000000127a1'),
  ('00000000-0000-0000-0000-0000000127f2', 'Rumah lain', '00000000-0000-0000-0000-0000000127a2'),
  ('00000000-0000-0000-0000-0000000127f3', 'Rumah tiga', '00000000-0000-0000-0000-0000000127a5');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000127f1', '00000000-0000-0000-0000-0000000127a1', 'owner'),
  ('00000000-0000-0000-0000-0000000127f1', '00000000-0000-0000-0000-0000000127a3', 'owner'),
  ('00000000-0000-0000-0000-0000000127f2', '00000000-0000-0000-0000-0000000127a2', 'owner'),
  ('00000000-0000-0000-0000-0000000127f3', '00000000-0000-0000-0000-0000000127a4', 'owner');
insert into public.device_sessions (user_id, household_id) values
  ('00000000-0000-0000-0000-0000000127b1', '00000000-0000-0000-0000-0000000127f1'),
  ('00000000-0000-0000-0000-0000000127b2', '00000000-0000-0000-0000-0000000127f2');
insert into public.staff_profiles (id, household_id, name, pin) values
  ('00000000-0000-0000-0000-0000000127e1', '00000000-0000-0000-0000-0000000127f1', 'Sari', 'pin-hash-must-not-leak'),
  ('00000000-0000-0000-0000-0000000127e2', '00000000-0000-0000-0000-0000000127f2', 'Wati', null);

-- One of everything in A, and a pet in B.
insert into public.task_entities (id, household_id, entity_type, name, metadata) values
  ('00000000-0000-0000-0000-0000000127c1', '00000000-0000-0000-0000-0000000127f1', 'pet', 'Mochi',
   '{"avatar_url": "http://x/storage/v1/object/public/household-logs/00000000-0000-0000-0000-0000000127f1/avatars/mochi.webp"}'),
  ('00000000-0000-0000-0000-0000000127c2', '00000000-0000-0000-0000-0000000127f2', 'pet', 'Bento', '{}');
insert into public.master_schedules (id, entity_id, title, module, frequency_type) values
  ('00000000-0000-0000-0000-0000000127d1', '00000000-0000-0000-0000-0000000127c1', 'Pipis & Pup', 'pet', 'interval');
insert into public.task_logs (entity_id, schedule_id, module, staff_id, photo_url) values
  ('00000000-0000-0000-0000-0000000127c1', '00000000-0000-0000-0000-0000000127d1', 'pet',
   '00000000-0000-0000-0000-0000000127e1',
   'http://x/storage/v1/object/public/household-logs/00000000-0000-0000-0000-0000000127f1/logs/walk.webp'),
  ('00000000-0000-0000-0000-0000000127c2', null, 'pet', null, null);
insert into public.medical_records (entity_id, record_type, title) values
  ('00000000-0000-0000-0000-0000000127c1', 'vaccine', 'Rabies');
insert into public.routine_proposals (pet_id, title, category, time) values
  ('00000000-0000-0000-0000-0000000127c1', 'Jalan sore', 'potty', '17:00');
insert into public.household_locations (id, household_id, name) values
  ('00000000-0000-0000-0000-0000000127b9', '00000000-0000-0000-0000-0000000127f1', 'Dapur');
insert into public.household_tasks (household_id, title, location_id) values
  ('00000000-0000-0000-0000-0000000127f1', 'Bersih kulkas', '00000000-0000-0000-0000-0000000127b9'),
  ('00000000-0000-0000-0000-0000000127f2', 'Sapu teras', null);
insert into public.inventory_items (id, household_id, name, scope, category, unit) values
  ('00000000-0000-0000-0000-0000000127b8', '00000000-0000-0000-0000-0000000127f1', 'Beras', 'home', 'pantry', 'kg');
insert into public.inventory_audit_logs (item_id, quantity_counted) values
  ('00000000-0000-0000-0000-0000000127b8', 3);
insert into public.inventory_alerts (household_id, item_type) values
  ('00000000-0000-0000-0000-0000000127f1', 'other');
insert into public.food_items (household_id, name) values
  ('00000000-0000-0000-0000-0000000127f1', 'Rendang'),
  ('00000000-0000-0000-0000-0000000127f2', 'Lapis legit');
insert into public.leave_requests (household_id, staff_id, start_date, end_date) values
  ('00000000-0000-0000-0000-0000000127f1', '00000000-0000-0000-0000-0000000127e1', current_date, current_date);
insert into public.staff_sign_in_attempts (household_id, staff_id, kind, success) values
  ('00000000-0000-0000-0000-0000000127f1', '00000000-0000-0000-0000-0000000127e1', 'pin', true);
insert into public.staff_invites (household_id, token, expires_at) values
  ('00000000-0000-0000-0000-0000000127f1', 'staff-invite-token-must-not-leak', now() + interval '1 day');
insert into public.owner_invites (household_id, token, expires_at) values
  ('00000000-0000-0000-0000-0000000127f1', 'owner-invite-token-must-not-leak', now() + interval '1 day');
insert into public.household_join_codes (household_id, code) values
  ('00000000-0000-0000-0000-0000000127f1', 'QWERTY')
on conflict (household_id) do update set code = excluded.code;
insert into public.push_subscriptions (user_id, household_id, subscription) values
  ('00000000-0000-0000-0000-0000000127a1', '00000000-0000-0000-0000-0000000127f1',
   '{"endpoint": "https://fcm.googleapis.com/endpoint-must-not-leak", "keys": {"p256dh": "k", "auth": "a"}}');

-- --- Download ---------------------------------------------------------------------
set local role authenticated;
select pg_temp.act('00000000-0000-0000-0000-0000000127a1');
create temp table export_a as select public.export_household_data() as j;
reset role;

select pg_temp.ok((select j->>'format' = 'miamus-household-export/1' from export_a), 'the download says what it is');
select pg_temp.ok((select j->'household'->>'name' = 'Rumah Kenanga' from export_a), 'it is the caller''s own household');
select pg_temp.ok((select
    jsonb_array_length(j->'admins') = 2
    and (select count(*) = 1 from jsonb_array_elements(j->'staff') x where not (x->>'is_admin')::boolean and x->>'name' = 'Sari')
    and jsonb_array_length(j->'staff') = 3 and jsonb_array_length(j->'pets') = 1
    and jsonb_array_length(j->'routines') = 1 and jsonb_array_length(j->'logs') = 1
    and jsonb_array_length(j->'health_records') = 1 and jsonb_array_length(j->'routine_suggestions') = 1
    and jsonb_array_length(j->'chores') = 1 and jsonb_array_length(j->'rooms') = 1
    and jsonb_array_length(j->'supplies') = 1 and jsonb_array_length(j->'stock_counts') = 1
    and jsonb_array_length(j->'shopping_list') = 1 and jsonb_array_length(j->'food') = 1
    and jsonb_array_length(j->'leave') = 1 and jsonb_array_length(j->'linked_phones') = 1
    and jsonb_array_length(j->'staff_sign_in_attempts') = 1
  from export_a), 'every kind of record is there, and only this household''s');
select pg_temp.ok((select j->'logs'->0->>'staff' = 'Sari'
                      and j->'logs'->0->>'photo' = 'household-logs/00000000-0000-0000-0000-0000000127f1/logs/walk.webp'
                   from export_a), 'logs name who did them and which photo');
select pg_temp.ok((select bool_and(position(s in j::text) = 0) from export_a, unnest(array[
    'pin-hash-must-not-leak', 'staff-invite-token-must-not-leak', 'owner-invite-token-must-not-leak',
    'QWERTY', 'endpoint-must-not-leak', 'Lapis legit', 'Bento', 'other127@test.local']) s),
  'none of the secrets or the other household appear anywhere in the file');

select pg_temp.ok(pg_temp.err_as('00000000-0000-0000-0000-0000000127a3', 'select public.export_household_data()') = '',
  'a co-admin can download too');
select pg_temp.ok(pg_temp.err_as('00000000-0000-0000-0000-0000000127b1', 'select public.export_household_data()') = 'admins_only',
  'a staff phone cannot download');
set local role anon;
do $$ begin
  perform public.export_household_data();
  raise exception 'FAIL: anon exported';
exception when insufficient_privilege then null; end $$;
reset role;
select pg_temp.ok(true, 'logged-out callers cannot download');

-- --- Scheduling -------------------------------------------------------------------
select pg_temp.ok(pg_temp.err_as('00000000-0000-0000-0000-0000000127b1',
  'select public.schedule_household_deletion(''Rumah Kenanga'')') = 'admins_only', 'a staff phone cannot schedule');
select pg_temp.ok(pg_temp.err_as('00000000-0000-0000-0000-0000000127b1',
  'select public.household_deletion_status()') = 'admins_only', 'a staff phone cannot see the status');
select pg_temp.ok(pg_temp.err_as('00000000-0000-0000-0000-0000000127a3',
  'select public.schedule_household_deletion(''Rumah Kenanga'')') = 'founder_only', 'a co-admin cannot schedule while the founder is here');
select pg_temp.ok(pg_temp.err_as('00000000-0000-0000-0000-0000000127a1',
  'select public.schedule_household_deletion(''Rumah Kenangan'')') = 'name_mismatch', 'the wrong name is refused');
select pg_temp.ok(pg_temp.err_as('00000000-0000-0000-0000-0000000127a2',
  'select public.schedule_household_deletion(''Rumah Kenanga'')') = 'name_mismatch',
  'another household''s admin only ever reaches their own household');
select pg_temp.ok((select count(*) = 0 from public.household_deletions), 'nothing was scheduled by any of those');

set local role authenticated;
select pg_temp.act('00000000-0000-0000-0000-0000000127a1');
create temp table first_due as select public.schedule_household_deletion('  rumah kenanga ') as at;
create temp table second_due as select public.schedule_household_deletion('Rumah Kenanga') as at;
create temp table status_a as select * from public.household_deletion_status();
reset role;
select pg_temp.ok((select at between now() + interval '7 days' - interval '1 minute' and now() + interval '7 days' + interval '1 minute' from first_due),
  'the founder schedules it, 7 days out (name trimmed, any case)');
select pg_temp.ok((select f.at = s.at from first_due f, second_due s), 'asking twice keeps the first date');
select pg_temp.ok((select scheduled and requested_by_me and can_schedule from status_a), 'the status shows it');
select pg_temp.ok((select count(*) = 1 and bool_and(household = '00000000-0000-0000-0000-0000000127f1'
                     and excluded = '00000000-0000-0000-0000-0000000127a1' and body_id like '%Rumah Kenanga%')
                   from pg_temp.pushes), 'the other admins are told once, in both languages');

select pg_temp.ok(pg_temp.err_as('00000000-0000-0000-0000-0000000127a4',
  'select public.schedule_household_deletion(''Rumah tiga'')') = '', 'with the founder gone, another admin can schedule');

-- Cancelling.
select pg_temp.ok(pg_temp.err_as('00000000-0000-0000-0000-0000000127b1',
  'select public.cancel_household_deletion()') = 'admins_only', 'a staff phone cannot cancel');
set local role authenticated;
select pg_temp.act('00000000-0000-0000-0000-0000000127a3');
select pg_temp.ok(public.cancel_household_deletion(), 'a co-admin can cancel');
select pg_temp.ok(not public.cancel_household_deletion(), 'cancelling twice is harmless');
reset role;
select pg_temp.ok((select count(*) = 0 from public.household_deletions where household_id = '00000000-0000-0000-0000-0000000127f1'),
  'the schedule is gone');

-- --- The job ----------------------------------------------------------------------
insert into public.household_deletions (household_id, requested_by, delete_after) values
  ('00000000-0000-0000-0000-0000000127f1', '00000000-0000-0000-0000-0000000127a1', now() - interval '1 minute');
update public.household_deletions set delete_after = now() + interval '3 days'
 where household_id = '00000000-0000-0000-0000-0000000127f3';
select set_config('request.jwt.claims', '', true);
select pg_temp.ok(public.delete_scheduled_households() = 1, 'the job deletes only households past their date');
select pg_temp.ok((select count(*) = 0 from public.households where id = '00000000-0000-0000-0000-0000000127f1'), 'A is gone');
select pg_temp.ok((select count(*) = 1 from public.households where id = '00000000-0000-0000-0000-0000000127f3'), 'C, not yet due, stays');
select pg_temp.ok((select
    (select count(*) from public.task_entities where household_id = '00000000-0000-0000-0000-0000000127f1')
  + (select count(*) from public.master_schedules where id = '00000000-0000-0000-0000-0000000127d1')
  + (select count(*) from public.task_logs where entity_id = '00000000-0000-0000-0000-0000000127c1')
  + (select count(*) from public.medical_records where entity_id = '00000000-0000-0000-0000-0000000127c1')
  + (select count(*) from public.routine_proposals where pet_id = '00000000-0000-0000-0000-0000000127c1')
  + (select count(*) from public.household_tasks where household_id = '00000000-0000-0000-0000-0000000127f1')
  + (select count(*) from public.household_locations where household_id = '00000000-0000-0000-0000-0000000127f1')
  + (select count(*) from public.inventory_items where household_id = '00000000-0000-0000-0000-0000000127f1')
  + (select count(*) from public.inventory_audit_logs where item_id = '00000000-0000-0000-0000-0000000127b8')
  + (select count(*) from public.inventory_alerts where household_id = '00000000-0000-0000-0000-0000000127f1')
  + (select count(*) from public.food_items where household_id = '00000000-0000-0000-0000-0000000127f1')
  + (select count(*) from public.leave_requests where household_id = '00000000-0000-0000-0000-0000000127f1')
  + (select count(*) from public.staff_sign_in_attempts where household_id = '00000000-0000-0000-0000-0000000127f1')
  + (select count(*) from public.staff_profiles where household_id = '00000000-0000-0000-0000-0000000127f1')
  + (select count(*) from public.household_members where household_id = '00000000-0000-0000-0000-0000000127f1')
  + (select count(*) from public.device_sessions where household_id = '00000000-0000-0000-0000-0000000127f1')
  + (select count(*) from public.push_subscriptions where household_id = '00000000-0000-0000-0000-0000000127f1')
  + (select count(*) from public.staff_invites where household_id = '00000000-0000-0000-0000-0000000127f1')
  + (select count(*) from public.owner_invites where household_id = '00000000-0000-0000-0000-0000000127f1')
  + (select count(*) from public.household_join_codes where household_id = '00000000-0000-0000-0000-0000000127f1')
  + (select count(*) from public.household_deletions where household_id = '00000000-0000-0000-0000-0000000127f1')
  = 0), 'every kind of row in A is gone, the schedule with it');
select pg_temp.ok((select
    (select count(*) from public.task_entities where household_id = '00000000-0000-0000-0000-0000000127f2') = 1
    and (select count(*) from public.task_logs where entity_id = '00000000-0000-0000-0000-0000000127c2') = 1
    and (select count(*) from public.food_items where household_id = '00000000-0000-0000-0000-0000000127f2') = 1
    and (select count(*) from public.household_tasks where household_id = '00000000-0000-0000-0000-0000000127f2') = 1
    and (select count(*) from public.device_sessions where household_id = '00000000-0000-0000-0000-0000000127f2') = 1),
  'household B is untouched');
select pg_temp.ok((select count(*) = 2 from auth.users where id in
    ('00000000-0000-0000-0000-0000000127a1', '00000000-0000-0000-0000-0000000127a3')),
  'the admins'' Google sign-ins stay (deleting an account is separate)');
select pg_temp.ok((select count(*) = 0 from public.device_sessions where user_id = '00000000-0000-0000-0000-0000000127b1'),
  'A''s staff phone is unlinked, so the nightly phone clean-up (121) will remove it');

-- --- Photos of deleted households -------------------------------------------------
create temp table secret as
  select coalesce(
    (select decrypted_secret from vault.decrypted_secrets where name = 'task_photo_retention_secret'),
    'test-secret-127') as s;
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'task_photo_retention_secret') then
    perform vault.create_secret('test-secret-127', 'task_photo_retention_secret', 'test');
  end if;
end $$;

set local session_replication_role = replica;
insert into storage.objects (bucket_id, name, created_at, metadata) values
  ('household-logs',   '00000000-0000-0000-0000-0000000127f1/logs/walk.webp',     now() - interval '2 days', '{"size": 1}'),
  ('inventory_audits', '00000000-0000-0000-0000-0000000127f1/stock/beras.webp',   now() - interval '2 days', '{"size": 1}'),
  ('household-logs',   '00000000-0000-0000-0000-0000000127f2/logs/bento.webp',    now() - interval '2 days', '{"size": 1}'),
  ('household-logs',   '00000000-0000-0000-0000-0000000127f3/logs/tiga.webp',     now() - interval '2 days', '{"size": 1}'),
  -- A deleted household's file that a live row (in B) still points at.
  ('household-logs',   '00000000-0000-0000-0000-0000000127f1/logs/shared.webp',   now() - interval '2 days', '{"size": 1}'),
  -- An old upload with no household folder: the legacy household owns it.
  ('household-logs',   'legacy-127/old.webp',                                     now() - interval '2 days', '{"size": 1}'),
  -- Not one of our buckets.
  ('avatars-127',      '00000000-0000-0000-0000-0000000127f1/x.webp',             now() - interval '2 days', '{"size": 1}');
set local session_replication_role = origin;
update public.task_logs
   set photo_url = 'http://x/storage/v1/object/public/household-logs/00000000-0000-0000-0000-0000000127f1/logs/shared.webp'
 where entity_id = '00000000-0000-0000-0000-0000000127c2';

create temp table orphans as
  select * from public.orphaned_household_photos((select s from secret), 1000);
select pg_temp.ok((select count(*) = 1 from orphans where bucket_id = 'household-logs'
                     and name = '00000000-0000-0000-0000-0000000127f1/logs/walk.webp')
                  and (select count(*) = 1 from orphans where bucket_id = 'inventory_audits'
                     and name = '00000000-0000-0000-0000-0000000127f1/stock/beras.webp'),
  'the deleted household''s files are listed, in both buckets');
select pg_temp.ok((select count(*) = 0 from orphans where name like '00000000-0000-0000-0000-0000000127f2/%'
                     or name like '00000000-0000-0000-0000-0000000127f3/%'),
  'live households'' files never are');
select pg_temp.ok((select count(*) = 0 from orphans where name like '%/shared.webp'),
  'a file a live row still points at never is');
select pg_temp.ok((select count(*) = 0 from orphans where bucket_id = 'avatars-127'), 'other buckets are left alone');
select pg_temp.ok(
  (select count(*) from orphans where name = 'legacy-127/old.webp') =
  (case when exists (select 1 from public.households where id = '975f0914-4d0d-43ad-8dee-a967d9bd10cd') then 0 else 1 end),
  'files with no household folder go only once the legacy household is gone');

do $$ begin
  perform * from public.orphaned_household_photos('wrong', 10);
  raise exception 'FAIL: wrong secret accepted';
exception when insufficient_privilege then null; end $$;
select pg_temp.ok(true, 'the photo finder refuses a wrong secret');

-- --- Grants -----------------------------------------------------------------------
select pg_temp.ok(not has_function_privilege('anon', f, 'execute'), format('anon cannot call %s', f))
from unnest(array['public.export_household_data()', 'public.household_deletion_status()',
                  'public.schedule_household_deletion(text)', 'public.cancel_household_deletion()',
                  'public.delete_scheduled_households()', 'public.orphaned_household_photos(text,integer)',
                  'public.household_deletion_date_label(timestamp with time zone,text)']) as f;
select pg_temp.ok(not has_function_privilege('authenticated', f, 'execute'), format('signed-in callers cannot call %s', f))
from unnest(array['public.delete_scheduled_households()', 'public.orphaned_household_photos(text,integer)',
                  'public.household_deletion_date_label(timestamp with time zone,text)']) as f;
select pg_temp.ok(has_function_privilege('authenticated', f, 'execute'), format('signed-in callers can call %s', f))
from unnest(array['public.export_household_data()', 'public.household_deletion_status()',
                  'public.schedule_household_deletion(text)', 'public.cancel_household_deletion()']) as f;
select pg_temp.ok(not has_function_privilege('public', f, 'execute'), format('PUBLIC has no grant on %s', f))
from unnest(array['public.export_household_data()', 'public.household_deletion_status()',
                  'public.schedule_household_deletion(text)', 'public.cancel_household_deletion()',
                  'public.delete_scheduled_households()', 'public.orphaned_household_photos(text,integer)']) as f;
select pg_temp.ok(not has_table_privilege(r, 'public.household_deletions', p), format('%s cannot %s household_deletions', r, p))
from unnest(array['anon', 'authenticated']) r, unnest(array['select', 'insert', 'update', 'delete']) p;
select pg_temp.ok((select count(*) = 1 from cron.job where jobname = 'delete-scheduled-households' and schedule = '5 * * * *'),
  'the deletion job runs hourly');

-- --- Cascade guard: new household tables must go with their household -------------
select pg_temp.ok(
  not exists (
    select 1 from pg_constraint c
    where c.contype = 'f' and c.confrelid = 'public.households'::regclass and c.confdeltype <> 'c'
  ), 'every foreign key to households is ON DELETE CASCADE');
select pg_temp.ok(
  not exists (
    select 1 from information_schema.columns col
    where col.table_schema = 'public' and col.column_name = 'household_id'
      and col.table_name not in (select table_name from information_schema.views where table_schema = 'public')
      and not exists (
        select 1 from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
        where c.contype = 'f' and c.conrelid = format('public.%I', col.table_name)::regclass
          and c.confrelid = 'public.households'::regclass and a.attname = 'household_id'
      )
      -- household_tasks.household_id also points at household_locations, and
      -- at households through its own key.
  ), 'every household_id column is a foreign key to households');

rollback;
