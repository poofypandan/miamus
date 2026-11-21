-- Migration 179 checks: the photo backup reader.
-- The account with app_metadata.miamus_role = 'photo_backup_reader' reads
-- every photo in every photo bucket, of every household; it cannot upload,
-- rename or delete one, and reads no household's rows. The same claim in
-- user_metadata (which a user CAN set on themselves) gives nothing, nor does
-- any other role value. A household's own admin still reads only its own.
-- LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/179_photo_backup_reader.sql
-- (or, before 179 is applied: begin; \i the migration; \i this file.)
\set ON_ERROR_STOP on
\pset footer off
begin;

create function pg_temp.ok(cond boolean, label text) returns text language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  return 'ok  ' || label;
end $$;

-- Runs a count as a session with the given JWT claims.
create function pg_temp.count_as(claims jsonb, stmt text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claims', claims::text, true);
  execute 'set local role authenticated';
  execute stmt into n;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return n;
end $$;

-- Runs a write as a session; returns the rows it touched (-1 on an error).
create function pg_temp.n_as(claims jsonb, stmt text) returns integer language plpgsql as $$
declare n integer;
begin
  perform set_config('request.jwt.claims', claims::text, true);
  execute 'set local role authenticated';
  begin
    execute stmt;
    get diagnostics n = row_count;
  exception when others then
    n := -1;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return n;
end $$;

-- Two households, an admin each, a photo in every bucket of each.
insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0179-000000000001', 'reader179@test.local', 'authenticated', 'authenticated',
   '{"miamus_role": "photo_backup_reader"}', '{}'),
  ('00000000-0000-0000-0179-000000000002', 'adminA179@test.local', 'authenticated', 'authenticated', '{}', '{}'),
  ('00000000-0000-0000-0179-000000000003', 'adminB179@test.local', 'authenticated', 'authenticated', '{}', '{}'),
  ('00000000-0000-0000-0179-000000000004', 'nobody179@test.local', 'authenticated', 'authenticated', '{}', '{}');
insert into public.households (id, name) values
  ('00000000-0000-0000-0179-00000000000a', 'A 179'),
  ('00000000-0000-0000-0179-00000000000b', 'B 179');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0179-00000000000a', '00000000-0000-0000-0179-000000000002', 'admin'),
  ('00000000-0000-0000-0179-00000000000b', '00000000-0000-0000-0179-000000000003', 'admin');
insert into storage.objects (bucket_id, name) values
  ('household-logs',   '00000000-0000-0000-0179-00000000000a/pets/a.webp'),
  ('inventory_audits', '00000000-0000-0000-0179-00000000000a/stock/a.webp'),
  ('owner-receipts',   '00000000-0000-0000-0179-00000000000a/repairs/a.webp'),
  ('household-logs',   '00000000-0000-0000-0179-00000000000b/pets/b.webp'),
  ('inventory_audits', '00000000-0000-0000-0179-00000000000b/stock/b.webp'),
  ('owner-receipts',   '00000000-0000-0000-0179-00000000000b/repairs/b.webp');

\set reader '''{"sub": "00000000-0000-0000-0179-000000000001", "role": "authenticated", "app_metadata": {"miamus_role": "photo_backup_reader"}}'''
\set selfmade '''{"sub": "00000000-0000-0000-0179-000000000004", "role": "authenticated", "app_metadata": {}, "user_metadata": {"miamus_role": "photo_backup_reader"}}'''
\set otherrole '''{"sub": "00000000-0000-0000-0179-000000000004", "role": "authenticated", "app_metadata": {"miamus_role": "admin"}}'''
\set adminA '''{"sub": "00000000-0000-0000-0179-000000000002", "role": "authenticated", "app_metadata": {}}'''

\set mine 'select count(*) from storage.objects where name like ''00000000-0000-0000-0179-%'''

select pg_temp.ok(pg_temp.count_as(:reader, :'mine') = 6, 'the reader reads every photo, every bucket, both households');
select pg_temp.ok(pg_temp.count_as(:reader,
  'select count(*) from storage.objects where bucket_id = ''owner-receipts'' and name like ''00000000-0000-0000-0179-%''') = 2,
  'the reader reads owner-only receipts too (it is the operator''s backup)');
select pg_temp.ok(pg_temp.count_as(:selfmade, :'mine') = 0, 'the role in user_metadata (self-set) reads nothing');
select pg_temp.ok(pg_temp.count_as(:otherrole, :'mine') = 0, 'another miamus_role reads nothing');
select pg_temp.ok(pg_temp.count_as(:adminA, :'mine') = 3, 'a household admin still reads only its own three');

-- Writes: none.
select pg_temp.ok(pg_temp.n_as(:reader,
  'insert into storage.objects (bucket_id, name) values (''household-logs'', ''00000000-0000-0000-0179-00000000000a/pets/new.webp'')') <= 0,
  'the reader cannot upload');
select pg_temp.ok(pg_temp.n_as(:reader,
  'update storage.objects set name = name || ''.moved'' where name like ''00000000-0000-0000-0179-%''') <= 0,
  'the reader cannot rename or move');
select pg_temp.ok(pg_temp.n_as(:reader,
  'delete from storage.objects where name like ''00000000-0000-0000-0179-%''') <= 0,
  'the reader cannot delete');
select pg_temp.ok((select count(*) from storage.objects where name like '00000000-0000-0000-0179-%') = 6,
  'all six photos are still there, unchanged');

-- Rows: none.
select pg_temp.ok(pg_temp.count_as(:reader,
  'select count(*) from public.households where id::text like ''00000000-0000-0000-0179-%''') = 0,
  'the reader reads no household');
select pg_temp.ok(pg_temp.count_as(:reader,
  'select count(*) from public.household_members where user_id::text like ''00000000-0000-0000-0179-%''') = 0,
  'the reader reads no membership');

rollback;
