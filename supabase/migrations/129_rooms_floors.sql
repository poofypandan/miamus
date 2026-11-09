-- ============================================================================
-- 129 — Floors, rooms and spots (Phase 158, PR B; docs/phase-158-rooms-plan.md)
-- ============================================================================
-- Owner decisions (2026-11-09): the recommended options for D1–D6.
--
--   household_locations  + kind ('room' | 'floor'), parent_id (the floor a
--                          room is on), sort_order. Two levels only; a floor
--                          is a place too, so a chore can be for a whole
--                          floor. Names unique per floor, not per household.
--   household_tasks      + spot: the part of a room a chore is for ("Sink").
--   organise_rooms()     one step for "Sort your rooms into floors" (and its
--                          Undo): create or update places, move chores, delete
--                          emptied rooms, in one transaction.
--
-- Additive. Every existing room becomes kind 'room' with no floor; every
-- existing chore keeps spot null (the whole room). RLS is unchanged: 105's
-- policies cover the new columns (everyone in the household reads; only
-- household_members write), and 128's guard already stops staff phones
-- changing a chore's spot (its UPDATE check is an allowlist).
-- ============================================================================

-- ---- The columns -------------------------------------------------------------
alter table public.household_locations
  add column if not exists kind text not null default 'room',
  add column if not exists parent_id uuid,
  add column if not exists sort_order integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'household_locations_kind_check') then
    alter table public.household_locations
      add constraint household_locations_kind_check check (kind in ('room', 'floor'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'household_locations_not_own_parent') then
    alter table public.household_locations
      add constraint household_locations_not_own_parent check (parent_id is null or parent_id <> id);
  end if;
  -- The floor a room is on, always in the same household; deleting a floor
  -- leaves its rooms with no floor (the trigger below renames clashes first).
  if not exists (select 1 from pg_constraint where conname = 'household_locations_parent_fkey') then
    alter table public.household_locations
      add constraint household_locations_parent_fkey
      foreign key (parent_id, household_id)
      references public.household_locations (id, household_id)
      on delete set null (parent_id);
  end if;
end $$;

create index if not exists household_locations_parent_id_idx
  on public.household_locations (parent_id)
  where parent_id is not null;

-- Names are unique per floor: "Service Area" can be on LT1 and on LT2. Rooms
-- with no floor, and floors themselves (parent null), share one namespace.
drop index if exists public.household_locations_name_unique;
create unique index if not exists household_locations_name_per_floor
  on public.household_locations (household_id, parent_id, lower(btrim(name))) nulls not distinct;

alter table public.household_tasks add column if not exists spot text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'household_tasks_spot_check') then
    alter table public.household_tasks
      add constraint household_tasks_spot_check
      check (spot is null or char_length(btrim(spot)) between 1 and 40);
  end if;
end $$;

-- ---- Two levels only ----------------------------------------------------------
-- A floor has no floor; a room's floor must be a floor; a floor with rooms
-- can't become a room. SECURITY INVOKER: it reads only the caller's own
-- household's rows, which RLS already lets them see.
create or replace function public.household_locations_two_levels()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.kind = 'floor' and new.parent_id is not null then
    raise exception 'floor_has_no_floor' using errcode = '23514';
  end if;
  if new.parent_id is not null and not exists (
    select 1 from public.household_locations f
     where f.id = new.parent_id and f.household_id = new.household_id and f.kind = 'floor'
  ) then
    raise exception 'parent_must_be_floor' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and old.kind = 'floor' and new.kind = 'room' and exists (
    select 1 from public.household_locations r where r.parent_id = new.id
  ) then
    raise exception 'floor_still_has_rooms' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.household_locations_two_levels() from public, anon, authenticated;
grant execute on function public.household_locations_two_levels() to service_role;

drop trigger if exists household_locations_two_levels on public.household_locations;
create trigger household_locations_two_levels
  before insert or update on public.household_locations
  for each row execute function public.household_locations_two_levels();

