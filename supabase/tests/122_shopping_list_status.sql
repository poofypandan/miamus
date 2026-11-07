-- Migration 122 checks: items carry enough / running low / out; staff phones
-- may set it but still not rename; the time is the server's.
-- LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/122_shopping_list_status.sql
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

insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000122a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin122@test.local', false, now(), now()),
  ('00000000-0000-0000-0000-0000000122b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now(), now());
insert into public.households (id, name, owner_auth_id)
values ('00000000-0000-0000-0000-0000000122f1', 'Rumah 122', '00000000-0000-0000-0000-0000000122a1');
insert into public.household_members (household_id, user_id, role)
values ('00000000-0000-0000-0000-0000000122f1', '00000000-0000-0000-0000-0000000122a1', 'owner');
insert into public.device_sessions (user_id, household_id)
values ('00000000-0000-0000-0000-0000000122b1', '00000000-0000-0000-0000-0000000122f1');
insert into public.staff_profiles (id, household_id, name, archived_at) values
  ('00000000-0000-0000-0000-0000000122e1', '00000000-0000-0000-0000-0000000122f1', 'Sari', null),
  ('00000000-0000-0000-0000-0000000122e2', '00000000-0000-0000-0000-0000000122f1', 'Joko', now());
insert into public.inventory_items (id, household_id, scope, name, category, unit)
values ('00000000-0000-0000-0000-0000000122d1', '00000000-0000-0000-0000-0000000122f1', 'pet', 'Pee pad', 'dog_supplies', 'pack');

select pg_temp.ok((select stock_status = 'ok' from public.inventory_items where id = '00000000-0000-0000-0000-0000000122d1'),
  'a new item starts as enough');

set local role authenticated;
select pg_temp.act('00000000-0000-0000-0000-0000000122b1');
update public.inventory_items set stock_status = 'low', stock_status_by = '00000000-0000-0000-0000-0000000122e1'
 where id = '00000000-0000-0000-0000-0000000122d1';
reset role;
select pg_temp.ok((select stock_status = 'low' and stock_status_by = '00000000-0000-0000-0000-0000000122e1'
                          and stock_status_at > now() - interval '1 minute'
                     from public.inventory_items where id = '00000000-0000-0000-0000-0000000122d1'),
  'a staff phone marks it running low; the server stamps the time');

set local role authenticated;
select pg_temp.act('00000000-0000-0000-0000-0000000122b1');
do $$ begin
  update public.inventory_items set name = 'Renamed' where id = '00000000-0000-0000-0000-0000000122d1';
  raise exception 'FAIL: staff phone renamed an item';
exception when insufficient_privilege then null; end $$;
select pg_temp.ok(true, 'a staff phone still cannot rename it (099)');
do $$ begin
  update public.inventory_items set stock_status = 'banana' where id = '00000000-0000-0000-0000-0000000122d1';
  raise exception 'FAIL: odd status accepted';
exception when check_violation then null; end $$;
select pg_temp.ok(true, 'only enough, running low or out');
do $$ begin
  update public.inventory_items set stock_status = 'out', stock_status_by = '00000000-0000-0000-0000-0000000122e2'
   where id = '00000000-0000-0000-0000-0000000122d1';
  raise exception 'FAIL: recorded under a removed person';
exception when insufficient_privilege then null; end $$;
select pg_temp.ok(true, 'not in the name of someone removed (119)');

select pg_temp.act('00000000-0000-0000-0000-0000000122a1');
update public.inventory_items set stock_status = 'ok', stock_status_by = null
 where id = '00000000-0000-0000-0000-0000000122d1';
reset role;
select pg_temp.ok((select stock_status = 'ok' from public.inventory_items where id = '00000000-0000-0000-0000-0000000122d1'),
  'the owner ticks it bought');

rollback;
