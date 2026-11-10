-- Migration 142 checks: a room may sit inside a top-level room, one level
-- deep; names unique per parent; deleting a room moves its rooms inside out
-- as "GB1 Bathroom"; deleting a floor keeps rooms inside their room; deleting
-- a household with floors works; repair_place_label gives the whole path;
-- organise_rooms nests and undoes; staff phones can't nest; grants.
-- LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/142_rooms_inside_rooms.sql
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
create function pg_temp.err(stmt text) returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  begin
    execute stmt;
  exception when others then
    return sqlerrm;
  end;
  return '';
end $$;

\set owner '''00000000-0000-0000-0000-0000000142a1'''
\set other '''00000000-0000-0000-0000-0000000142a2'''
\set staff '''00000000-0000-0000-0000-0000000142b1'''

insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, anon, now(), now()
from (values
  ('00000000-0000-0000-0000-0000000142a1', 'owner142@test.local', false),
  ('00000000-0000-0000-0000-0000000142a2', 'other142@test.local', false),
  ('00000000-0000-0000-0000-0000000142b1', null, true)
) as u(id, email, anon);
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000142f1', 'Rumah Kamboja', '00000000-0000-0000-0000-0000000142a1'),
  ('00000000-0000-0000-0000-0000000142f2', 'Rumah lain', '00000000-0000-0000-0000-0000000142a2');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000142f1', '00000000-0000-0000-0000-0000000142a1', 'owner'),
  ('00000000-0000-0000-0000-0000000142f2', '00000000-0000-0000-0000-0000000142a2', 'owner');
insert into public.device_sessions (user_id, household_id) values
  ('00000000-0000-0000-0000-0000000142b1', '00000000-0000-0000-0000-0000000142f1');

-- The owner's LT2, and a room with no floor.
insert into public.household_locations (id, household_id, name, kind) values
  ('00000000-0000-0000-0000-0000000142e1', '00000000-0000-0000-0000-0000000142f1', 'LT2', 'floor'),
  ('00000000-0000-0000-0000-0000000142e3', '00000000-0000-0000-0000-0000000142f1', 'LT3', 'floor'),
  ('00000000-0000-0000-0000-0000000142e2', '00000000-0000-0000-0000-0000000142f2', 'LT1', 'floor');
insert into public.household_locations (id, household_id, name, parent_id) values
  ('00000000-0000-0000-0000-0000000142c1', '00000000-0000-0000-0000-0000000142f1', 'Master Bedroom', '00000000-0000-0000-0000-0000000142e1'),
  ('00000000-0000-0000-0000-0000000142c2', '00000000-0000-0000-0000-0000000142f1', 'GB1', '00000000-0000-0000-0000-0000000142e1'),
  ('00000000-0000-0000-0000-0000000142c3', '00000000-0000-0000-0000-0000000142f1', 'GB2', '00000000-0000-0000-0000-0000000142e1'),
  ('00000000-0000-0000-0000-0000000142c4', '00000000-0000-0000-0000-0000000142f1', 'Lounge', '00000000-0000-0000-0000-0000000142e1'),
  ('00000000-0000-0000-0000-0000000142c5', '00000000-0000-0000-0000-0000000142f1', 'Studio', null),
  ('00000000-0000-0000-0000-0000000142c9', '00000000-0000-0000-0000-0000000142f2', 'Kamar', '00000000-0000-0000-0000-0000000142e2');

-- ---- One level inside a room ---------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:owner, $q$ insert into public.household_locations (id, household_id, name, parent_id) values
  ('00000000-0000-0000-0000-0000000142d1', '00000000-0000-0000-0000-0000000142f1', 'Bathroom', '00000000-0000-0000-0000-0000000142c1'),
  ('00000000-0000-0000-0000-0000000142d2', '00000000-0000-0000-0000-0000000142f1', 'Walk-in closet', '00000000-0000-0000-0000-0000000142c1') $q$) = '',
  'an owner puts a bathroom and a closet inside the master bedroom');
