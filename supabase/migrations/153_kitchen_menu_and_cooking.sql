-- ============================================================================
-- 153 — The weekly menu and cooking from stock (Phase 170 PR C)
-- ============================================================================
-- docs/phase-170-kitchen-plan.md: "The weekly menu (D9, D10)" and "PR C
-- migration: menu and cooking". Owner decisions D1–D16 all A (2026-11-10).
-- Builds on 148 (amounts, the amount rules trigger, record_purchase) and
-- 151 (recipes, unique (id, household_id)). Numbered 153: the next free
-- number above 152 (manager, 2026-11-11).
--
-- NEW
--   menu_dishes          one row per dish on a day: day, meal (breakfast,
--        lunch, dinner), a recipe (composite key, on delete set null, so a
--        deleted recipe leaves the dish's title) or just a title, servings,
--        a note, the position. cooked_at / cooked_by / cooked_uses are
--        written ONLY by cook_menu_dish and uncook_menu_dish: cooked_uses is
--        what cooking actually took off stock, [{item_id, amount, unit}] in
--        the item's unit at the time, so Undo puts back exactly that, converted
--        if an owner changed the unit since (Codex, PR #101).
--   households.kitchen_notes (up to 300), kitchen_notes_confirmed_at /
--        kitchen_notes_confirmed_by: the owner's one-time OK that the note
--        may hold health information (D12), stamped by the server.
--   inventory_items.to_buy_amount  the shortfall "Add missing to Shopping"
--        stored, in the item's unit ("Chicken 500 g" on To buy and in the
--        WhatsApp text). Staff-writable (a staff purchase clears it). Cleared
--        by record_purchase and whenever the status goes back to Enough.
--   convert_kitchen_amount(amount, from, to)  the exact conversions of D4
--        (g <-> kg, ml <-> L, pcs/buah/butir 1 : 1, the same unit), null when
--        the units don't convert; lib/kitchen-units.ts convertAmount's twin.
--   cook_menu_dish(dish, uses, staff)  Sudah dimasak / Pakai bahan ini.
--   uncook_menu_dish(dish)             Batalkan / Mark not cooked.
--   set_kitchen_notes(household, notes, confirm)  owners only.
--   prune_old_menu_dishes()            nightly: menu days older than a year
--        (D16), service_role only.
--
-- RE-CREATED (each from its newest definition)
--   stamp_inventory_stock_status (148)  also clears to_buy_amount when the
--        status goes back to Enough, keeps an item the menu review put on
--        the list on it while cooking moves its amount (a shortfall stays
--        until it's bought or someone taps Enough), and converts the shortfall
--        when an owner changes the unit (cleared when the units don't convert;
--        Codex, PR #101).
--   record_purchase (148)  also clears to_buy_amount.
--   export_household_data (151)  adds the kitchen notes, 'menu' (every
--        dish, who cooked it and what it took off) and, the follow-up 152
--        asked for, the repair push switches in 'my_notifications'.
--
-- WHO MAY DO WHAT.
--   menu_dishes: every session of the household reads (staff phones show
--        Menu hari ini); insert, update and delete are owners only, through
--        is_household_admin(household_id), never get_user_household_ids()
--        alone (AGENTS.md). Staff phones never write the table directly.
--   A trigger refuses any direct change to the three cooked_* columns from a
--        client role, owners included (and blanks them on insert), so the two
--        functions are the only path. Otherwise a phone could write
--        cooked_uses and then "undo" stock that was never taken.
--   cook_menu_dish / uncook_menu_dish: SECURITY DEFINER, DELIBERATELY OPEN TO
--        STAFF PHONES (cooking is staff work; any staff phone may cook, D9).
--        The check is household membership (get_user_household_ids()), the
--        documented exception to the admin guard: they change only the
--        dish's cooked_* columns and the quantity of the household's own
--        tracked items, both things a staff phone may already change (148:
--        staff adjust amounts). Every item must be a tracked item of the
--        dish's household; a staff id must be a non-archived member of it.
--   set_kitchen_notes: SECURITY DEFINER, is_household_admin() (households has
--        no client update policy; owners write their settings through
--        functions, as 133 and 141 do).
--   Every SECURITY DEFINER function: empty search_path, EXECUTE revoked from
--        public and anon, granted only to the roles listed.
--
-- PRIVACY. New personal data: the menu, who cooked what and when, and the
-- kitchen notes, which may describe a family member's allergy (UU PDP
-- health data; one note per household, never per person). Privacy policy
-- (EN and ID) and legal.ts updated in the same PR. No prices anywhere: staff
-- never see prices, and nothing here holds money. Supabase only, same
-- region, no new service.
--
-- NOT HERE (plan, "Later" and the parked addendum D17–D22): cook-before-
-- expiry, Eat soon and leftover dishes (food_item_id), Ready to cook, pack
-- sizes, the Menu changed fingerprint, receipts.
--
-- Additive only: one new table, nullable or defaulted columns, new
-- functions, re-created functions with the same signatures.
-- ============================================================================

-- --- 1. Columns on existing tables ------------------------------------------------------
alter table public.households
  add column if not exists kitchen_notes text,
  add column if not exists kitchen_notes_confirmed_at timestamptz,
  add column if not exists kitchen_notes_confirmed_by uuid references auth.users (id) on delete set null;

alter table public.households drop constraint if exists households_kitchen_notes_length;
alter table public.households add constraint households_kitchen_notes_length
  check (kitchen_notes is null or char_length(kitchen_notes) <= 300);

create index if not exists households_kitchen_notes_confirmed_by_idx on public.households (kitchen_notes_confirmed_by);

alter table public.inventory_items add column if not exists to_buy_amount numeric;
alter table public.inventory_items drop constraint if exists inventory_items_to_buy_amount_check;
alter table public.inventory_items add constraint inventory_items_to_buy_amount_check
  check (to_buy_amount is null or (to_buy_amount > 0 and to_buy_amount <= 100000));

-- --- 2. menu_dishes ----------------------------------------------------------------------
create table if not exists public.menu_dishes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  day date not null,
  meal text not null,
  recipe_id uuid,
  title text not null,
  servings smallint,
  notes text,
  position smallint not null default 0,
  cooked_at timestamptz,
  cooked_by uuid references public.staff_profiles (id) on delete set null,
  cooked_uses jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Only recipe_id goes null: household_id stays (it is the dish's household).
  constraint menu_dishes_recipe_fkey foreign key (recipe_id, household_id)
    references public.recipes (id, household_id) on delete set null (recipe_id),
  constraint menu_dishes_meal_check check (meal in ('breakfast', 'lunch', 'dinner')),
  constraint menu_dishes_title_length check (char_length(btrim(title)) between 1 and 80),
  constraint menu_dishes_servings_check check (servings is null or servings between 1 and 50),
  constraint menu_dishes_notes_length check (notes is null or char_length(notes) <= 200),
  constraint menu_dishes_position_check check (position between 0 and 99),
  constraint menu_dishes_cooked_uses_array check (cooked_uses is null or jsonb_typeof(cooked_uses) = 'array')
);

create index if not exists menu_dishes_household_day_idx on public.menu_dishes (household_id, day, meal, position);
create index if not exists menu_dishes_recipe_idx on public.menu_dishes (recipe_id, household_id);
create index if not exists menu_dishes_cooked_by_idx on public.menu_dishes (cooked_by);
create index if not exists menu_dishes_day_idx on public.menu_dishes (day);

-- What the server decides, and the cooked_* columns' only door. current_user
-- is the function owner inside cook_menu_dish / uncook_menu_dish (SECURITY
-- DEFINER), and 'authenticated' (or 'anon') for any direct write from a
-- phone, owners included.
create or replace function public.menu_dishes_server_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  from_client boolean := current_user in ('authenticated', 'anon');
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
    if from_client then
      new.cooked_at := null;
      new.cooked_by := null;
      new.cooked_uses := null;
    end if;
  else
    new.household_id := old.household_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if from_client and (new.cooked_at, new.cooked_by, new.cooked_uses)
                       is distinct from (old.cooked_at, old.cooked_by, old.cooked_uses) then
      raise exception 'cooked_through_functions_only' using errcode = '42501',
        hint = 'Use cook_menu_dish or uncook_menu_dish.';
    end if;
  end if;
  new.updated_at := now();
  new.title := btrim(new.title);
  new.notes := nullif(btrim(new.notes), '');
  return new;
end;
$$;

drop trigger if exists menu_dishes_server_fields on public.menu_dishes;
create trigger menu_dishes_server_fields
  before insert or update on public.menu_dishes
  for each row execute function public.menu_dishes_server_fields();

revoke all on function public.menu_dishes_server_fields() from public, anon, authenticated;

alter table public.menu_dishes enable row level security;

-- Every session of the household reads: staff phones show Menu hari ini.
drop policy if exists "tenant_select_menu_dishes" on public.menu_dishes;
create policy "tenant_select_menu_dishes" on public.menu_dishes
  for select to authenticated using (household_id = any (public.get_user_household_ids()));

-- Owners only write: a household_members check, never a device session.
drop policy if exists "admin_insert_menu_dishes" on public.menu_dishes;
create policy "admin_insert_menu_dishes" on public.menu_dishes
  for insert to authenticated with check (public.is_household_admin(household_id));

drop policy if exists "admin_update_menu_dishes" on public.menu_dishes;
create policy "admin_update_menu_dishes" on public.menu_dishes
  for update to authenticated
  using (public.is_household_admin(household_id))
  with check (public.is_household_admin(household_id));

drop policy if exists "admin_delete_menu_dishes" on public.menu_dishes;
create policy "admin_delete_menu_dishes" on public.menu_dishes
  for delete to authenticated using (public.is_household_admin(household_id));

revoke all on table public.menu_dishes from public, anon;
grant select, insert, update, delete on table public.menu_dishes to authenticated, service_role;

-- --- 2b. Exact unit conversions (D4) ------------------------------------------------------
-- An amount in another unit, or null when the two don't convert exactly:
-- g <-> kg, ml <-> L, and pcs, buah and butir 1 : 1 with each other; any
-- unit converts to itself; nothing else (no "1 egg = 60 g"). The twin of
-- convertAmount in src/lib/kitchen-units.ts. Not SECURITY DEFINER: the
-- amount rules trigger calls it as the writing role, so authenticated may
-- execute it (it reads nothing).
create or replace function public.convert_kitchen_amount(p_amount numeric, p_from text, p_to text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_amount is null or p_from is null or p_to is null then null
    when p_from = p_to then p_amount
    when p_from in ('g', 'kg') and p_to in ('g', 'kg')
      then trim_scale(round(p_amount * (case p_from when 'kg' then 1000 else 1 end) / (case p_to when 'kg' then 1000 else 1 end), 6))
    when p_from in ('ml', 'L') and p_to in ('ml', 'L')
      then trim_scale(round(p_amount * (case p_from when 'L' then 1000 else 1 end) / (case p_to when 'L' then 1000 else 1 end), 6))
    when p_from in ('pcs', 'buah', 'butir') and p_to in ('pcs', 'buah', 'butir') then p_amount
    else null
  end
$$;

revoke all on function public.convert_kitchen_amount(numeric, text, text) from public, anon;
grant execute on function public.convert_kitchen_amount(numeric, text, text) to authenticated, service_role;

-- --- 3. The amount rules, plus the shortfall (148's body) --------------------------------
-- As 148, and at the end:
--   * a status back to Enough clears to_buy_amount (bought, or someone
--     tapped Enough);
--   * an item the menu review put on the list (to_buy_amount set) stays
--     Running low when cooking or a minus tap moves its amount but it's
--     still above its low level: the week still needs it bought. A purchase
--     clears to_buy_amount in the same write, so it goes back to Enough;
--   * an owner changing the unit converts the shortfall (500 g -> 0,5 kg),
--     or clears it when the units don't convert, unless the same write set
--     it (the app sends it converted already).
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
  if new.stock_status is distinct from old.stock_status then
    new.stock_status_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.stamp_inventory_stock_status() from public, anon, authenticated;

-- --- 4. Bought (148's body), clearing the shortfall --------------------------------------
create or replace function public.record_purchase(
  p_item_id uuid,
  p_amount numeric default null,
  p_staff_id uuid default null
)
returns setof public.inventory_items
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_amount is not null and (p_amount <= 0 or p_amount > 100000) then
    raise exception 'bad_amount' using errcode = '22023';
  end if;
  return query
    update public.inventory_items i
       set quantity = case when i.track_amount and p_amount is not null then i.quantity + p_amount else i.quantity end,
           last_bought_amount = case when i.track_amount and p_amount is not null then p_amount else i.last_bought_amount end,
           amount_set_by = case when i.track_amount and p_amount is not null then p_staff_id else i.amount_set_by end,
           stock_status = 'ok',
           stock_status_by = p_staff_id,
           to_buy_amount = null
     where i.id = p_item_id
    returning i.*;
end;
$$;

revoke all on function public.record_purchase(uuid, numeric, uuid) from public, anon;
grant execute on function public.record_purchase(uuid, numeric, uuid) to authenticated, service_role;

-- --- 5. Cooking, and its Undo --------------------------------------------------------------
-- cook_menu_dish(dish, uses, staff): uses = [{item_id, amount, unit?}, ...],
-- each amount in the unit the phone saw on the item (the phone converts the
-- recipe's line and the person may adjust or untick it). If an owner changed
-- the item's unit since, the amount is converted (refused, unit_mismatch,
-- when it doesn't convert). One transaction:
--   * the dish is locked; one already cooked is refused (already_cooked),
--     so a retry after a weak signal never takes things off twice;
--   * every item is a TRACKED item of the dish's household, every amount
--     > 0 and <= 100,000, at most 200 lines; the same item twice is summed;
--   * the staff id is null or a non-archived member of the household;
--   * each item: quantity = greatest(quantity - amount, 0); the amount rules
--     trigger re-derives the status and stamps amount_set_at;
--   * what was actually taken (after the floor at 0) goes in cooked_uses
--     with the item's unit, with cooked_at = now() and cooked_by.
-- Returns { dish, items } (the changed items' rows).
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
  amount numeric;
  taken numeric;
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
  for line in
    select (e ->> 'item_id')::uuid as item_id, sum((e ->> 'amount')::numeric) as amount,
           min(e ->> 'unit') as unit, count(distinct e ->> 'unit') as units,
           bool_or((e ->> 'amount') is null or (e ->> 'amount')::numeric <= 0 or (e ->> 'amount')::numeric > 100000) as bad
      from jsonb_array_elements(v_uses) e
     group by 1
     order by 1
  loop
    if line.item_id is null or line.bad or line.amount > 100000 then
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
    taken := least(it.quantity, amount);
    if taken > 0 then
      update public.inventory_items
         set quantity = greatest(quantity - amount, 0),
             amount_set_by = p_staff_id
       where id = it.id
      returning * into it;
      took := took || jsonb_build_array(jsonb_build_object('item_id', it.id, 'amount', taken, 'unit', it.unit));
    end if;
    changed := changed || jsonb_build_array(to_jsonb(it));
  end loop;

  update public.menu_dishes
     set cooked_at = now(), cooked_by = p_staff_id, cooked_uses = took
   where id = d.id
  returning * into d;
  return jsonb_build_object('dish', to_jsonb(d), 'items', changed);
end;
$$;

-- uncook_menu_dish(dish): puts back exactly what cooked_uses says was taken
-- (on items that still exist and are still tracked), converted to the
-- item's unit now if an owner changed it since (500 g back as 0,5 kg). An
-- item whose unit no longer converts (g -> buah) is skipped and listed in
-- the answer's "skipped", never given a wrong number (Codex, PR #101). Then
-- clears the three columns. A dish that isn't cooked is returned as it is.
-- Same check. Returns { dish, items, skipped }.
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
    select (e ->> 'item_id')::uuid as item_id, e ->> 'unit' as unit, sum((e ->> 'amount')::numeric) as amount
      from jsonb_array_elements(coalesce(d.cooked_uses, '[]'::jsonb)) e
     group by 1, 2
     order by 1, 2
  loop
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

revoke all on function public.cook_menu_dish(uuid, jsonb, uuid) from public, anon;
grant execute on function public.cook_menu_dish(uuid, jsonb, uuid) to authenticated, service_role;
revoke all on function public.uncook_menu_dish(uuid) from public, anon;
grant execute on function public.uncook_menu_dish(uuid) to authenticated, service_role;

-- --- 6. Kitchen notes (owners) ----------------------------------------------------------------
-- Saves the household's one kitchen note (blank clears it). p_confirm: the
-- owner said yes to "this note may include health information… shown to
-- your staff" (D12); stamped once with who and when, and kept.
create or replace function public.set_kitchen_notes(p_household_id uuid, p_notes text, p_confirm boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  h public.households;
  v_notes text := nullif(btrim(p_notes), '');
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_household_id is null or not public.is_household_admin(p_household_id) then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  if v_notes is not null and char_length(v_notes) > 300 then
    raise exception 'bad_value' using errcode = '22023';
  end if;
  update public.households
     set kitchen_notes = v_notes,
         kitchen_notes_confirmed_at = case
           when coalesce(p_confirm, false) and kitchen_notes_confirmed_at is null then now()
           else kitchen_notes_confirmed_at
         end,
         kitchen_notes_confirmed_by = case
           when coalesce(p_confirm, false) and kitchen_notes_confirmed_at is null then auth.uid()
           else kitchen_notes_confirmed_by
         end
   where id = p_household_id
  returning * into h;
  return jsonb_build_object('kitchen_notes', h.kitchen_notes,
                            'kitchen_notes_confirmed_at', h.kitchen_notes_confirmed_at);
end;
$$;

revoke all on function public.set_kitchen_notes(uuid, text, boolean) from public, anon;
grant execute on function public.set_kitchen_notes(uuid, text, boolean) to authenticated;

-- --- 7. Menu days are kept one year (D16) ------------------------------------------------
create or replace function public.prune_old_menu_dishes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed int;
begin
  delete from public.menu_dishes where day < (now() at time zone 'Asia/Jakarta')::date - interval '1 year';
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function public.prune_old_menu_dishes() from public, anon, authenticated;
grant execute on function public.prune_old_menu_dishes() to service_role;

-- 19:54 UTC (02:54 in Jakarta), beside the other nightly prunes.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('prune-old-menu-dishes')
      where exists (select 1 from cron.job where jobname = 'prune-old-menu-dishes');
    perform cron.schedule('prune-old-menu-dishes', '54 19 * * *', 'select public.prune_old_menu_dishes();');
  else
    raise warning 'pg_cron is not installed: menu days will not be pruned';
  end if;
end;
$$;

-- --- 8. The export (151's body, plus the menu, kitchen notes, repair pushes) -------------------
create or replace function public.export_household_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  uid uuid := auth.uid();
  hh uuid := public.caller_admin_household();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if hh is null then
    raise exception 'admins_only' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'format', 'miamus-household-export/1',
    'exported_at', now(),
    'household', (
      select jsonb_build_object('id', h.id, 'name', h.name, 'created_at', h.created_at,
                                -- Notifications to staff phones on or off (migrations/141).
                                'staff_push', h.staff_push,
                                -- The kitchen note for whoever cooks, and the owner's
                                -- health-data OK (migrations/153).
                                'kitchen_notes', h.kitchen_notes,
                                'kitchen_notes_confirmed_at', h.kitchen_notes_confirmed_at,
                                'kitchen_notes_confirmed_by', (select u.email from auth.users u where u.id = h.kitchen_notes_confirmed_by))
      from public.households h where h.id = hh
    ),
    'admins', coalesce((
      select jsonb_agg(jsonb_build_object(
        'email', u.email, 'role', m.role, 'joined_at', m.created_at,
        'founder', h.owner_auth_id is not distinct from m.user_id
      ) order by m.created_at)
      from public.household_members m
      join auth.users u on u.id = m.user_id
      join public.households h on h.id = m.household_id
      where m.household_id = hh
    ), '[]'::jsonb),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'created_at', s.created_at,
        'archived_at', s.archived_at, 'has_pin', s.has_pin,
        -- Admins get a profile too, so chores can be assigned to them (106).
        'is_admin', s.user_id is not null
      ) order by s.created_at)
      from public.staff_profiles s where s.household_id = hh
    ), '[]'::jsonb),
    'pets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'type', e.entity_type, 'name', e.name, 'icon', e.icon,
        'status', e.status, 'details', e.metadata, 'created_at', e.created_at
      ) order by e.created_at)
      from public.task_entities e where e.household_id = hh
    ), '[]'::jsonb),
    'routines', coalesce((
      select jsonb_agg(to_jsonb(ms) order by ms.created_at)
      from public.master_schedules ms
      join public.task_entities e on e.id = ms.entity_id
      where e.household_id = hh
    ), '[]'::jsonb),
    'logs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'pet_id', l.entity_id, 'routine_id', l.schedule_id,
        'module', l.module, 'kind', l.sub_type, 'notes', l.notes,
        'completed_at', l.completed_at, 'received_at', l.received_at, 'staff', s.name,
        'photo', (public.photo_object_ref(l.photo_url))[1] || '/' || (public.photo_object_ref(l.photo_url))[2]
      ) order by l.completed_at)
      from public.task_logs l
      join public.task_entities e on e.id = l.entity_id
      left join public.staff_profiles s on s.id = l.staff_id
      where e.household_id = hh
    ), '[]'::jsonb),
    -- Tasks someone said couldn't be done (migrations/139); the walk-in a
    -- "supervising a repair" record names (migrations/149).
    'couldnt_do', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'chore_id', x.chore_id, 'routine_id', x.schedule_id, 'pet_id', x.entity_id,
        'task', coalesce(t.title, ms.title), 'day', x.occurs_on, 'slot', x.slot_time,
        'reason', x.reason, 'note', x.note, 'shopping_item_id', x.inventory_item_id,
        'repair_visit_id', x.repair_visit_id,
        'staff', s.name, 'at', x.created_at,
        'photo', (public.photo_object_ref(x.photo_url))[1] || '/' || (public.photo_object_ref(x.photo_url))[2]
      ) order by x.created_at)
      from public.task_exceptions x
      left join public.household_tasks t on t.id = x.chore_id
      left join public.master_schedules ms on ms.id = x.schedule_id
      left join public.staff_profiles s on s.id = x.staff_id
      where x.household_id = hh
    ), '[]'::jsonb),
    'health_records', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at)
      from public.medical_records r
      join public.task_entities e on e.id = r.entity_id
      where e.household_id = hh
    ), '[]'::jsonb),
    'routine_suggestions', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.created_at)
      from public.routine_proposals p
      join public.task_entities e on e.id = p.pet_id
      where e.household_id = hh
    ), '[]'::jsonb),
    'chores', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.created_at)
      from public.household_tasks t where t.household_id = hh
    ), '[]'::jsonb),
    'rooms', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at)
      from public.household_locations r where r.household_id = hh
    ), '[]'::jsonb),
    'supplies', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.created_at)
      from public.inventory_items i where i.household_id = hh
    ), '[]'::jsonb),
    'stock_counts', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at)
      from public.inventory_audit_logs a
      join public.inventory_items i on i.id = a.item_id
      where i.household_id = hh
    ), '[]'::jsonb),
    'shopping_list', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at)
      from public.inventory_alerts a where a.household_id = hh
    ), '[]'::jsonb),
    'repairs', coalesce((
      select jsonb_agg(to_jsonb(rp) order by rp.created_at)
      from public.repairs rp where rp.household_id = hh
    ), '[]'::jsonb),
    -- Walk-ins (migrations/149): who came, when, the photos, who logged it.
    'repair_walk_ins', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'repair_id', v.repair_id, 'worker_name', v.worker_name,
        'logged_by', s.name, 'arrived_at', v.arrived_at, 'arrived_phone_at', v.arrived_phone_at,
        'left_at', v.left_at, 'left_phone_at', v.left_phone_at,
        'outcome', v.outcome, 'note', v.note,
        'before_photo', (public.photo_object_ref(v.before_photo_url))[1] || '/' || (public.photo_object_ref(v.before_photo_url))[2],
        'after_photo', (public.photo_object_ref(v.after_photo_url))[1] || '/' || (public.photo_object_ref(v.after_photo_url))[2]
      ) order by v.arrived_at)
      from public.repair_visits v
      left join public.staff_profiles s on s.id = v.logged_by_staff
      where v.household_id = hh
    ), '[]'::jsonb),
    -- Who supervised each walk-in, from when to when (kept 90 days).
    'repair_supervision', coalesce((
      select jsonb_agg(jsonb_build_object(
        'visit_id', rs.visit_id, 'staff', s.name, 'owner', rs.user_id is not null,
        'started_at', rs.started_at, 'ended_at', rs.ended_at
      ) order by rs.started_at)
      from public.repair_supervision rs
      left join public.staff_profiles s on s.id = rs.staff_id
      where rs.household_id = hh
    ), '[]'::jsonb),
    'repair_costs', coalesce((
      select jsonb_agg(to_jsonb(rc) order by rc.repair_id)
      from public.repair_costs rc where rc.household_id = hh
    ), '[]'::jsonb),
    'bill_payments', coalesce((
      select jsonb_agg(to_jsonb(bp) order by bp.paid_at)
      from public.bill_payments bp where bp.household_id = hh
    ), '[]'::jsonb),
    'repair_notes', coalesce((
      select jsonb_agg(to_jsonb(rn) order by rn.created_at)
      from public.repair_notes rn where rn.household_id = hh
    ), '[]'::jsonb),
    'food', coalesce((
      select jsonb_agg(to_jsonb(f) order by f.created_at)
      from public.food_items f where f.household_id = hh
    ), '[]'::jsonb),
    -- Recipes (migrations/151), each with its ingredient lines in order.
    'recipes', coalesce((
      select jsonb_agg(to_jsonb(rc) || jsonb_build_object('ingredients', coalesce((
        select jsonb_agg(to_jsonb(ri) - 'household_id' order by ri.position)
          from public.recipe_ingredients ri where ri.recipe_id = rc.id
      ), '[]'::jsonb)) order by rc.created_at)
      from public.recipes rc where rc.household_id = hh
    ), '[]'::jsonb),
    -- The menu (migrations/153): every dish, who cooked it, when, and what
    -- cooking took off stock (kept one year).
    'menu', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', md.id, 'day', md.day, 'meal', md.meal, 'title', md.title,
        'recipe_id', md.recipe_id, 'servings', md.servings, 'notes', md.notes,
        'position', md.position, 'cooked_at', md.cooked_at, 'cooked_by', s.name,
        'cooked_uses', md.cooked_uses, 'created_at', md.created_at
      ) order by md.day, md.meal, md.position)
      from public.menu_dishes md
      left join public.staff_profiles s on s.id = md.cooked_by
      where md.household_id = hh
    ), '[]'::jsonb),
    'leave', coalesce((
      select jsonb_agg(to_jsonb(lr) order by lr.created_at)
      from public.leave_requests lr where lr.household_id = hh
    ), '[]'::jsonb),
    'feedback', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', fb.id, 'category', fb.category, 'message', fb.message,
        'page', fb.page, 'app_version', fb.app_version, 'sent_at', fb.created_at,
        'staff', s.name, 'from_admin', fb.staff_id is null
      ) order by fb.created_at)
      from public.feedback fb
      left join public.staff_profiles s on s.id = fb.staff_id
      where fb.household_id = hh
    ), '[]'::jsonb),
    -- Numbered as Household → Linked staff phones lists them (last sign-in
    -- first), so "HP 1" here is "Phone 1" on screen (migrations/141).
    'linked_phones', coalesce((
      select jsonb_agg(jsonb_build_object('phone', 'HP ' || ph.n, 'linked_at', ph.created_at,
                                          'last_seen_at', ph.last_seen_at)
                       order by ph.n)
      from (
        select d.created_at, d.last_seen_at,
               row_number() over (order by d.last_seen_at desc, d.created_at) as n
          from public.device_sessions d where d.household_id = hh
      ) ph
    ), '[]'::jsonb),
    -- Who gets notifications on which linked phone (migrations/141): the
    -- phone as linked_phones above numbers it, never an endpoint.
    'staff_notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'phone', 'HP ' || ph.n, 'staff', s.name, 'since', p.created_at
      ) order by ph.n, p.created_at)
      from public.staff_push_people p
      join (
        select d.user_id, row_number() over (order by d.last_seen_at desc, d.created_at) as n
          from public.device_sessions d where d.household_id = hh
      ) ph on ph.user_id = p.device_user_id
      join public.staff_profiles s on s.id = p.staff_id
      where p.household_id = hh
    ), '[]'::jsonb),
    'staff_sign_in_attempts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'at', a.created_at, 'kind', a.kind, 'success', a.success, 'staff', s.name
      ) order by a.created_at)
      from public.staff_sign_in_attempts a
      left join public.staff_profiles s on s.id = a.staff_id
      where a.household_id = hh
    ), '[]'::jsonb),
    -- Setting up the household, as numbers only (migrations/142); null until
    -- the setup screens record it.
    'setup', (
      select to_jsonb(su) - 'household_id'
      from public.household_setup su where su.household_id = hh
    ),
    -- Each ended day's due and closed task counts (migrations/142).
    'task_day_counts', coalesce((
      select jsonb_agg(jsonb_build_object('day', nd.day, 'due', nd.due, 'closed', nd.closed) order by nd.day)
      from public.north_star_days nd where nd.household_id = hh
    ), '[]'::jsonb),
    'my_language', (select p.locale from public.user_preferences p where p.user_id = uid),
    -- Plus the repair push switches (migrations/152).
    'my_notifications', (
      select jsonb_build_object('evening_summary_hour', pr.evening_summary_hour,
                                'staff_requests', pr.staff_request_pushes,
                                'repair_arrivals', rp.repair_arrival_pushes,
                                'repair_finished', rp.repair_done_pushes)
      from public.notification_prefs_of(uid) pr
      cross join public.repair_push_prefs_of(uid) rp
    )
  );
end;
$$;
revoke all on function public.export_household_data() from public, anon;
grant execute on function public.export_household_data() to authenticated;
