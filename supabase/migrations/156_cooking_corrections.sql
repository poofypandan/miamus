-- ============================================================================
-- 156 — Changing what cooking used, and recipes that learn (Phase 177 PR 1)
-- ============================================================================
-- docs/phase-177-cooking-corrections-plan.md, section 6 "Data model:
-- migration 156". Additive only. Builds on 151 (recipes), 153 (menu_dishes,
-- cook_menu_dish, uncook_menu_dish, convert_kitchen_amount) and 154 (an item
-- that is Out has no date). Numbered 156: reserved by the manager. The
-- owner accepted the four defaults of section 13 (changes until the end of
-- the day the dish was cooked; staff may change; three dishes at 10%; Keep
-- recipe is final), all app rules except the server's 30-hour backstop.
--
-- NEW
--   recipes.hints_off  uuid[], not null, default '{}', at most 200 ids: the
--        items the owner said "Keep recipe" for, so the phone never suggests
--        a new amount for them again. Written by owners with an ordinary
--        update under the policy that exists (admin_update_recipes,
--        is_household_admin). Staff phones cannot write it (no policy lets
--        them update recipes). save_recipe names its columns, so it leaves
--        this one alone. An id of an item deleted later is harmless. Like any
--        update of a recipe, writing it moves updated_at (151's trigger),
--        which only restarts the phone's count of dishes for that recipe: a
--        suggestion may come later, never wrongly.
--   change_cooked_uses(dish, uses, staff, was)  "Change what was used" on a
--        cooked dish, the same day. Takes the whole new list (as
--        cook_menu_dish takes it) and applies only the difference to stock.
--
-- RE-CREATED (each from its newest definition, 153; same signatures)
--   cook_menu_dish    as 153, plus: each line may carry `planned` (what the
--        recipe asked for, before the person's taps; null, or above 0 and at
--        most 100,000); an entry is written for EVERY line sent, also when
--        nothing was there to take (amount 0), with `said` (what the person
--        confirmed), `planned` and, when less came off than was said,
--        `short`; an item that had a date and lost it (it went Out, 154)
--        gets `cleared_date` on its entry.
--   uncook_menu_dish  as 153, plus: an entry with amount 0 is skipped, and an
--        entry's `cleared_date` goes back on the item in the same update as
--        the amount, if the item has no date by then.
--
-- A cooked_uses ENTRY (menu_dishes.cooked_uses stays a jsonb array, written
-- only by these three functions; 153's trigger refuses every other writer):
--   item_id, unit  as 153.
--   amount         what came off stock (what Undo puts back). May be 0.
--   said           what the person confirmed, in the entry's unit. Absent on
--                  entries from before 156 (read as amount). 0 once the
--                  ingredient was unticked in a change: the entry stays and
--                  reads as "not used" everywhere.
--   short          said - amount when the entry was created (what was
--                  missing). Written once, never changed. Absent means 0.
--   planned        what the recipe asked for at the servings cooked, in the
--                  entry's unit. Absent when the phone did not send it.
--   cleared_date   the date the item had when this dish emptied it.
--
-- WHO MAY DO WHAT.
--   change_cooked_uses: SECURITY DEFINER, empty search_path, EXECUTE revoked
--        from public and anon and granted to authenticated and service_role.
--        DELIBERATELY OPEN TO STAFF PHONES, the same documented exception to
--        the admin guard as cook_menu_dish and uncook_menu_dish (153):
--        cooking is staff work (D9), and the person who cooked knows what
--        went in (section 13, default 2). The check is household membership
--        (get_user_household_ids()). It changes only the dish's cooked_uses
--        and the quantity (and, when restoring, the date) of the household's
--        own tracked items, all things a staff phone may already change
--        (148: staff adjust amounts; 154: staff set dates). A staff id must
--        be a non-archived member of the dish's household. cooked_at and
--        cooked_by are never touched: the cook stays the cook.
--   cook_menu_dish / uncook_menu_dish keep 153's grants (re-stated below).
--   No new table, no new policy, no change to RLS. anon gets nothing.
--
-- ORDER OF LOCKS. change_cooked_uses locks the dish, then each item in item
-- id order, the order cook_menu_dish and uncook_menu_dish use, so the three
-- never deadlock with each other.
--
-- EXPORT. export_household_data (153) writes cooked_uses as it is and whole
-- rows of recipes, so the new keys and hints_off are in the export with no
-- change here (checked in the test).
--
-- PRIVACY. No new kind of personal data: amounts of ingredients a dish took
-- and the ids of ingredients a recipe should not suggest. No new "who did
-- it" column, no new service, nothing sent to Kakak, same region, no prices.
-- The manager confirms the privacy policy needs no change (plan, 6g).
--
-- Test: supabase/tests/156_cooking_corrections.sql (local only).
-- ============================================================================

-- --- 1. recipes.hints_off ------------------------------------------------------------------
alter table public.recipes
  add column if not exists hints_off uuid[] not null default '{}';
alter table public.recipes drop constraint if exists recipes_hints_off_size;
alter table public.recipes add constraint recipes_hints_off_size
  check (cardinality(hints_off) <= 200);

-- --- 2. Cooking (153's body, plus said / short / planned / cleared_date) ------------------
-- cook_menu_dish(dish, uses, staff): uses = [{item_id, amount, unit?, planned?}, ...].
-- As 153: the dish is locked, one already cooked is refused (already_cooked),
-- every item is a tracked item of the dish's household, every amount > 0 and
-- <= 100,000, at most 200 lines, lines of one item summed, converted to the
-- item's unit (unit_mismatch when it doesn't convert), quantity floored at 0.
-- New: an entry for every line, with said / short / planned / cleared_date.
create or replace function public.cook_menu_dish(p_dish_id uuid, p_uses jsonb default '[]'::jsonb, p_staff_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.menu_dishes;
  v_uses jsonb := coalesce(p_uses, '[]'::jsonb);
  line record;
  it public.inventory_items;
  had_date date;
  amount numeric;
  planned numeric;
  taken numeric;
  entry jsonb;
  took jsonb := '[]'::jsonb;
  changed jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into d from public.menu_dishes where id = p_dish_id for update;
  if not found or not (d.household_id = any (public.get_user_household_ids())) then
    raise exception 'not_found' using errcode = '42501';
  end if;
  if d.cooked_at is not null then
    raise exception 'already_cooked' using errcode = '55000';
  end if;
  if p_staff_id is not null and not exists (
    select 1 from public.staff_profiles s
     where s.id = p_staff_id and s.household_id = d.household_id and s.archived_at is null
  ) then
    raise exception 'staff_not_in_household' using errcode = '42501';
  end if;
  if jsonb_typeof(v_uses) <> 'array' or jsonb_array_length(v_uses) > 200 then
    raise exception 'bad_uses' using errcode = '22023';
  end if;

  -- Lines of one item are summed (in one unit: two units for one item refuse).
  -- planned is summed too, and null when any line of the item lacks it.
  for line in
    select (e ->> 'item_id')::uuid as item_id, sum((e ->> 'amount')::numeric) as amount,
           min(e ->> 'unit') as unit, count(distinct e ->> 'unit') as units,
           bool_or((e ->> 'amount') is null or (e ->> 'amount')::numeric <= 0 or (e ->> 'amount')::numeric > 100000) as bad,
           case when bool_and(nullif(e ->> 'planned', '') is not null)
                then sum((e ->> 'planned')::numeric) end as planned,
           bool_or(nullif(e ->> 'planned', '') is not null
                   and ((e ->> 'planned')::numeric <= 0 or (e ->> 'planned')::numeric > 100000)) as bad_planned
      from jsonb_array_elements(v_uses) e
     group by 1
     order by 1
  loop
    if line.item_id is null or line.bad or line.amount > 100000 or line.bad_planned or line.planned > 100000 then
      raise exception 'bad_amount' using errcode = '22023';
    end if;
    select * into it from public.inventory_items
     where id = line.item_id and household_id = d.household_id
     for update;
    if not found or not it.track_amount then
      raise exception 'item_not_tracked' using errcode = '42501';
    end if;
    amount := case when line.unit is null then line.amount
                   else public.convert_kitchen_amount(line.amount, line.unit, it.unit) end;
    if line.units > 1 or amount is null then
      raise exception 'unit_mismatch' using errcode = '22023';
    end if;
    planned := case when line.planned is null or line.unit is null then line.planned
                    else public.convert_kitchen_amount(line.planned, line.unit, it.unit) end;
    had_date := it.expires_on;
    taken := greatest(least(it.quantity, amount), 0);
    if taken > 0 then
      update public.inventory_items
         set quantity = greatest(quantity - amount, 0),
             amount_set_by = p_staff_id
       where id = it.id
      returning * into it;
    end if;
    entry := jsonb_build_object('item_id', it.id, 'amount', taken, 'unit', it.unit, 'said', amount);
    if amount > taken then
      entry := entry || jsonb_build_object('short', amount - taken);
    end if;
    if planned is not null then
      entry := entry || jsonb_build_object('planned', planned);
    end if;
    if had_date is not null and it.expires_on is null then
      entry := entry || jsonb_build_object('cleared_date', had_date);
    end if;
    took := took || jsonb_build_array(entry);
    changed := changed || jsonb_build_array(to_jsonb(it));
  end loop;

  update public.menu_dishes
     set cooked_at = now(), cooked_by = p_staff_id, cooked_uses = took
   where id = d.id
  returning * into d;
  return jsonb_build_object('dish', to_jsonb(d), 'items', changed);
end;
$$;

-- --- 3. Its Undo (153's body, plus amount 0 skipped and the date put back) ---------------
-- uncook_menu_dish(dish): puts back exactly what cooked_uses says was taken
-- (on items that still exist and are still tracked), converted to the
-- item's unit now; an item whose unit no longer converts is skipped and
-- listed in "skipped". An entry with amount 0 has nothing to put back. An
-- entry's cleared_date goes back on the item if it has no date now (a date
-- someone set meanwhile is kept). Then clears the three columns. A dish
-- that isn't cooked is returned as it is. Returns { dish, items, skipped }.
create or replace function public.uncook_menu_dish(p_dish_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.menu_dishes;
  line record;
  it public.inventory_items;
  back numeric;
  changed jsonb := '[]'::jsonb;
  skipped jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into d from public.menu_dishes where id = p_dish_id for update;
  if not found or not (d.household_id = any (public.get_user_household_ids())) then
    raise exception 'not_found' using errcode = '42501';
  end if;
  if d.cooked_at is null then
    return jsonb_build_object('dish', to_jsonb(d), 'items', changed, 'skipped', skipped);
  end if;

  for line in
    select (e ->> 'item_id')::uuid as item_id, e ->> 'unit' as unit, sum((e ->> 'amount')::numeric) as amount,
           min(nullif(e ->> 'cleared_date', ''))::date as cleared_date
      from jsonb_array_elements(coalesce(d.cooked_uses, '[]'::jsonb)) e
     group by 1, 2
     order by 1, 2
  loop
    if not (line.amount > 0) then
      continue;
    end if;
    select * into it from public.inventory_items
     where id = line.item_id and household_id = d.household_id and track_amount
     for update;
    if not found then
      continue;
    end if;
    back := case when line.unit is null then line.amount
                 else public.convert_kitchen_amount(line.amount, line.unit, it.unit) end;
    if back is null then
      skipped := skipped || jsonb_build_array(jsonb_build_object('item_id', it.id, 'amount', line.amount, 'unit', line.unit));
      continue;
    end if;
    update public.inventory_items
       set quantity = quantity + back,
           expires_on = coalesce(expires_on, line.cleared_date),
           amount_set_by = case
             when d.cooked_by is not null and exists (
               select 1 from public.staff_profiles s where s.id = d.cooked_by and s.archived_at is null
             ) then d.cooked_by
             else null
           end
     where id = it.id
    returning * into it;
    changed := changed || jsonb_build_array(to_jsonb(it));
  end loop;

  update public.menu_dishes
     set cooked_at = null, cooked_by = null, cooked_uses = null
   where id = d.id
  returning * into d;
  return jsonb_build_object('dish', to_jsonb(d), 'items', changed, 'skipped', skipped);
end;
$$;

-- --- 4. Change what was used --------------------------------------------------------------
-- change_cooked_uses(dish, uses, staff, was): uses is the WHOLE new list, as
-- cook_menu_dish takes it (an unticked ingredient is simply not in it); was
-- is cooked_uses exactly as the phone read it. Refusals, in order, by name
-- (the phone matches on them): not_found; not_cooked; too_late (more than
-- 30 hours after cooked_at: the screen offers it only on the day, the
-- margin covers WITA/WIT and a clock a little off); changed_elsewhere (was
-- given and different, a null on either side read as []);
-- staff_not_in_household; bad_uses; bad_amount; unit_mismatch;
-- item_not_tracked.
--
-- Then, per item in the old entries or in uses, in item id order, in the
-- item's unit now:
--   took = the old amount, said_before = the old said (else amount),
--   short = the old short (else 0), want = the new amount (0 when absent).
--   want = said_before: not written, the entry stays exactly as it is.
--   Otherwise target = greatest(want - short, 0), what should be off stock:
--     less than took: took - target goes back, amount = target, and the
--       entry's cleared_date goes back on the item if it has no date (the
--       key is dropped either way: the item is no longer emptied by this);
--     more: least(quantity, target - took) comes off, amount grows by that;
--       an item emptied that way that had a date gets cleared_date.
--   The entry keeps said = want (0 for an unticked one: the entry stays, so
--   short is never lost), short as it was (a new entry: want - amount when
--   above 0), and planned (the old one, converted; else the one sent).
-- An item that is gone, no longer tracked, or whose unit no longer converts
-- from the entry's: refused if uses names it, else its entry is kept as it
-- is. Every item written gets amount_set_by = staff; the amount rules
-- trigger does the rest. A list sent again unchanged writes nothing.
-- Returns { dish, items } (the items written).
create or replace function public.change_cooked_uses(
  p_dish_id uuid,
  p_uses jsonb default '[]'::jsonb,
  p_staff_id uuid default null,
  p_was jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.menu_dishes;
  v_uses jsonb := coalesce(p_uses, '[]'::jsonb);
  v_old jsonb;
  v_was jsonb;
  v_item uuid;
  n record;
  o record;
  it public.inventory_items;
  had_date date;
  want numeric;
  took numeric;
  said_before numeric;
  short numeric;
  planned numeric;
  target numeric;
  moved numeric;
  cleared text;
  entry jsonb;
  result jsonb := '[]'::jsonb;
  changed jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into d from public.menu_dishes where id = p_dish_id for update;
  if not found or not (d.household_id = any (public.get_user_household_ids())) then
    raise exception 'not_found' using errcode = '42501';
  end if;
  if d.cooked_at is null then
    raise exception 'not_cooked' using errcode = '55000';
  end if;
  if d.cooked_at < now() - interval '30 hours' then
    raise exception 'too_late' using errcode = '55000';
  end if;
  v_old := case when d.cooked_uses is null or jsonb_typeof(d.cooked_uses) = 'null' then '[]'::jsonb else d.cooked_uses end;
  if p_was is not null then
    v_was := case when jsonb_typeof(p_was) = 'null' then '[]'::jsonb else p_was end;
    if v_was is distinct from v_old then
      raise exception 'changed_elsewhere' using errcode = '55000';
    end if;
  end if;
  if p_staff_id is not null and not exists (
    select 1 from public.staff_profiles s
     where s.id = p_staff_id and s.household_id = d.household_id and s.archived_at is null
  ) then
    raise exception 'staff_not_in_household' using errcode = '42501';
  end if;
  if jsonb_typeof(v_uses) <> 'array' or jsonb_array_length(v_uses) > 200 then
    raise exception 'bad_uses' using errcode = '22023';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(v_uses) e
     group by (e ->> 'item_id')
    having (e ->> 'item_id') is null
        or bool_or((e ->> 'amount') is null or (e ->> 'amount')::numeric <= 0 or (e ->> 'amount')::numeric > 100000)
        or sum((e ->> 'amount')::numeric) > 100000
        or bool_or(nullif(e ->> 'planned', '') is not null
                   and ((e ->> 'planned')::numeric <= 0 or (e ->> 'planned')::numeric > 100000))
        or sum(nullif(e ->> 'planned', '')::numeric) > 100000
  ) then
    raise exception 'bad_amount' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_uses) e
     group by (e ->> 'item_id') having count(distinct e ->> 'unit') > 1
  ) then
    raise exception 'unit_mismatch' using errcode = '22023';
  end if;

  for v_item in
    select x.id from (
      select (e ->> 'item_id')::uuid as id from jsonb_array_elements(v_old) e
      union
      select (e ->> 'item_id')::uuid from jsonb_array_elements(v_uses) e
    ) x
     where x.id is not null
     order by 1
  loop
    -- The new line for this item (lines of one item summed), if any.
    select sum((e ->> 'amount')::numeric) as amount, min(e ->> 'unit') as unit, count(*) as lines,
           case when bool_and(nullif(e ->> 'planned', '') is not null)
                then sum((e ->> 'planned')::numeric) end as planned
      into n
      from jsonb_array_elements(v_uses) e
     where (e ->> 'item_id')::uuid = v_item;

    select * into it from public.inventory_items
     where id = v_item and household_id = d.household_id
     for update;
    if not found or not it.track_amount then
      if n.lines > 0 then
        raise exception 'item_not_tracked' using errcode = '42501';
      end if;
      result := result || coalesce((
        select jsonb_agg(e order by ord) from jsonb_array_elements(v_old) with ordinality x(e, ord)
         where (e ->> 'item_id')::uuid = v_item
      ), '[]'::jsonb);
      continue;
    end if;

    -- The old entry (one per item; summed if ever more), in the item's unit now.
    select count(*) as entries,
           sum(public.convert_kitchen_amount((e ->> 'amount')::numeric, coalesce(e ->> 'unit', it.unit), it.unit)) as took,
           sum(public.convert_kitchen_amount(coalesce((e ->> 'said')::numeric, (e ->> 'amount')::numeric),
                                             coalesce(e ->> 'unit', it.unit), it.unit)) as said,
           sum(public.convert_kitchen_amount(coalesce((e ->> 'short')::numeric, 0), coalesce(e ->> 'unit', it.unit), it.unit)) as short,
           case when bool_and(nullif(e ->> 'planned', '') is not null)
                then sum(public.convert_kitchen_amount((e ->> 'planned')::numeric, coalesce(e ->> 'unit', it.unit), it.unit)) end as planned,
           bool_or(public.convert_kitchen_amount(1, coalesce(e ->> 'unit', it.unit), it.unit) is null) as mismatch,
           max(nullif(e ->> 'cleared_date', '')) as cleared_date
      into o
      from jsonb_array_elements(v_old) e
     where (e ->> 'item_id')::uuid = v_item;

    if o.entries > 0 and o.mismatch then
      if n.lines > 0 then
        raise exception 'unit_mismatch' using errcode = '22023';
      end if;
      result := result || coalesce((
        select jsonb_agg(e order by ord) from jsonb_array_elements(v_old) with ordinality x(e, ord)
         where (e ->> 'item_id')::uuid = v_item
      ), '[]'::jsonb);
      continue;
    end if;

    if n.lines > 0 then
      want := case when n.unit is null then n.amount else public.convert_kitchen_amount(n.amount, n.unit, it.unit) end;
      if want is null then
        raise exception 'unit_mismatch' using errcode = '22023';
      end if;
    else
      want := 0;
    end if;
    took := coalesce(o.took, 0);
    said_before := coalesce(o.said, 0);
    short := coalesce(o.short, 0);

    -- Not changed on the sheet: never written, whatever else was changed.
    if o.entries > 0 and want = said_before then
      result := result || coalesce((
        select jsonb_agg(e order by ord) from jsonb_array_elements(v_old) with ordinality x(e, ord)
         where (e ->> 'item_id')::uuid = v_item
      ), '[]'::jsonb);
      continue;
    end if;

    cleared := o.cleared_date;
    had_date := it.expires_on;
    target := greatest(want - short, 0);
    if target < took then
      moved := took - target;
      update public.inventory_items
         set quantity = quantity + moved,
             expires_on = coalesce(expires_on, cleared::date),
             amount_set_by = p_staff_id
       where id = it.id
      returning * into it;
      took := target;
      cleared := null;
      changed := changed || jsonb_build_array(to_jsonb(it));
    elsif target > took then
      moved := least(greatest(it.quantity, 0), target - took);
      if moved > 0 then
        update public.inventory_items
           set quantity = greatest(quantity - moved, 0),
               amount_set_by = p_staff_id
         where id = it.id
        returning * into it;
        took := took + moved;
        if had_date is not null and it.expires_on is null then
          cleared := had_date::text;
        end if;
        changed := changed || jsonb_build_array(to_jsonb(it));
      end if;
    end if;

    if o.entries = 0 then
      short := greatest(want - took, 0);
    end if;
    planned := coalesce(o.planned,
                        case when n.planned is null or n.unit is null then n.planned
                             else public.convert_kitchen_amount(n.planned, n.unit, it.unit) end);
    entry := jsonb_build_object('item_id', it.id, 'amount', took, 'unit', it.unit, 'said', want);
    if short > 0 then
      entry := entry || jsonb_build_object('short', short);
    end if;
    if planned is not null then
      entry := entry || jsonb_build_object('planned', planned);
    end if;
    if cleared is not null then
      entry := entry || jsonb_build_object('cleared_date', cleared);
    end if;
    result := result || jsonb_build_array(entry);
  end loop;

  update public.menu_dishes
     set cooked_uses = result
   where id = d.id
  returning * into d;
  return jsonb_build_object('dish', to_jsonb(d), 'items', changed);
end;
$$;

-- --- 5. Grants --------------------------------------------------------------------------------
revoke all on function public.cook_menu_dish(uuid, jsonb, uuid) from public, anon;
grant execute on function public.cook_menu_dish(uuid, jsonb, uuid) to authenticated, service_role;
revoke all on function public.uncook_menu_dish(uuid) from public, anon;
grant execute on function public.uncook_menu_dish(uuid) to authenticated, service_role;
revoke all on function public.change_cooked_uses(uuid, jsonb, uuid, jsonb) from public, anon;
grant execute on function public.change_cooked_uses(uuid, jsonb, uuid, jsonb) to authenticated, service_role;