select pg_temp.ok(pg_temp.err_as(:owner, $q$ insert into public.household_locations (id, household_id, name, parent_id) values
  ('00000000-0000-0000-0000-0000000142d3', '00000000-0000-0000-0000-0000000142f1', 'Bathroom', '00000000-0000-0000-0000-0000000142c2'),
  ('00000000-0000-0000-0000-0000000142d4', '00000000-0000-0000-0000-0000000142f1', 'bathroom', '00000000-0000-0000-0000-0000000142c3') $q$) = '',
  'each bedroom can have its own "Bathroom" (names are unique per parent)');
select pg_temp.ok(pg_temp.err_as(:owner, $q$ insert into public.household_locations (household_id, name, parent_id) values
  ('00000000-0000-0000-0000-0000000142f1', 'BATHROOM', '00000000-0000-0000-0000-0000000142c1') $q$) like '%duplicate key%',
  'but not two in one bedroom, ignoring case');
select pg_temp.ok(pg_temp.err_as(:owner, $q$ insert into public.household_locations (id, household_id, name, parent_id) values
  ('00000000-0000-0000-0000-0000000142d5', '00000000-0000-0000-0000-0000000142f1', 'Balcony', '00000000-0000-0000-0000-0000000142c5') $q$) = '',
  'a room with no floor can hold rooms too');
select pg_temp.ok(pg_temp.err_as(:owner, $q$ insert into public.household_locations (household_id, name, parent_id) values
  ('00000000-0000-0000-0000-0000000142f1', 'Shelf', '00000000-0000-0000-0000-0000000142d1') $q$) = 'rooms_inside_one_level',
  'a third level is refused');
select pg_temp.ok(pg_temp.err_as(:owner, $q$ update public.household_locations set parent_id = '00000000-0000-0000-0000-0000000142c1'
  where id = '00000000-0000-0000-0000-0000000142c2' $q$) = 'rooms_inside_one_level',
  'a room that holds rooms cannot go inside another room');
select pg_temp.ok(pg_temp.err_as(:owner, $q$ update public.household_locations set parent_id = '00000000-0000-0000-0000-0000000142c1'
  where id = '00000000-0000-0000-0000-0000000142c4' $q$) = '',
  'a room without rooms can move inside one');
update public.household_locations set parent_id = '00000000-0000-0000-0000-0000000142e1' where id = '00000000-0000-0000-0000-0000000142c4';
select pg_temp.ok(pg_temp.err_as(:owner, $q$ insert into public.household_locations (household_id, name, parent_id) values
  ('00000000-0000-0000-0000-0000000142f1', 'Sneaky', '00000000-0000-0000-0000-0000000142c9') $q$) <> '',
  'a room cannot sit inside another household''s room');
select pg_temp.ok(pg_temp.err($q$ insert into public.household_locations (household_id, name, parent_id) values
  ('00000000-0000-0000-0000-0000000142f1', 'Sneaky', '00000000-0000-0000-0000-0000000142c9') $q$) = 'parent_must_be_floor_or_room',
  'not even from the database itself');
select pg_temp.ok(pg_temp.err($q$ update public.household_locations set kind = 'floor', parent_id = null
  where id = '00000000-0000-0000-0000-0000000142c1' $q$) = 'room_still_has_rooms_inside',
  'a room that holds rooms cannot become a floor');
select pg_temp.ok(pg_temp.err($q$ update public.household_locations set parent_id = '00000000-0000-0000-0000-0000000142c4'
  where id = '00000000-0000-0000-0000-0000000142e3' $q$) = 'floor_has_no_floor',
  'a floor still cannot sit in anything');
select pg_temp.ok(pg_temp.err($q$ update public.household_locations set kind = 'room'
  where id = '00000000-0000-0000-0000-0000000142e1' $q$) = 'floor_still_has_rooms',
  'a floor with rooms still cannot become a room');