-- ---- Deleting a floor never fails on a name clash ------------------------------
-- Its rooms move to "no floor", where a room of the same name may already be.
-- A clashing room gets its floor back in front ("Service Area" → "LT2 Service
-- Area"), then a number ("LT2 Service Area 2"), shortened to stay within 105's
-- 60 characters. Detaches the rooms itself; the FK's set null is the backstop.
create or replace function public.household_locations_release_floor()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  room record;
  prefix text;
  candidate text;
  n integer;
  suffix text;
begin
  if old.kind <> 'floor' then
    return old;
  end if;
  prefix := btrim(old.name) || ' ';
  for room in
    select id, name from public.household_locations
     where parent_id = old.id
     order by sort_order, name
  loop
    candidate := btrim(room.name);
    n := 1;
    while exists (
      select 1 from public.household_locations o
       where o.household_id = old.household_id and o.parent_id is null and o.id <> room.id
         and lower(btrim(o.name)) = lower(candidate)
    ) loop
      suffix := case when n = 1 then '' else ' ' || n end;
      candidate := btrim(left(prefix || btrim(room.name), 60 - char_length(suffix))) || suffix;
      -- The floor's own name can be long too: never past 60 characters.
      candidate := btrim(left(candidate, 60));
      n := n + 1;
      if n > 1000 then
        raise exception 'could_not_rename_room' using errcode = '23505';
      end if;
    end loop;
    update public.household_locations set parent_id = null, name = candidate where id = room.id;
  end loop;
  return old;
end;
$$;

revoke all on function public.household_locations_release_floor() from public, anon, authenticated;
grant execute on function public.household_locations_release_floor() to service_role;

drop trigger if exists household_locations_release_floor on public.household_locations;
create trigger household_locations_release_floor
  before delete on public.household_locations
  for each row execute function public.household_locations_release_floor();

-- ---- 128's guard: a staff phone's materialised day copies the spot too --------
-- Same function as migrations/128, with spot added to the template-copy check.
create or replace function public.household_tasks_owner_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_household uuid := coalesce(new.household_id, old.household_id);
  template public.household_tasks;
  staff_columns constant text[] := array[
    'assigned_to', 'status', 'completed_by', 'completed_at',
    'photo_url', 'before_photo_url', 'after_photo_url'
  ];
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  if exists (
    select 1 from public.household_members m
     where m.user_id = auth.uid() and m.household_id = target_household
  ) then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    raise exception 'chore_owner_only' using errcode = '42501';
  end if;

  if new.status is distinct from 'pending' and new.status is distinct from 'completed' then
    raise exception 'chore_owner_only' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - staff_columns) is distinct from (to_jsonb(old) - staff_columns) then
      raise exception 'chore_owner_only' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.parent_task_id is null then
    raise exception 'chore_owner_only' using errcode = '42501';
  end if;
  select * into template
    from public.household_tasks t
   where t.id = new.parent_task_id
     and t.household_id = new.household_id
     and t.parent_task_id is null
     and coalesce(t.recurrence, 'none') <> 'none';
  if not found then
    raise exception 'chore_owner_only' using errcode = '42501';
  end if;
  if (new.title, new.notes, new.category, new.due_time, new.requires_supervision, new.location_id, new.spot)
     is distinct from
     (template.title, template.notes, template.category, template.due_time,
      coalesce(template.requires_supervision, false), template.location_id, template.spot)
     or coalesce(new.recurrence, 'none') <> 'none'
     or new.recurrence_until is not null
     or not public.chore_occurs_on(template, new.due_date)
  then
    raise exception 'chore_owner_only' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.household_tasks_owner_guard() from public, anon, authenticated;
grant execute on function public.household_tasks_owner_guard() to service_role;

