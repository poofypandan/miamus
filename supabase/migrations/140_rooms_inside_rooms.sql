-- ============================================================================
-- 140 — Rooms inside rooms (Phase 168, PR A; docs/phase-168-suites-plan.md)
-- ============================================================================
-- Owner decisions (2026-11-10): D1–D8 all A (delegated to the
-- recommendations).
--
--   household_locations  a room may sit inside a room, one level deep:
--                          floor → room → room inside (→ spot, on chores).
--                          No new column: parent_id may now point at a
--                          top-level room. Names stay unique per parent
--                          (129's index), so each bedroom can hold its own
--                          "Bathroom".
--   deleting a room      its rooms inside move out to where it was, as
--                          "GB1 Bathroom", never deleted.
--   deleting a household no longer trips the release trigger (it failed for
--                          any household with floors and rooms, which also
--                          stopped 127's hourly deletion job).
--   repair_place_label() walks up two parents: "LT2 · GB1 · Bathroom · Shower".
--
-- Additive: nothing nests until an owner nests a room. RLS is unchanged
-- (105's policies: everyone in the household reads, only household_members
-- write). No new SECURITY DEFINER function. organise_rooms (129) is unchanged;
-- this trigger checks every row it writes.
-- ============================================================================

-- ---- One level inside a room -----------------------------------------------------
-- Replaces 129's two-levels rules:
--   - a floor has no parent, and a room that holds rooms can't become one;
--   - a place's parent is a floor or a top-level room of the same household;
--   - a room that holds rooms can't go inside a room (one level only);
--   - a floor with rooms can't become a room (unchanged).
-- The parent row is taken FOR SHARE, so two phones can't build a third level
-- at once (nesting A in B while nesting B in C): whichever comes second waits
-- for the first and then sees its change.
-- SECURITY INVOKER: it reads only the caller's own household's rows, which
-- RLS already lets owners see and change.
create or replace function public.household_locations_two_levels()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  parent_kind text;
  grandparent uuid;
begin
  if new.kind = 'floor' and new.parent_id is not null then
    raise exception 'floor_has_no_floor' using errcode = '23514';
  end if;

  if new.parent_id is not null then
    select p.kind, p.parent_id into parent_kind, grandparent
      from public.household_locations p
     where p.id = new.parent_id and p.household_id = new.household_id
       for share;
    if not found then
      raise exception 'parent_must_be_floor_or_room' using errcode = '23514';
    end if;
    if parent_kind = 'room' then
      -- The parent must be a top-level room: on a floor or on no floor.
      if grandparent is not null and exists (
        select 1 from public.household_locations g
         where g.id = grandparent and g.kind = 'room'
      ) then
        raise exception 'rooms_inside_one_level' using errcode = '23514';
      end if;
      -- And this room can't bring rooms of its own along.
      if tg_op = 'UPDATE' and exists (
        select 1 from public.household_locations c where c.parent_id = new.id
      ) then
        raise exception 'rooms_inside_one_level' using errcode = '23514';
      end if;
    end if;
  end if;

  if tg_op = 'UPDATE' and old.kind = 'floor' and new.kind = 'room' and exists (
    select 1 from public.household_locations r where r.parent_id = new.id
  ) then
    raise exception 'floor_still_has_rooms' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and old.kind = 'room' and new.kind = 'floor' and exists (
    select 1 from public.household_locations r where r.parent_id = new.id
  ) then
    raise exception 'room_still_has_rooms_inside' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.household_locations_two_levels() from public, anon, authenticated;
grant execute on function public.household_locations_two_levels() to service_role;

-- ---- Deleting a floor or a room never deletes what's inside ------------------------
-- A floor: its rooms move to "No floor yet" (unchanged from 129); a clash
-- gets the floor's name in front ("LT2 Service Area"), then a number.
-- A room: its rooms inside move to where it was (its floor, or no floor),
-- always with its name in front ("Bathroom" in GB1 → "GB1 Bathroom"), since a
-- bare "Bathroom" would no longer say whose it is; then a number on a clash.
-- Both stay within 105's 60 characters. Rooms inside a room on a deleted floor
-- stay inside it. The FK's set null stays the backstop.
-- When the household itself is being deleted, there is nothing to keep: its
-- row is already gone, and moving rooms would fail on the household FK.
create or replace function public.household_locations_release_floor()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  child record;
  full_name text;
  candidate text;
  k integer;
  target uuid;
begin
  if not exists (select 1 from public.households h where h.id = old.household_id) then
    return old;
  end if;
  -- A floor's rooms go to no floor; a room's rooms inside go to its parent.
  target := case when old.kind = 'floor' then null else old.parent_id end;
  for child in
    select id, name from public.household_locations
     where parent_id = old.id
     order by sort_order, name
  loop
    full_name := btrim(old.name) || ' ' || btrim(child.name);
    k := 0;
    loop
      -- A floor's room: its own name, then the floor in front, then numbers
      -- (as 129). A room inside: the room in front at once, then numbers.
      if old.kind = 'floor' and k = 0 then
        candidate := btrim(child.name);
      elsif (old.kind = 'floor' and k = 1) or (old.kind <> 'floor' and k = 0) then
        candidate := btrim(left(full_name, 60));
      else
        candidate := btrim(left(full_name, 60 - char_length(' ' || (k + case when old.kind = 'floor' then 0 else 1 end))))
                     || ' ' || (k + case when old.kind = 'floor' then 0 else 1 end);
      end if;
      exit when not exists (
        select 1 from public.household_locations o
         where o.household_id = old.household_id
           and o.parent_id is not distinct from target
           -- The place being deleted still holds its name until it goes.
           and o.id <> child.id
           and lower(btrim(o.name)) = lower(candidate)
      );
      k := k + 1;
      if k > 1000 then
        raise exception 'could_not_rename_room' using errcode = '23505';
      end if;
    end loop;
    update public.household_locations set parent_id = target, name = candidate where id = child.id;
  end loop;
  return old;
end;
$$;

revoke all on function public.household_locations_release_floor() from public, anon, authenticated;
grant execute on function public.household_locations_release_floor() to service_role;

-- The trigger itself is unchanged from 129 (before delete, for each row).

-- ---- Repairs say the whole path ---------------------------------------------------
-- "Floor · Room · Room inside · Spot", or nothing: how a repair's place reads
-- in an urgent push (130's notify_urgent_repair). Walks up two parents.
create or replace function public.repair_place_label(p_location_id uuid, p_spot text)
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(concat_ws(' · ', g.name, p.name, l.name, nullif(btrim(p_spot), '')), '')
    from (select 1) one
    left join public.household_locations l on l.id = p_location_id
    left join public.household_locations p on p.id = l.parent_id
    left join public.household_locations g on g.id = p.parent_id;
$$;

revoke all on function public.repair_place_label(uuid, text) from public, anon, authenticated;
grant execute on function public.repair_place_label(uuid, text) to service_role;