-- Staff phones and logged-out callers can't nest.
select pg_temp.ok(pg_temp.err_as(:staff, $q$ update public.household_locations set parent_id = '00000000-0000-0000-0000-0000000142c1'
  where id = '00000000-0000-0000-0000-0000000142c4' $q$) is not null
  and (select parent_id = '00000000-0000-0000-0000-0000000142e1' from public.household_locations where id = '00000000-0000-0000-0000-0000000142c4'),
  'a staff phone cannot move a room inside another');
select pg_temp.ok(pg_temp.err_as(:staff, $q$ insert into public.household_locations (household_id, name, parent_id) values
  ('00000000-0000-0000-0000-0000000142f1', 'Gudang', '00000000-0000-0000-0000-0000000142c1') $q$) <> '',
  'a staff phone cannot add a room inside one');
select pg_temp.ok(pg_temp.err_as(:other, $q$ insert into public.household_locations (household_id, name, parent_id) values
  ('00000000-0000-0000-0000-0000000142f1', 'Sneaky', '00000000-0000-0000-0000-0000000142c1') $q$) <> '',
  'another household''s owner cannot add a room inside this one');

-- ---- Moving ----------------------------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:owner, $q$ update public.household_locations set parent_id = '00000000-0000-0000-0000-0000000142e3'
  where id = '00000000-0000-0000-0000-0000000142c3' $q$) = '',
  'GB2 moves to LT3');
select pg_temp.ok((select parent_id = '00000000-0000-0000-0000-0000000142c3' from public.household_locations where id = '00000000-0000-0000-0000-0000000142d4'),
  'and its bathroom comes with it');
select pg_temp.ok(pg_temp.err_as(:owner, $q$ update public.household_locations set parent_id = '00000000-0000-0000-0000-0000000142e1'
  where id = '00000000-0000-0000-0000-0000000142d3' $q$) = '',
  'GB1''s bathroom can be taken out onto LT2');
select pg_temp.ok(pg_temp.err_as(:owner, $q$ update public.household_locations set parent_id = '00000000-0000-0000-0000-0000000142e1'
  where id = '00000000-0000-0000-0000-0000000142d1' $q$) like '%duplicate key%',
  'a second "Bathroom" onto LT2 is refused');
update public.household_locations set parent_id = '00000000-0000-0000-0000-0000000142c2' where id = '00000000-0000-0000-0000-0000000142d3';

-- ---- Repairs say the whole path ----------------------------------------------------------
select pg_temp.ok(public.repair_place_label('00000000-0000-0000-0000-0000000142d3', ' Shower ') = 'LT2 · GB1 · Bathroom · Shower',
  'a repair in a room inside reads floor, room, room inside, spot');
select pg_temp.ok(public.repair_place_label('00000000-0000-0000-0000-0000000142c4', null) = 'LT2 · Lounge',
  'a room on a floor reads as before');
select pg_temp.ok(public.repair_place_label('00000000-0000-0000-0000-0000000142d5', 'Lantai') = 'Studio · Balcony · Lantai',
  'a room inside a room with no floor');
select pg_temp.ok(public.repair_place_label(null, null) is null, 'no place, no label');

-- ---- Deleting a room moves its rooms inside out --------------------------------------------
insert into public.household_tasks (id, household_id, title, category, due_date, location_id, spot) values
  ('00000000-0000-0000-0000-000000014201', '00000000-0000-0000-0000-0000000142f1', 'Sikat toilet', 'cleaning', '2026-11-20',
   '00000000-0000-0000-0000-0000000142d1', 'Toilet');
select pg_temp.ok(pg_temp.err_as(:owner, $q$ delete from public.household_locations where id = '00000000-0000-0000-0000-0000000142c1' $q$) = '',
  'deleting the master bedroom succeeds');
