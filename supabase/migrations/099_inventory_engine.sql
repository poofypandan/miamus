-- ============================================================================
-- 099 — The threshold inventory engine (Phase 110)
-- ============================================================================
-- Inventory moves from the Phase 83 box/loose-unit ledger to one number per
-- item: `quantity`, in a named `unit`, flagged low when it reaches
-- `min_threshold`. Items split into two scopes, each with its own shelves:
--
--   pet   food · treats · medicine · grooming · supplies
--   home  cleaning · toiletries · groceries · maintenance
--
-- Additive only. boxes_count / loose_units_count / units_per_box / unit_type
-- stay where they are, unused, rather than being dropped from under any phone
-- still running the previous build.
-- ============================================================================

alter table inventory_items
  add column if not exists scope text,
  add column if not exists quantity numeric not null default 0,
  add column if not exists unit text,
  add column if not exists photo_url text;

-- --- Backfill ---------------------------------------------------------------
-- Stock carried over exactly: what the old ledger called the total.
update inventory_items
   set quantity = boxes_count * units_per_box + loose_units_count;

-- Scope and shelf from the Phase 83 categories (and the Phase 60 catalogue's,
-- for any household that still has those rows).
update inventory_items set scope = case
  when category in ('dog_supplies', 'food', 'treats', 'medicine', 'shampoo', 'pee_pad') then 'pet'
  else 'home'
end;

update inventory_items set category = case
  when category = 'dog_supplies' and name ~* 'food'                         then 'food'
  when category = 'dog_supplies' and name ~* 'tooth|shampoo|brush|wipe|comb' then 'grooming'
  when category = 'dog_supplies'                                             then 'supplies'
  when category = 'shampoo'                                                  then 'grooming'
  when category = 'pee_pad'                                                  then 'supplies'
  when category in ('food', 'treats', 'medicine')                            then category
  when category in ('fresh_food', 'pantry')                                  then 'groceries'
  when category = 'household_supplies'                                       then 'cleaning'
  else 'maintenance'
end;

-- Units onto the fixed list; anything without a close match is counted in
-- pieces, which is what it was being counted in anyway.
update inventory_items set unit = case
  when unit_type in ('pcs', 'pack', 'box', 'bottle', 'roll', 'tube', 'kg', 'g', 'L', 'ml') then unit_type
  when unit_type = 'bag' then 'pack'
  else 'pcs'
end;

-- --- Constraints ------------------------------------------------------------
alter table inventory_items
  alter column scope set default 'home',
  alter column scope set not null,
  alter column unit set default 'pcs',
  alter column unit set not null,
  -- 'other' is not a shelf any more; every insert names its category.
  alter column category drop default;

alter table inventory_items drop constraint if exists inventory_items_scope_check;
alter table inventory_items add constraint inventory_items_scope_check
  check (scope in ('pet', 'home'));

alter table inventory_items drop constraint if exists inventory_items_category_check;
alter table inventory_items add constraint inventory_items_category_check check (
  (scope = 'pet'  and category in ('food', 'treats', 'medicine', 'grooming', 'supplies'))
  or (scope = 'home' and category in ('cleaning', 'toiletries', 'groceries', 'maintenance'))
);

alter table inventory_items drop constraint if exists inventory_items_unit_check;
alter table inventory_items add constraint inventory_items_unit_check
  check (unit in ('pcs', 'pack', 'box', 'bottle', 'roll', 'tube', 'kg', 'g', 'L', 'ml'));

alter table inventory_items drop constraint if exists inventory_items_quantity_check;
alter table inventory_items add constraint inventory_items_quantity_check check (quantity >= 0);

alter table inventory_items drop constraint if exists inventory_items_min_threshold_check;
alter table inventory_items add constraint inventory_items_min_threshold_check
  check (min_threshold >= 0);

-- A stock check now counts one number too. Nullable: older audit rows keep
-- their box/loose split and have no single count.
alter table inventory_audit_logs add column if not exists quantity_counted numeric;

-- --- Owner vs staff, held by the database -----------------------------------
-- Owners and staff phones are both `authenticated` and both pass the tenant
-- policies, so RLS alone cannot tell them apart. This trigger can: a caller
-- with no household_members row (a bound staff device) may change how much is
-- on the shelf, and nothing else — not the name, the shelf, the unit, the
-- threshold or the photo, and it may not add or delete items at all.
--
-- auth.uid() is null for the service role and for migrations, which pass.
create or replace function inventory_items_owner_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_household uuid := coalesce(new.household_id, old.household_id);
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  if exists (
    select 1 from household_members
     where user_id = auth.uid() and household_id = target_household
  ) then
    return coalesce(new, old);
  end if;

  if tg_op <> 'UPDATE' then
    raise exception 'inventory_owner_only' using errcode = '42501';
  end if;

  if (new.household_id, new.name, new.variant, new.scope, new.category, new.unit,
      new.min_threshold, new.photo_url, new.notes, new.audit_frequency_days)
     is distinct from
     (old.household_id, old.name, old.variant, old.scope, old.category, old.unit,
      old.min_threshold, old.photo_url, old.notes, old.audit_frequency_days)
  then
    raise exception 'inventory_owner_only' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_items_owner_guard on inventory_items;
create trigger inventory_items_owner_guard
  before insert or update or delete on inventory_items
  for each row execute function inventory_items_owner_guard();

-- --- The +/- stepper --------------------------------------------------------
-- An increment, not a write of the new total: two phones tapping the same
-- item at once each add their own taps, rather than the later write silently
-- discarding the earlier one. Floored at zero — a shelf cannot hold less than
-- nothing, however many times "-" is pressed.
--
-- SECURITY INVOKER, so the caller's RLS and the guard above both apply.
create or replace function adjust_inventory_quantity(p_item_id uuid, p_delta numeric)
returns setof inventory_items
language sql
security invoker
set search_path = public
as $$
  update inventory_items
     set quantity = greatest(quantity + p_delta, 0)
   where id = p_item_id
  returning *;
$$;

grant execute on function adjust_inventory_quantity(uuid, numeric) to authenticated;
