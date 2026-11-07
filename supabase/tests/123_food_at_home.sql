-- Migration 123 checks: food at home. Owners and staff phones add, edit and
-- finish; only admins delete; the server stamps its own fields; other
-- households and logged-out callers see nothing; the nightly clean-ups pick
-- the right photos and rows; no client can call the maintenance functions.
-- LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/123_food_at_home.sql
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

-- Two households. A: admin a1, staff phone b1, staff Sari (e1), removed Joko
-- (e2). B: admin a2 and staff Wati (e3).
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000123a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin123@test.local', false, now(), now()),
  ('00000000-0000-0000-0000-0000000123a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other123@test.local', false, now(), now()),
  ('00000000-0000-0000-0000-0000000123b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now(), now());
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000123f1', 'Rumah 123', '00000000-0000-0000-0000-0000000123a1'),
  ('00000000-0000-0000-0000-0000000123f2', 'Rumah lain', '00000000-0000-0000-0000-0000000123a2');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000123f1', '00000000-0000-0000-0000-0000000123a1', 'owner'),
  ('00000000-0000-0000-0000-0000000123f2', '00000000-0000-0000-0000-0000000123a2', 'owner');
insert into public.device_sessions (user_id, household_id)
values ('00000000-0000-0000-0000-0000000123b1', '00000000-0000-0000-0000-0000000123f1');
insert into public.staff_profiles (id, household_id, name, archived_at) values
  ('00000000-0000-0000-0000-0000000123e1', '00000000-0000-0000-0000-0000000123f1', 'Sari', null),
  ('00000000-0000-0000-0000-0000000123e2', '00000000-0000-0000-0000-0000000123f1', 'Joko', now()),
  ('00000000-0000-0000-0000-0000000123e3', '00000000-0000-0000-0000-0000000123f2', 'Wati', null);

-- Owner pushes, captured instead of sent (replaced for this transaction only).
create temp table pushes (household uuid, title_en text, body_en text, title_id text, body_id text, url text);
grant insert on pushes to authenticated;
create or replace function public.queue_owner_push(
  p_household_id uuid, p_title_en text, p_body_en text, p_title_id text, p_body_id text,
  p_url text default '/', p_tag text default null, p_exclude_user_id uuid default null)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  insert into pg_temp.pushes values (p_household_id, p_title_en, p_body_en, p_title_id, p_body_id, p_url);
  return true;
end $$;

-- --- Adding ---------------------------------------------------------------------
set local role authenticated;
select pg_temp.act('00000000-0000-0000-0000-0000000123a1');
insert into public.food_items (id, household_id, name, kept_in, expires_on, from_whom, return_container, created_by, created_at)
values ('00000000-0000-0000-0000-0000000123d1', '00000000-0000-0000-0000-0000000123f1', '  Lapis legit ', 'counter',
        current_date + 1, 'Tante Rina', true, '00000000-0000-0000-0000-0000000123a2', '2000-01-01');
reset role;
select pg_temp.ok((select name = 'Lapis legit' and created_by = '00000000-0000-0000-0000-0000000123a1'
                          and created_at > now() - interval '1 minute' and finished_at is null
                     from public.food_items where id = '00000000-0000-0000-0000-0000000123d1'),
  'an owner adds food; the server sets who and when, and trims the name');

set local role authenticated;
select pg_temp.act('00000000-0000-0000-0000-0000000123b1');
insert into public.food_items (id, household_id, name, kept_in, added_by)
values ('00000000-0000-0000-0000-0000000123d2', '00000000-0000-0000-0000-0000000123f1', 'Rendang', 'fridge',
        '00000000-0000-0000-0000-0000000123e1');
select pg_temp.ok((select count(*) = 2 from public.food_items), 'a staff phone adds food and sees the household''s list');
reset role;
select pg_temp.ok((select count(*) = 1 from pg_temp.pushes), 'only the staff phone''s food told the owners, not the owner''s own');
select pg_temp.ok((select body_en = 'Sari: Rendang, in the fridge.' and body_id = 'Sari: Rendang, di kulkas.'
                          and title_en = 'Food came in' and title_id = 'Makanan masuk'
                     from pg_temp.pushes),
  'owners hear who logged what, and where, in both languages');
set local role authenticated;
select pg_temp.act('00000000-0000-0000-0000-0000000123b1');

do $$ begin
  insert into public.food_items (household_id, name, added_by)
  values ('00000000-0000-0000-0000-0000000123f1', 'Kue', '00000000-0000-0000-0000-0000000123e2');
  raise exception 'FAIL: added in a removed person''s name';
exception when insufficient_privilege then null; end $$;
select pg_temp.ok(true, 'not in the name of someone removed (119)');

do $$ begin
  insert into public.food_items (household_id, name, added_by)
  values ('00000000-0000-0000-0000-0000000123f1', 'Kue', '00000000-0000-0000-0000-0000000123e3');
  raise exception 'FAIL: added in another household''s person''s name';
exception when insufficient_privilege then null; end $$;
select pg_temp.ok(true, 'not in the name of another household''s person');

do $$ begin
  insert into public.food_items (household_id, name)
  values ('00000000-0000-0000-0000-0000000123f2', 'Kue');
  raise exception 'FAIL: staff phone added food to another household';
exception when insufficient_privilege then null; end $$;
select pg_temp.ok(true, 'a staff phone cannot add food to another household');

do $$ begin
  insert into public.food_items (household_id, name, kept_in)
  values ('00000000-0000-0000-0000-0000000123f1', 'Kue', 'garage');
  raise exception 'FAIL: odd place accepted';
exception when check_violation then null; end $$;
select pg_temp.ok(true, 'only fridge, freezer, cupboard or counter');

do $$ begin
  insert into public.food_items (household_id, name) values ('00000000-0000-0000-0000-0000000123f1', '   ');
  raise exception 'FAIL: no name and no photo accepted';
exception when check_violation then null; end $$;
select pg_temp.ok(true, 'a name or a photo is required');

insert into public.food_items (id, household_id, name, photo_url, expiry_unknown, source, added_by)
values ('00000000-0000-0000-0000-0000000123d3', '00000000-0000-0000-0000-0000000123f1', ' ',
        'http://x/storage/v1/object/public/household-logs/00000000-0000-0000-0000-0000000123f1/food/p.webp',
        true, 'gift', '00000000-0000-0000-0000-0000000123e1');
reset role;
select pg_temp.ok((select body_id = 'Sari: Makanan (foto), di kulkas, cek tanggalnya.' from pg_temp.pushes
                    order by ctid desc limit 1),
  'a photo-only food with an unknown date says so in the push');
set local role authenticated;
select pg_temp.act('00000000-0000-0000-0000-0000000123b1');
select pg_temp.ok((select name is null and expiry_unknown and source = 'gift'
                     from public.food_items where id = '00000000-0000-0000-0000-0000000123d3'),
  'a staff phone logs food with just a photo and "don''t know" for the date (the owner push never blocks it)');
update public.food_items set expires_on = current_date + 3 where id = '00000000-0000-0000-0000-0000000123d3';
select pg_temp.ok((select not expiry_unknown from public.food_items where id = '00000000-0000-0000-0000-0000000123d3'),
  'setting a date answers "don''t know"');

do $$ begin
  insert into public.food_items (household_id, name, source) values ('00000000-0000-0000-0000-0000000123f1', 'Kue', 'stolen');
  raise exception 'FAIL: odd source accepted';
exception when check_violation then null; end $$;
select pg_temp.ok(true, 'only cooked at home, from someone or bought');

-- --- Editing and finishing (staff phone) ---------------------------------------
update public.food_items set kept_in = 'freezer', notes = 'Potong dulu'
 where id = '00000000-0000-0000-0000-0000000123d2';
select pg_temp.ok((select kept_in = 'freezer' from public.food_items where id = '00000000-0000-0000-0000-0000000123d2'),
  'a staff phone moves food to the freezer');

update public.food_items set outcome = 'eaten', finished_by = '00000000-0000-0000-0000-0000000123e1',
       finished_at = '2000-01-01'
 where id = '00000000-0000-0000-0000-0000000123d1';
reset role;
select pg_temp.ok((select outcome = 'eaten' and finished_at > now() - interval '1 minute'
                          and finished_by = '00000000-0000-0000-0000-0000000123e1'
                     from public.food_items where id = '00000000-0000-0000-0000-0000000123d1'),
  'a staff phone marks it eaten; the server stamps the time, not the phone');

set local role authenticated;
select pg_temp.act('00000000-0000-0000-0000-0000000123b1');
update public.food_items set container_returned_at = '2000-01-01'
 where id = '00000000-0000-0000-0000-0000000123d1';
reset role;
select pg_temp.ok((select container_returned_at > now() - interval '1 minute'
                     from public.food_items where id = '00000000-0000-0000-0000-0000000123d1'),
  'the container is ticked returned, with the server''s clock');

set local role authenticated;
select pg_temp.act('00000000-0000-0000-0000-0000000123b1');
update public.food_items set outcome = null where id = '00000000-0000-0000-0000-0000000123d1';
reset role;
select pg_temp.ok((select outcome is null and finished_at is null and finished_by is null
                     from public.food_items where id = '00000000-0000-0000-0000-0000000123d1'),
  'undo puts it back on the list');

set local role authenticated;
select pg_temp.act('00000000-0000-0000-0000-0000000123b1');
do $$ begin
  update public.food_items set household_id = '00000000-0000-0000-0000-0000000123f2'
   where id = '00000000-0000-0000-0000-0000000123d2';
  raise exception 'FAIL: staff phone moved food to another household';
exception when insufficient_privilege then null; end $$;
select pg_temp.ok(true, 'a staff phone cannot move food to another household');

do $$ begin
  update public.food_items set finished_by = '00000000-0000-0000-0000-0000000123e2', outcome = 'thrown_away'
   where id = '00000000-0000-0000-0000-0000000123d2';
  raise exception 'FAIL: finished in a removed person''s name';
exception when insufficient_privilege then null; end $$;
select pg_temp.ok(true, 'not finished in the name of someone removed');

-- --- Deleting --------------------------------------------------------------------
delete from public.food_items where id = '00000000-0000-0000-0000-0000000123d2';
reset role;
select pg_temp.ok((select count(*) = 1 from public.food_items where id = '00000000-0000-0000-0000-0000000123d2'),
  'a staff phone cannot delete food');

set local role authenticated;
select pg_temp.act('00000000-0000-0000-0000-0000000123a1');
delete from public.food_items where id = '00000000-0000-0000-0000-0000000123d2';
reset role;
select pg_temp.ok((select count(*) = 0 from public.food_items where id = '00000000-0000-0000-0000-0000000123d2'),
  'an admin deletes food added by mistake');

-- --- Other households and logged-out callers ------------------------------------
set local role authenticated;
select pg_temp.act('00000000-0000-0000-0000-0000000123a2');
select pg_temp.ok((select count(*) = 0 from public.food_items), 'another household sees none of it');
update public.food_items set name = 'Hacked' where id = '00000000-0000-0000-0000-0000000123d1';
delete from public.food_items where id = '00000000-0000-0000-0000-0000000123d1';
reset role;
select pg_temp.ok((select name = 'Lapis legit' from public.food_items where id = '00000000-0000-0000-0000-0000000123d1'),
  'another household''s admin can neither change nor delete it');

set local role anon;
do $$ begin
  perform 1 from public.food_items;
  raise exception 'FAIL: anon read food_items';
exception when insufficient_privilege then null; end $$;
reset role;
select pg_temp.ok(true, 'logged-out callers cannot read the table');

-- No session at all (maintenance, a migration's backfill) is not a staff
-- phone: owners are not told.
create temp table before_count as select count(*) as n from pg_temp.pushes;
insert into public.food_items (household_id, name) values ('00000000-0000-0000-0000-0000000123f1', 'Maintenance row');
select pg_temp.ok((select count(*) from pg_temp.pushes) = (select n from before_count),
  'a row written with no session sends no push');

-- --- Grants on functions -------------------------------------------------------------
select pg_temp.ok(not has_function_privilege(r, f, 'execute'), format('%s cannot call %s', r, f))
from unnest(array['anon', 'authenticated']) as r,
     unnest(array['public.prune_finished_food()', 'public.food_photo_keep_cutoff()',
                  'public.task_photos_due_for_pruning(text,integer)', 'public.forget_missing_task_photos(text)',
                  'public.food_items_server_fields()', 'public.food_items_check_people()',
                  'public.notify_food_from_staff()']) as f;
select pg_temp.ok(has_function_privilege('service_role', 'public.task_photos_due_for_pruning(text,integer)', 'execute')
                  and has_function_privilege('service_role', 'public.forget_missing_task_photos(text)', 'execute')
                  and has_function_privilege('service_role', 'public.prune_finished_food()', 'execute'),
  'the clean-up role can still call them');
select pg_temp.ok((select count(*) = 1 from cron.job where jobname = 'prune-finished-food'),
  'the 90-day clean-up is scheduled');

-- --- The nightly photo clean-up --------------------------------------------------------
-- Set times freely here: triggers off for these rows only.
set local session_replication_role = replica;
insert into storage.objects (bucket_id, name, created_at, metadata) values
  ('household-logs', '00000000-0000-0000-0000-0000000123f1/food/listed.webp',   now() - interval '5 days', '{"size": 1}'),
  ('household-logs', '00000000-0000-0000-0000-0000000123f1/food/finished.webp', now() - interval '5 days', '{"size": 1}'),
  ('household-logs', '00000000-0000-0000-0000-0000000123f1/food/undo.webp',     now() - interval '5 days', '{"size": 1}'),
  ('household-logs', '00000000-0000-0000-0000-0000000123f1/food/orphan.webp',   now() - interval '5 days', '{"size": 1}'),
  ('household-logs', '00000000-0000-0000-0000-0000000123f1/food/saving.webp',   now() - interval '1 hour', '{"size": 1}'),
  ('household-logs', '00000000-0000-0000-0000-0000000123f1/avatars/pet.webp',   now() - interval '5 days', '{"size": 1}'),
  ('household-logs', '00000000-0000-0000-0000-0000000123f1/food/also-pet.webp', now() - interval '5 days', '{"size": 1}'),
  ('household-logs', '00000000-0000-0000-0000-0000000123f1/food/also-chore.webp', now() - interval '5 days', '{"size": 1}'),
  ('household-logs', '00000000-0000-0000-0000-0000000123f1/chores/shared.webp', now() - interval '40 days', '{"size": 1}');
insert into public.task_entities (household_id, entity_type, name, metadata) values
  ('00000000-0000-0000-0000-0000000123f1', 'pet', 'Mochi',
   '{"avatar_url": "http://x/storage/v1/object/public/household-logs/00000000-0000-0000-0000-0000000123f1/food/also-pet.webp"}');
-- A photo an old, finished chore and a listed food share: the chore alone
-- would let it go after 30 days; the food keeps it (Codex review).
insert into public.household_tasks (household_id, title, photo_url, completed_at) values
  ('00000000-0000-0000-0000-0000000123f1', 'Bersih kulkas',
   'http://x/storage/v1/object/public/household-logs/00000000-0000-0000-0000-0000000123f1/chores/shared.webp',
   now() - interval '40 days');
insert into public.food_items (household_id, name, photo_url) values
  ('00000000-0000-0000-0000-0000000123f1', 'Shared',
   'http://x/storage/v1/object/public/household-logs/00000000-0000-0000-0000-0000000123f1/chores/shared.webp');
insert into public.household_tasks (household_id, title, photo_url) values
  ('00000000-0000-0000-0000-0000000123f1', 'Masak',
   'http://x/storage/v1/object/public/household-logs/00000000-0000-0000-0000-0000000123f1/food/also-chore.webp');
insert into public.food_items (household_id, name, photo_url, outcome, finished_at) values
  ('00000000-0000-0000-0000-0000000123f1', 'Listed',   'http://x/storage/v1/object/public/household-logs/00000000-0000-0000-0000-0000000123f1/food/listed.webp', null, null),
  ('00000000-0000-0000-0000-0000000123f1', 'Finished', 'http://x/storage/v1/object/public/household-logs/00000000-0000-0000-0000-0000000123f1/food/finished.webp', 'eaten', now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000123f1', 'Undo',     'http://x/storage/v1/object/public/household-logs/00000000-0000-0000-0000-0000000123f1/food/undo.webp', 'eaten', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-0000000123f1', 'Gone, finished', 'http://x/storage/v1/object/public/household-logs/00000000-0000-0000-0000-0000000123f1/food/missing1.webp', 'eaten', now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000123f1', 'Gone, listed',   'http://x/storage/v1/object/public/household-logs/00000000-0000-0000-0000-0000000123f1/food/missing2.webp', null, null),
  ('00000000-0000-0000-0000-0000000123f1', 'Old',    null, 'thrown_away', now() - interval '91 days'),
  ('00000000-0000-0000-0000-0000000123f1', 'Recent', null, 'given_away',  now() - interval '89 days');
set local session_replication_role = origin;

create temp table secret as
  select coalesce(
    (select decrypted_secret from vault.decrypted_secrets where name = 'task_photo_retention_secret'),
    'test-secret-123') as s;
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'task_photo_retention_secret') then
    perform vault.create_secret('test-secret-123', 'task_photo_retention_secret', 'test');
  end if;
end $$;

create temp table due as
  select name from public.task_photos_due_for_pruning((select s from secret), 1000)
  where name like '00000000-0000-0000-0000-0000000123f1/%';
select pg_temp.ok((select array_agg(name order by name) from due)
                  = array['00000000-0000-0000-0000-0000000123f1/food/finished.webp',
                          '00000000-0000-0000-0000-0000000123f1/food/orphan.webp'],
  'due: food finished over a day ago, and an old photo nothing points at — not listed food, an Undo, a fresh upload, or a photo a pet, an unfinished chore or a listed food still uses (Codex review)');

do $$ begin
  perform public.task_photos_due_for_pruning('wrong', 10);
  raise exception 'FAIL: wrong secret accepted';
exception when insufficient_privilege then null; end $$;
select pg_temp.ok(true, 'the clean-up still refuses a wrong secret');

select public.forget_missing_task_photos((select s from secret));
select pg_temp.ok((select photo_url is null from public.food_items where name = 'Gone, finished'),
  'a finished food''s missing photo is forgotten');
select pg_temp.ok((select photo_url is not null from public.food_items where name = 'Gone, listed'),
  'a listed food''s photo link is never touched');
select pg_temp.ok((select photo_url is not null from public.food_items where name = 'Finished'),
  'a photo still there is not forgotten');

-- --- Finished food forgotten after 90 days ---------------------------------------------
select public.prune_finished_food();
select pg_temp.ok((select count(*) = 0 from public.food_items where name = 'Old'), 'finished 91 days ago: deleted');
select pg_temp.ok((select count(*) = 1 from public.food_items where name = 'Recent'), 'finished 89 days ago: kept');
select pg_temp.ok((select count(*) = 1 from public.food_items where name = 'Listed'), 'listed food: kept');

rollback;