select pg_temp.ok((select name = 'Master Bedroom Bathroom' and parent_id = '00000000-0000-0000-0000-0000000142e1'
   from public.household_locations where id = '00000000-0000-0000-0000-0000000142d1'),
  'its bathroom is on LT2 as "Master Bedroom Bathroom"');
select pg_temp.ok((select name = 'Master Bedroom Walk-in closet' from public.household_locations where id = '00000000-0000-0000-0000-0000000142d2'),
  'and its closet as "Master Bedroom Walk-in closet"');
select pg_temp.ok((select location_id = '00000000-0000-0000-0000-0000000142d1' and spot = 'Toilet'
   from public.household_tasks where id = '00000000-0000-0000-0000-000000014201'),
  'the bathroom''s chore still points at it, spot and all');

-- A clash gets a number.
insert into public.household_locations (household_id, name, parent_id) values
  ('00000000-0000-0000-0000-0000000142f1', 'GB1 Bathroom', '00000000-0000-0000-0000-0000000142e1');
select pg_temp.ok(pg_temp.err_as(:owner, $q$ delete from public.household_locations where id = '00000000-0000-0000-0000-0000000142c2' $q$) = '',
  'deleting GB1 succeeds although "GB1 Bathroom" is taken on LT2');
select pg_temp.ok((select name = 'GB1 Bathroom 2' and parent_id = '00000000-0000-0000-0000-0000000142e1'
   from public.household_locations where id = '00000000-0000-0000-0000-0000000142d3'),
  'its bathroom becomes "GB1 Bathroom 2"');

-- 60-character names stay within 60.
insert into public.household_locations (id, household_id, name, parent_id) values
  ('00000000-0000-0000-0000-0000000142c6', '00000000-0000-0000-0000-0000000142f1', rpad('Kamar', 60, 'x'), '00000000-0000-0000-0000-0000000142e1');
insert into public.household_locations (household_id, name, parent_id) values
  ('00000000-0000-0000-0000-0000000142f1', rpad('Mandi', 60, 'y'), '00000000-0000-0000-0000-0000000142c6'),
  ('00000000-0000-0000-0000-0000000142f1', rpad('Mandi', 59, 'y') || 'z', '00000000-0000-0000-0000-0000000142c6');
select pg_temp.ok(pg_temp.err($q$ delete from public.household_locations where id = '00000000-0000-0000-0000-0000000142c6' $q$) = '',
  'two long rooms inside a long room move out');
select pg_temp.ok((select max(char_length(name)) <= 60 and count(distinct lower(name)) = count(*)
   from public.household_locations where household_id = '00000000-0000-0000-0000-0000000142f1' and parent_id = '00000000-0000-0000-0000-0000000142e1'),
  'within 60 characters, with distinct names');

-- Deleting a floor keeps rooms inside their room.
select pg_temp.ok(pg_temp.err_as(:owner, $q$ delete from public.household_locations where id = '00000000-0000-0000-0000-0000000142e3' $q$) = '',
  'deleting LT3 succeeds');
select pg_temp.ok((select parent_id is null from public.household_locations where id = '00000000-0000-0000-0000-0000000142c3')
  and (select parent_id = '00000000-0000-0000-0000-0000000142c3' from public.household_locations where id = '00000000-0000-0000-0000-0000000142d4'),
  'GB2 has no floor now, and its bathroom is still inside it');

-- ---- organise_rooms nests, and its Undo puts it back ------------------------------------
insert into public.household_locations (id, household_id, name, parent_id) values
  ('00000000-0000-0000-0000-0000000142c7', '00000000-0000-0000-0000-0000000142f1', 'GB3', '00000000-0000-0000-0000-0000000142e1'),
  ('00000000-0000-0000-0000-0000000142c8', '00000000-0000-0000-0000-0000000142f1', 'GB3 Bathroom', '00000000-0000-0000-0000-0000000142e1');
