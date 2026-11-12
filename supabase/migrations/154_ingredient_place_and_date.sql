-- ============================================================================
-- 154 — Where an ingredient is kept and when it expires (Phase 176 PR 1)
-- ============================================================================
-- docs/phase-176-kitchen-places-plan.md, section 4 "Data model and
-- migration". Additive only. Builds on 148 (the amount rules trigger, the
-- owner guard's owner-only list) and 153 (the trigger's newest body).
-- Numbered 154: the next free number above 153 (manager, 2026-11-12).
-- Owner defaults of section 15 accepted: staff may move and date; moving
-- into the freezer keeps the date (an app rule, nothing here).
--
-- NEW
--   inventory_items.kept_in    fridge | freezer | pantry | counter, or null.
--        The same four places as food_items.kept_in (123). Null means nobody
--        has said: the app shows the category's default (Fresh Food in the
--        Fridge, Pantry in the Cupboard) without storing it.
--   inventory_items.expires_on the earliest use-by date among what is there,
--        or null for no date.
--
-- RE-CREATED (from its newest definition)
--   stamp_inventory_stock_status (153)  unchanged except one rule, on INSERT
--        and UPDATE alike: an item that is Out has no date. The function has
--        two exits (the INSERT branch returns early), so the rule sits before
--        each `return new`, after the status is settled. A date from the last
--        pack then never comes back when the item is bought again; it also
--        covers cooking that uses the last of something and a tap on Out.
--        Still plain plpgsql (not SECURITY DEFINER), empty search_path,
--        EXECUTE revoked from public, anon and authenticated as 153 left it.
--
-- NOT CHANGED, ON PURPOSE
--   inventory_items_owner_guard (148)  kept_in and expires_on are left OUT of
--        its owner-only list, deliberately: putting shopping away and taking
--        chicken out to thaw is kitchen work, so a staff phone may move an
--        ingredient and set its date. Staff still cannot add, rename or
--        delete items, or change tracking, units or low levels.
--   RLS on inventory_items: no new policy. No new function, no SECURITY
--        DEFINER. anon keeps no access at all.
--   export_household_data (153) takes whole rows of inventory_items
--        (to_jsonb), so 'supplies' carries both columns with no change here
--        (checked in supabase/tests/154_ingredient_place_and_date.sql).
--
-- NOTHING IS BACKFILLED. Existing rows keep kept_in null and no date. An
-- older cached app never sends the two columns, so its writes leave them
-- alone.
--
-- PRIVACY. No new kind of personal data (a place and a date of an
-- ingredient; no new "who did it" column), no new service, same region, no
-- prices. No privacy-policy change.
-- ============================================================================

-- --- 1. Two nullable columns ---------------------------------------------------------------
alter table public.inventory_items
  add column if not exists kept_in text,
  add column if not exists expires_on date;

alter table public.inventory_items drop constraint if exists inventory_items_kept_in_check;
alter table public.inventory_items add constraint inventory_items_kept_in_check
  check (kept_in is null or kept_in in ('fridge', 'freezer', 'pantry', 'counter'));

-- --- 2. The amount rules (153's body), plus: an item that is Out has no date -------------
create or replace function public.stamp_inventory_stock_status()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  amount_changed boolean;
  tracking_on boolean;
  low_changed boolean;
  derived text;
begin
  if tg_op = 'INSERT' then
    new.amount_set_at := null;
    if new.track_amount then
      new.amount_set_at := now();
      new.stock_status := case
        when new.quantity <= 0 then 'out'
        when new.min_threshold > 0 and new.quantity <= new.min_threshold then 'low'
        else 'ok'
      end;
    end if;
    if new.stock_status = 'ok' then
      new.to_buy_amount := null;
    end if;
    -- (154) An item that is Out has no date.
    if new.stock_status = 'out' then
      new.expires_on := null;
    end if;
    new.stock_status_at := now();
    return new;
  end if;

  new.amount_set_at := old.amount_set_at;

  if new.unit is distinct from old.unit and new.to_buy_amount is not null
     and new.to_buy_amount is not distinct from old.to_buy_amount then
    new.to_buy_amount := public.convert_kitchen_amount(new.to_buy_amount, old.unit, new.unit);
    if new.to_buy_amount is not null and (new.to_buy_amount <= 0 or new.to_buy_amount > 100000) then
      new.to_buy_amount := null;
    end if;
  end if;

  if new.track_amount then
    amount_changed := new.quantity is distinct from old.quantity;
    tracking_on := not old.track_amount;
    low_changed := new.min_threshold is distinct from old.min_threshold;

    if amount_changed or tracking_on then
      new.amount_set_at := now();
    end if;

    if amount_changed or tracking_on or low_changed then
      derived := case
        when new.quantity <= 0 then 'out'
        when new.min_threshold > 0 and new.quantity <= new.min_threshold then 'low'
        else 'ok'
      end;
      -- A shortfall from the menu review stays on the list until bought.
      if derived = 'ok' and new.to_buy_amount is not null and old.stock_status in ('low', 'out') then
        derived := 'low';
      end if;
      -- Credited to whoever changed the amount or the settings in this
      -- write, never to the last person who happened to change the amount.
      if derived is distinct from old.stock_status then
        new.stock_status_by := case
          when amount_changed or tracking_on or new.amount_set_by is distinct from old.amount_set_by
            then new.amount_set_by
          else null
        end;
      end if;
      new.stock_status := derived;
    elsif new.stock_status = 'out' and old.stock_status is distinct from 'out' then
      new.quantity := 0;
      new.amount_set_at := now();
    end if;
  end if;

  if new.stock_status = 'ok' then
    new.to_buy_amount := null;
  end if;
  -- (154) An item that is Out has no date.
  if new.stock_status = 'out' then
    new.expires_on := null;
  end if;
  if new.stock_status is distinct from old.stock_status then
    new.stock_status_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.stamp_inventory_stock_status() from public, anon, authenticated;
