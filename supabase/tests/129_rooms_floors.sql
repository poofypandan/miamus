-- Migration 129 checks: floors and rooms in two levels, names unique per
-- floor, deleting a floor keeps (and if needed renames) its rooms, spots on
-- chores, the staff guard copying the spot, and organise_rooms (sorting into
-- floors, merging rooms into spots, and its Undo) for owners only.
-- LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/129_rooms_floors.sql
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
  -- As the database itself (no signed-in user).
  perform set_config('request.jwt.claims', '', true);
  begin
    execute stmt;
  exception when others then
    return sqlerrm;
  end;
  return '';
end $$;

insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, anon, now(), now()
from (values
  ('00000000-0000-0000-0000-0000000129a1', 'owner129@test.local', false),
  ('00000000-0000-0000-0000-0000000129a2', 'other129@test.local', false),
  ('00000000-0000-0000-0000-0000000129b1', null, true)
) as u(id, email, anon);
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000129f1', 'Rumah Kamboja', '00000000-0000-0000-0000-0000000129a1'),
  ('00000000-0000-0000-0000-0000000129f2', 'Rumah lain', '00000000-0000-0000-0000-0000000129a2');
insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000129f1', '00000000-0000-0000-0000-0000000129a1', 'owner'),
  ('00000000-0000-0000-0000-0000000129f2', '00000000-0000-0000-0000-0000000129a2', 'owner');
insert into public.device_sessions (user_id, household_id) values
  ('00000000-0000-0000-0000-0000000129b1', '00000000-0000-0000-0000-0000000129f1');

-- Rooms named floor-first, as households already do.
insert into public.household_locations (id, household_id, name) values
  ('00000000-0000-0000-0000-0000000129c1', '00000000-0000-0000-0000-0000000129f1', 'LT2'),
  ('00000000-0000-0000-0000-0000000129c2', '00000000-0000-0000-0000-0000000129f1', 'LT2 Lounge'),
  ('00000000-0000-0000-0000-0000000129c3', '00000000-0000-0000-0000-0000000129f1', 'LT2 GB2 Bathroom Toilet'),
  ('00000000-0000-0000-0000-0000000129c4', '00000000-0000-0000-0000-0000000129f1', 'LT2 GB2 Bathroom Wastafel'),
  ('00000000-0000-0000-0000-0000000129c5', '00000000-0000-0000-0000-0000000129f1', 'LT1 Service Area'),
  ('00000000-0000-0000-0000-0000000129c6', '00000000-0000-0000-0000-0000000129f1', 'LT2 Service Area'),
  ('00000000-0000-0000-0000-0000000129c9', '00000000-0000-0000-0000-0000000129f2', 'Other household room');
insert into public.household_tasks (id, household_id, title, category, due_date, recurrence, location_id) values
  ('00000000-0000-0000-0000-0000000129d1', '00000000-0000-0000-0000-0000000129f1', 'Lap toilet', 'cleaning', '2026-11-16', 'weekly', '00000000-0000-0000-0000-0000000129c3'),
  ('00000000-0000-0000-0000-0000000129d2', '00000000-0000-0000-0000-0000000129f1', 'Lap keran', 'cleaning', '2026-11-16', 'weekly', '00000000-0000-0000-0000-0000000129c4'),
  ('00000000-0000-0000-0000-0000000129d3', '00000000-0000-0000-0000-0000000129f1', 'LT2 Lounge - Vacuum & pel', 'cleaning', '2026-11-16', 'weekly', null);

\set owner '''00000000-0000-0000-0000-0000000129a1'''
\set other '''00000000-0000-0000-0000-0000000129a2'''
\set staff '''00000000-0000-0000-0000-0000000129b1'''

select pg_temp.ok((select bool_and(kind = 'room' and parent_id is null and sort_order = 0) from public.household_locations
   where household_id = '00000000-0000-0000-0000-0000000129f1'), 'existing rooms become rooms with no floor');
select pg_temp.ok((select spot is null from public.household_tasks where id = '00000000-0000-0000-0000-0000000129d1'), 'existing chores keep no spot');