select pg_temp.ok(pg_temp.err_as(:owner, $q$ select public.organise_rooms('{"household_id": "00000000-0000-0000-0000-0000000142f1",
  "places": [{"id": "00000000-0000-0000-0000-0000000142c8", "name": "Bathroom", "parent_id": "00000000-0000-0000-0000-0000000142c7"}],
  "chores": [], "delete": []}'::jsonb) $q$) = '',
  'organise_rooms puts "GB3 Bathroom" inside GB3 as "Bathroom"');
select pg_temp.ok((select name = 'Bathroom' and parent_id = '00000000-0000-0000-0000-0000000142c7'
   from public.household_locations where id = '00000000-0000-0000-0000-0000000142c8'), 'and it is there');
select pg_temp.ok(pg_temp.err_as(:owner, $q$ select public.organise_rooms('{"household_id": "00000000-0000-0000-0000-0000000142f1",
  "places": [{"id": "00000000-0000-0000-0000-0000000142c8", "name": "GB3 Bathroom", "parent_id": "00000000-0000-0000-0000-0000000142e1"}],
  "chores": [], "delete": []}'::jsonb) $q$) = '',
  'its Undo takes it back out');
select pg_temp.ok((select name = 'GB3 Bathroom' and parent_id = '00000000-0000-0000-0000-0000000142e1'
   from public.household_locations where id = '00000000-0000-0000-0000-0000000142c8'), 'exactly as it was');
select pg_temp.ok(pg_temp.err_as(:owner, $q$ select public.organise_rooms('{"household_id": "00000000-0000-0000-0000-0000000142f1",
  "places": [{"id": "00000000-0000-0000-0000-0000000142c8", "parent_id": "00000000-0000-0000-0000-0000000142c7"},
             {"id": "00000000-0000-0000-0000-0000000142c7", "parent_id": "00000000-0000-0000-0000-0000000142c4"}],
  "chores": [], "delete": []}'::jsonb) $q$) = 'rooms_inside_one_level',
  'a plan that would build a third level is refused');
select pg_temp.ok((select parent_id = '00000000-0000-0000-0000-0000000142e1' from public.household_locations where id = '00000000-0000-0000-0000-0000000142c8'),
  'and nothing of it was kept');

-- ---- Deleting a household with floors and rooms works ----------------------------------------
insert into public.household_locations (household_id, name, parent_id) values
  ('00000000-0000-0000-0000-0000000142f2', 'Kamar mandi', '00000000-0000-0000-0000-0000000142c9');
select pg_temp.ok(pg_temp.err($q$ delete from public.households where id = '00000000-0000-0000-0000-0000000142f2' $q$) = '',
  'a household with a floor, a room and a room inside can be deleted');
select pg_temp.ok((select count(*) = 0 from public.household_locations where household_id = '00000000-0000-0000-0000-0000000142f2'),
  'and its places go with it');

-- ---- Grants ------------------------------------------------------------------------------------
select pg_temp.ok(not has_function_privilege('authenticated', 'public.household_locations_two_levels()', 'execute')
  and not has_function_privilege('authenticated', 'public.household_locations_release_floor()', 'execute')
  and not has_function_privilege('anon', 'public.household_locations_two_levels()', 'execute')
  and not has_function_privilege('anon', 'public.household_locations_release_floor()', 'execute'),
  'the trigger functions are not callable from the API');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.repair_place_label(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.repair_place_label(uuid, text)', 'execute'),
  'repair_place_label is not callable from the API');
select pg_temp.ok(
  (select bool_and(proconfig = array['search_path=""']) from pg_proc
    where proname in ('household_locations_two_levels', 'household_locations_release_floor', 'repair_place_label')
      and pronamespace = 'public'::regnamespace),
  'every replaced function has an empty search_path');
select pg_temp.ok(
  (select bool_and(not prosecdef) from pg_proc
    where proname in ('household_locations_two_levels', 'household_locations_release_floor', 'repair_place_label')
      and pronamespace = 'public'::regnamespace),
  'none of them is SECURITY DEFINER');

rollback;