-- ---- Sort your rooms into floors, in one step ----------------------------------
-- p_plan (built and shown on the owner's phone first):
--   { "household_id": uuid,
--     "places":  [ { "id", "name", "kind", "parent_id", "sort_order" } ]
--                upserted in the order given (floors before their rooms;
--                for Undo, rooms back off a floor before it becomes a room),
--     "merges":  [ { "from", "into", "spot" } ]
--                every chore of room "from" — history included, so none
--                loses its room — moves to "into" with that spot,
--     "chores":  [ { "id", "location_id", "spot", "title" } ]
--                each key present is set ("spot": null clears it),
--     "delete":  [ uuid ]  emptied rooms, deleted last }
-- Returns { "moved": [ { "id", "location_id", "spot" } ] }: what each merged
-- chore was before, so the phone's Undo can put every one back.
-- SECURITY INVOKER: the caller's RLS applies to every row (only owners write
-- rooms; 128's guard stops staff phones on chores), plus an explicit owner
-- check for a clear error. One transaction: all of it, or nothing.
drop function if exists public.organise_rooms(jsonb);
create or replace function public.organise_rooms(p_plan jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  hid uuid := (p_plan ->> 'household_id')::uuid;
  place jsonb;
  chore jsonb;
  merge jsonb;
  pid uuid;
  touched integer;
  moved jsonb := '[]'::jsonb;
begin
  if hid is null or not exists (
    select 1 from public.household_members m where m.user_id = auth.uid() and m.household_id = hid
  ) then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  if jsonb_array_length(coalesce(p_plan -> 'places', '[]')) > 500
     -- Room for an Undo: up to 20,000 moved chores plus 2,000 linked ones.
     or jsonb_array_length(coalesce(p_plan -> 'chores', '[]')) > 22000
     or jsonb_array_length(coalesce(p_plan -> 'merges', '[]')) > 500
     or jsonb_array_length(coalesce(p_plan -> 'delete', '[]')) > 500 then
    raise exception 'plan_too_large' using errcode = '22023';
  end if;

  for place in select * from jsonb_array_elements(coalesce(p_plan -> 'places', '[]')) loop
    pid := (place ->> 'id')::uuid;
    update public.household_locations
       set name = coalesce(place ->> 'name', name),
           kind = coalesce(place ->> 'kind', kind),
           parent_id = case when place ? 'parent_id' then (place ->> 'parent_id')::uuid else parent_id end,
           sort_order = coalesce((place ->> 'sort_order')::integer, sort_order)
     where id = pid and household_id = hid;
    get diagnostics touched = row_count;
    if touched = 0 then
      if exists (select 1 from public.household_locations where id = pid) then
        raise exception 'not_this_household' using errcode = '42501';
      end if;
      insert into public.household_locations (id, household_id, name, kind, parent_id, sort_order)
      values (pid, hid, place ->> 'name', coalesce(place ->> 'kind', 'room'),
              (place ->> 'parent_id')::uuid, coalesce((place ->> 'sort_order')::integer, 0));
    end if;
  end loop;

  -- Never merge into a room this plan deletes: its chores would lose their
  -- room when it goes (Codex, #34).
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_plan -> 'merges', '[]')) m
     where (m ->> 'into') in (select value #>> '{}' from jsonb_array_elements(coalesce(p_plan -> 'delete', '[]')))
  ) then
    raise exception 'merge_into_deleted_room' using errcode = '22023';
  end if;

  for merge in select * from jsonb_array_elements(coalesce(p_plan -> 'merges', '[]')) loop
    if not exists (select 1 from public.household_locations where id = (merge ->> 'into')::uuid and household_id = hid)
       or not exists (select 1 from public.household_locations where id = (merge ->> 'from')::uuid and household_id = hid) then
      raise exception 'not_this_household' using errcode = '42501';
    end if;
    select moved || coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'location_id', t.location_id, 'spot', t.spot)), '[]'::jsonb)
      into moved
      from public.household_tasks t
     where t.household_id = hid and t.location_id = (merge ->> 'from')::uuid;
    update public.household_tasks
       set location_id = (merge ->> 'into')::uuid,
           spot = coalesce(spot, merge ->> 'spot')
     where household_id = hid and location_id = (merge ->> 'from')::uuid;
  end loop;
  -- A sort that succeeds must be undoable in one step: the Undo lists every
  -- moved chore, so refuse (and roll back) a merge too big for that (Codex, #34).
  if jsonb_array_length(moved) > 20000
     or jsonb_array_length(moved) + jsonb_array_length(coalesce(p_plan -> 'chores', '[]')) > 22000 then
    raise exception 'plan_too_large' using errcode = '22023';
  end if;

  for chore in select * from jsonb_array_elements(coalesce(p_plan -> 'chores', '[]')) loop
    update public.household_tasks
       set location_id = case when chore ? 'location_id' then (chore ->> 'location_id')::uuid else location_id end,
           spot = case when chore ? 'spot' then chore ->> 'spot' else spot end,
           title = coalesce(chore ->> 'title', title)
     where id = (chore ->> 'id')::uuid and household_id = hid;
    get diagnostics touched = row_count;
    if touched = 0 then
      raise exception 'not_this_household' using errcode = '42501';
    end if;
  end loop;

  delete from public.household_locations
   where household_id = hid
     and id in (select (value #>> '{}')::uuid from jsonb_array_elements(coalesce(p_plan -> 'delete', '[]')));

  return jsonb_build_object('moved', moved);
end;
$$;

revoke all on function public.organise_rooms(jsonb) from public, anon;
grant execute on function public.organise_rooms(jsonb) to authenticated, service_role;