-- ---- Sort into floors, merge the bathroom's parts, link the old chore ----------
select pg_temp.ok(pg_temp.err_as(:owner, $q$ select public.organise_rooms('{
  "household_id": "00000000-0000-0000-0000-0000000129f1",
  "places": [
    {"id": "00000000-0000-0000-0000-0000000129e1", "name": "LT1", "kind": "floor", "parent_id": null, "sort_order": 1},
    {"id": "00000000-0000-0000-0000-0000000129c1", "name": "LT2", "kind": "floor", "parent_id": null, "sort_order": 2},
    {"id": "00000000-0000-0000-0000-0000000129c2", "name": "Lounge", "parent_id": "00000000-0000-0000-0000-0000000129c1"},
    {"id": "00000000-0000-0000-0000-0000000129c3", "name": "GB2 Bathroom", "parent_id": "00000000-0000-0000-0000-0000000129c1"},
    {"id": "00000000-0000-0000-0000-0000000129c5", "name": "Service Area", "parent_id": "00000000-0000-0000-0000-0000000129e1"},
    {"id": "00000000-0000-0000-0000-0000000129c6", "name": "Service Area", "parent_id": "00000000-0000-0000-0000-0000000129c1"}
  ],
  "chores": [
    {"id": "00000000-0000-0000-0000-0000000129d1", "spot": "Toilet"},
    {"id": "00000000-0000-0000-0000-0000000129d2", "location_id": "00000000-0000-0000-0000-0000000129c3", "spot": "Wastafel"},
    {"id": "00000000-0000-0000-0000-0000000129d3", "location_id": "00000000-0000-0000-0000-0000000129c2", "title": "Vacuum & pel"}
  ],
  "delete": ["00000000-0000-0000-0000-0000000129c4"]
}'::jsonb) $q$) = '', 'the owner sorts rooms into floors in one step');
select pg_temp.ok((select kind = 'floor' and parent_id is null from public.household_locations where id = '00000000-0000-0000-0000-0000000129c1'),
  'the room named just "LT2" became the floor');
select pg_temp.ok((select name = 'Lounge' and parent_id = '00000000-0000-0000-0000-0000000129c1' from public.household_locations where id = '00000000-0000-0000-0000-0000000129c2'),
  'LT2 Lounge became Lounge on LT2');
select pg_temp.ok((select count(*) = 2 from public.household_locations where household_id = '00000000-0000-0000-0000-0000000129f1' and name = 'Service Area'),
  'two rooms called Service Area, on two floors');
select pg_temp.ok((select location_id = '00000000-0000-0000-0000-0000000129c3' and spot = 'Wastafel' from public.household_tasks where id = '00000000-0000-0000-0000-0000000129d2'),
  'the sink''s chore moved into GB2 Bathroom with its spot');
select pg_temp.ok(not exists (select 1 from public.household_locations where id = '00000000-0000-0000-0000-0000000129c4'), 'the emptied room was deleted');
select pg_temp.ok((select location_id = '00000000-0000-0000-0000-0000000129c2' and title = 'Vacuum & pel' from public.household_tasks where id = '00000000-0000-0000-0000-0000000129d3'),
  'the older chore was linked to its room and its title trimmed');

-- ---- Undo: the reverse plan puts it all back -----------------------------------
select pg_temp.ok(pg_temp.err_as(:owner, $q$ select public.organise_rooms('{
  "household_id": "00000000-0000-0000-0000-0000000129f1",
  "places": [
    {"id": "00000000-0000-0000-0000-0000000129c2", "name": "LT2 Lounge", "parent_id": null},
    {"id": "00000000-0000-0000-0000-0000000129c3", "name": "LT2 GB2 Bathroom Toilet", "parent_id": null},
    {"id": "00000000-0000-0000-0000-0000000129c4", "name": "LT2 GB2 Bathroom Wastafel", "kind": "room", "parent_id": null},
    {"id": "00000000-0000-0000-0000-0000000129c5", "name": "LT1 Service Area", "parent_id": null},
    {"id": "00000000-0000-0000-0000-0000000129c6", "name": "LT2 Service Area", "parent_id": null},
    {"id": "00000000-0000-0000-0000-0000000129c1", "name": "LT2", "kind": "room", "parent_id": null, "sort_order": 0}
  ],
  "chores": [
    {"id": "00000000-0000-0000-0000-0000000129d1", "spot": null},
    {"id": "00000000-0000-0000-0000-0000000129d2", "location_id": "00000000-0000-0000-0000-0000000129c4", "spot": null},
    {"id": "00000000-0000-0000-0000-0000000129d3", "location_id": null, "title": "LT2 Lounge - Vacuum & pel"}
  ],
  "delete": ["00000000-0000-0000-0000-0000000129e1"]
}'::jsonb) $q$) = '', 'Undo runs as one step');
select pg_temp.ok((select count(*) = 6 from public.household_locations where household_id = '00000000-0000-0000-0000-0000000129f1'
   and kind = 'room' and parent_id is null), 'after Undo: the six original rooms, no floors');
select pg_temp.ok((select location_id = '00000000-0000-0000-0000-0000000129c4' and spot is null from public.household_tasks where id = '00000000-0000-0000-0000-0000000129d2'),
  'after Undo: the sink''s chore is back in its own room');

-- ---- Who may sort ---------------------------------------------------------------
select pg_temp.ok(pg_temp.err_as(:staff, $q$ select public.organise_rooms('{"household_id": "00000000-0000-0000-0000-0000000129f1", "places": []}'::jsonb) $q$)
  = 'admins_only', 'a staff phone cannot sort rooms');
select pg_temp.ok(pg_temp.err_as(:other, $q$ select public.organise_rooms('{"household_id": "00000000-0000-0000-0000-0000000129f1", "places": []}'::jsonb) $q$)
  = 'admins_only', 'another household''s owner cannot sort ours');
select pg_temp.ok(pg_temp.err_as(:owner, $q$ select public.organise_rooms('{"household_id": "00000000-0000-0000-0000-0000000129f1",
  "places": [{"id": "00000000-0000-0000-0000-0000000129c9", "name": "Mine now"}]}'::jsonb) $q$) <> '',
  'another household''s room cannot be renamed through it');
select pg_temp.ok((select name = 'Other household room' from public.household_locations where id = '00000000-0000-0000-0000-0000000129c9'),
  'and it is unchanged');
select pg_temp.ok(not has_function_privilege('anon', 'public.organise_rooms(jsonb)', 'execute'), 'logged-out callers cannot call organise_rooms');

-- ---- Two levels ------------------------------------------------------------------
insert into public.household_locations (id, household_id, name, kind) values
  ('00000000-0000-0000-0000-0000000129e2', '00000000-0000-0000-0000-0000000129f1', 'LT3', 'floor'),
  ('00000000-0000-0000-0000-0000000129e3', '00000000-0000-0000-0000-0000000129f1', 'LT4', 'floor');
insert into public.household_locations (id, household_id, name, parent_id) values
  ('00000000-0000-0000-0000-0000000129c7', '00000000-0000-0000-0000-0000000129f1', 'Music Room', '00000000-0000-0000-0000-0000000129e2');
select pg_temp.ok(pg_temp.err($q$ update public.household_locations set parent_id = '00000000-0000-0000-0000-0000000129e2'
  where id = '00000000-0000-0000-0000-0000000129e3' $q$) = 'floor_has_no_floor', 'a floor cannot sit on a floor');
select pg_temp.ok(pg_temp.err($q$ update public.household_locations set parent_id = '00000000-0000-0000-0000-0000000129c7'
  where id = '00000000-0000-0000-0000-0000000129c2' $q$) = 'parent_must_be_floor', 'a room cannot sit in a room');
select pg_temp.ok(pg_temp.err($q$ update public.household_locations set kind = 'room'
  where id = '00000000-0000-0000-0000-0000000129e2' $q$) = 'floor_still_has_rooms', 'a floor with rooms cannot become a room');
select pg_temp.ok(pg_temp.err($q$ insert into public.household_locations (household_id, name, parent_id)
  values ('00000000-0000-0000-0000-0000000129f2', 'Sneaky', '00000000-0000-0000-0000-0000000129e2') $q$) <> '',
  'a room cannot sit on another household''s floor');
select pg_temp.ok(pg_temp.err($q$ insert into public.household_locations (household_id, name, parent_id)
  values ('00000000-0000-0000-0000-0000000129f1', 'music room', '00000000-0000-0000-0000-0000000129e2') $q$) <> '',
  'names are unique per floor, ignoring case');
select pg_temp.ok(pg_temp.err($q$ insert into public.household_locations (household_id, name, parent_id)
  values ('00000000-0000-0000-0000-0000000129f1', 'Music Room', '00000000-0000-0000-0000-0000000129e3') $q$) = '',
  'the same name on another floor is fine');

-- ---- Deleting a floor keeps its rooms, renaming clashes ----------------------------
-- A room with no floor called "Music Room" already exists below the floors.
insert into public.household_locations (household_id, name) values ('00000000-0000-0000-0000-0000000129f1', 'Music Room');
insert into public.household_tasks (id, household_id, title, category, due_date, location_id) values
  ('00000000-0000-0000-0000-0000000129d4', '00000000-0000-0000-0000-0000000129f1', 'Lap piano', 'cleaning', '2026-11-20', '00000000-0000-0000-0000-0000000129c7');
select pg_temp.ok(pg_temp.err($q$ delete from public.household_locations where id = '00000000-0000-0000-0000-0000000129e2' $q$) = '',
  'deleting LT3 succeeds despite the clash');
select pg_temp.ok((select name = 'LT3 Music Room' and parent_id is null from public.household_locations where id = '00000000-0000-0000-0000-0000000129c7'),
  'its Music Room got its floor back in front');
select pg_temp.ok((select location_id = '00000000-0000-0000-0000-0000000129c7' from public.household_tasks where id = '00000000-0000-0000-0000-0000000129d4'),
  'and its chore still points at it');
select pg_temp.ok(pg_temp.err($q$ delete from public.household_locations where id = '00000000-0000-0000-0000-0000000129e3' $q$) = '',
  'deleting LT4 (also with a Music Room) succeeds');
select pg_temp.ok((select count(distinct lower(name)) = 3 from public.household_locations
   where household_id = '00000000-0000-0000-0000-0000000129f1' and lower(name) like '%music room'),
  'three music rooms, three distinct names');

-- A 60-character room name still renames within 60 characters.
insert into public.household_locations (id, household_id, name, kind) values
  ('00000000-0000-0000-0000-0000000129e4', '00000000-0000-0000-0000-0000000129f1', 'Lantai Atas Sekali', 'floor');
insert into public.household_locations (household_id, name) values
  ('00000000-0000-0000-0000-0000000129f1', rpad('Ruang', 60, 'x'));
insert into public.household_locations (household_id, name, parent_id) values
  ('00000000-0000-0000-0000-0000000129f1', rpad('Ruang', 60, 'x'), '00000000-0000-0000-0000-0000000129e4');
select pg_temp.ok(pg_temp.err($q$ delete from public.household_locations where id = '00000000-0000-0000-0000-0000000129e4' $q$) = '',
  'a 60-character clash renames cleanly');
select pg_temp.ok((select max(char_length(name)) <= 60 from public.household_locations where household_id = '00000000-0000-0000-0000-0000000129f1'),
  'every name is still 60 characters or fewer');

-- ---- Spots ---------------------------------------------------------------------------
select pg_temp.ok(pg_temp.err($q$ update public.household_tasks set spot = '   ' where id = '00000000-0000-0000-0000-0000000129d1' $q$) <> '', 'a blank spot is refused');
select pg_temp.ok(pg_temp.err($q$ update public.household_tasks set spot = rpad('x', 41, 'x') where id = '00000000-0000-0000-0000-0000000129d1' $q$) <> '', 'a spot over 40 characters is refused');
select pg_temp.ok(pg_temp.err_as(:staff, $q$ update public.household_tasks set spot = 'Cermin' where id = '00000000-0000-0000-0000-0000000129d1' $q$)
  = 'chore_owner_only', 'a staff phone cannot change a spot');
select set_config('request.jwt.claims', '', true);
update public.household_tasks set spot = 'Toilet' where id = '00000000-0000-0000-0000-0000000129d1';
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.household_tasks (household_id, parent_task_id, title, category, due_date, location_id, recurrence)
  values ('00000000-0000-0000-0000-0000000129f1', '00000000-0000-0000-0000-0000000129d1', 'Lap toilet', 'cleaning', '2026-11-23',
          '00000000-0000-0000-0000-0000000129c3', 'none') $q$) = 'chore_owner_only',
  'a materialised day must copy the template''s spot');
select pg_temp.ok(pg_temp.err_as(:staff, $q$
  insert into public.household_tasks (household_id, parent_task_id, title, category, due_date, location_id, spot, recurrence)
  values ('00000000-0000-0000-0000-0000000129f1', '00000000-0000-0000-0000-0000000129d1', 'Lap toilet', 'cleaning', '2026-11-23',
          '00000000-0000-0000-0000-0000000129c3', 'Toilet', 'none') $q$) = '',
  'with the spot copied, it is accepted');

-- ---- Grants ----------------------------------------------------------------------------
select pg_temp.ok(not has_function_privilege('authenticated', 'public.household_locations_two_levels()', 'execute')
  and not has_function_privilege('authenticated', 'public.household_locations_release_floor()', 'execute'),
  'the trigger functions are not callable from the API');
select pg_temp.ok(
  (select bool_and(proconfig = array['search_path=""']) from pg_proc
    where proname in ('household_locations_two_levels', 'household_locations_release_floor', 'organise_rooms', 'household_tasks_owner_guard')
      and pronamespace = 'public'::regnamespace),
  'every new or replaced function has an empty search_path');

rollback;
