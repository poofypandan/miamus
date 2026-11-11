-- ============================================================================
-- 148 — Kitchen amounts and units (Phase 170 PR A)
-- ============================================================================
-- docs/phase-170-kitchen-plan.md; owner decisions D1–D16 all A (2026-11-10),
-- this PR is D1–D4, D6, D7, D14. Numbered 148: the next free number above
-- 146 (pre-launch hardening) and 147 (starter templates); go-live order
-- 146, 147, 148 (manager, 2026-11-11).
--
-- THE IDEA. Amounts are something the kitchen leaves behind, never a job.
-- An owner opts an item in ("Track amount"); its amount then changes only
-- where work already happens: buying adds, a glance in the cupboard is
-- minus, plus or Set amount. Never a scheduled count, never a reminder.
-- Untracked items stay Enough · Running low · Out (122).
--
-- NEW
--   inventory_items.track_amount        owner-only (the guard below).
--   inventory_items.amount_set_at       the server's clock, when a tracked
--        amount last changed or tracking turned on; a client's value is
--        ignored. Drives "about 1,2 kg · 3 weeks ago" (grey, never red).
--   inventory_items.amount_set_by       who changed it, as picked on the
--        phone (self-declared, like every staff id, 071); refused when the
--        person was removed (119) or belongs to another household.
--   inventory_items.last_bought_amount  the "How much did you buy?" pre-fill.
--   inventory_items_unit_check          the old ten plus buah, butir, ikat,
--        siung, lembar, batang, bungkus, sachet. sdm and sdt are
--        recipe-only (PR B) and refused here.
--   unique (id, household_id)           for PR B's composite keys.
--   food_items.portions                 optional, 0–99 (D7): "Rendang · 3
--        portions"; "Ate 1 portion" counts down. Any session, as food is.
--   household_features 'kitchen'        Kitchen amounts, the first feature
--        that joins OFF (171 D4); switched on here for every household that
--        exists when this runs (only the founding household today, which
--        asked for it). New households start off.
--   record_purchase(item, amount, staff)  Bought.
--
-- RE-CREATED (each from its newest definition)
--   inventory_items_owner_guard (099, revoked in 111)  owner-only list gains
--        track_amount; unit and min_threshold were already in it. Staff keep
--        quantity, stock_status(_by), amount_set_by, last_bought_amount.
--   stamp_inventory_stock_status (122)  becomes the one amount-rules
--        trigger, before insert or update of any column, so trigger order
--        can't matter: see the function.
--   refuse_archived_staff_on_stock (122)  also amount_set_by, and a staff id
--        from another household.
--   adjust_inventory_quantity (099, grants from 146)  dropped and re-created
--        with an optional p_staff_id (a second overload with a default
--        would make two-argument calls ambiguous; PostgREST calls by name,
--        so old calls keep working).
--   household_feature_defaults (145)  gains "kitchen": false.
--
-- NOT CHANGED: export_household_data (newest in 144) takes whole rows of
-- inventory_items and food_items, so the new columns are in the export
-- already. The Phase 110 quantity/min_threshold values are never used
-- silently (D14): the app shows an old count as a hint only, and an owner
-- types today's amount when switching tracking on. inventory_audit_logs is
-- untouched.
--
-- SECURITY. No SECURITY DEFINER function is added. adjust_inventory_quantity
-- and record_purchase are SECURITY INVOKER: RLS (090) and the owner guard
-- apply to the caller, so a staff phone changes amounts and statuses only,
-- never tracking, units or low levels (D3), and never another household's
-- items. Both revoked from public and anon, granted to authenticated and
-- service_role; empty search_path.
--
-- Additive only: nullable or defaulted columns, a widened check, a unique
-- key, re-created functions. Privacy policy updated in the same PR.
-- ============================================================================

-- --- 1. Columns --------------------------------------------------------------------
alter table public.inventory_items
  add column if not exists track_amount boolean not null default false,
  add column if not exists amount_set_at timestamptz,
  add column if not exists amount_set_by uuid references public.staff_profiles (id) on delete set null,
  add column if not exists last_bought_amount numeric;

alter table public.inventory_items drop constraint if exists inventory_items_last_bought_amount_check;
alter table public.inventory_items add constraint inventory_items_last_bought_amount_check
  check (last_bought_amount is null or (last_bought_amount > 0 and last_bought_amount <= 100000));

create index if not exists inventory_items_amount_set_by_idx on public.inventory_items (amount_set_by);

alter table public.inventory_items drop constraint if exists inventory_items_unit_check;
alter table public.inventory_items add constraint inventory_items_unit_check check (unit in (
  'pcs', 'pack', 'box', 'bottle', 'roll', 'tube', 'kg', 'g', 'L', 'ml',
  'buah', 'butir', 'ikat', 'siung', 'lembar', 'batang', 'bungkus', 'sachet'
));

alter table public.inventory_items drop constraint if exists inventory_items_id_household_key;
alter table public.inventory_items add constraint inventory_items_id_household_key unique (id, household_id);

alter table public.food_items add column if not exists portions smallint;
alter table public.food_items drop constraint if exists food_items_portions_check;
alter table public.food_items add constraint food_items_portions_check
  check (portions is null or portions between 0 and 99);

-- --- 2. Who may change what (099) ---------------------------------------------------
-- Owners and staff phones are both `authenticated` and pass the tenant
-- policies; this trigger tells them apart. A staff phone may change how much
-- is there, the status and the purchase columns, nothing else, and may not
-- add or delete items. auth.uid() is null for the service role and
-- migrations, which pass.
create or replace function public.inventory_items_owner_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_household uuid := coalesce(new.household_id, old.household_id);
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  if exists (
    select 1 from public.household_members
     where user_id = auth.uid() and household_id = target_household
  ) then
    return coalesce(new, old);
  end if;

  if tg_op <> 'UPDATE' then
    raise exception 'inventory_owner_only' using errcode = '42501';
  end if;

  if (new.household_id, new.name, new.variant, new.scope, new.category, new.unit,
      new.min_threshold, new.photo_url, new.notes, new.audit_frequency_days, new.track_amount)
     is distinct from
     (old.household_id, old.name, old.variant, old.scope, old.category, old.unit,
      old.min_threshold, old.photo_url, old.notes, old.audit_frequency_days, old.track_amount)
  then
    raise exception 'inventory_owner_only' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.inventory_items_owner_guard() from public, anon, authenticated;
grant execute on function public.inventory_items_owner_guard() to service_role;

-- --- 3. The amount rules (replaces 122's status stamp) -----------------------------
-- One function, before insert or update of any column, named so it runs
-- after the guard and the archived-staff check (triggers fire in name
-- order): those two see what the client sent, this one settles the rest.
--
--   * stock_status_at: the server's clock whenever the status changes.
--   * amount_set_at: never the client's. On a tracked row, stamped when the
--     amount changes or tracking turns on; otherwise kept as it was.
--   * A tracked row's status follows its amount whenever the amount, the
--     low level or tracking changed: nothing left → out; at or below
--     min_threshold (when > 0) → low; else ok. When that changes the
--     status, it's credited to whoever changed the amount or settings in
--     this write (nobody, if a low level alone moved it).
--   * Otherwise, a tap on Out empties a tracked row; a tap on Running low
--     only changes the status, and stays until the amount next changes.
--   * Untracked rows: as 122 (the amount isn't read or shown).
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
    new.stock_status_at := now();
    return new;
  end if;

  new.amount_set_at := old.amount_set_at;

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

  if new.stock_status is distinct from old.stock_status then
    new.stock_status_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_items_stamp_stock_status on public.inventory_items;
create trigger inventory_items_stamp_stock_status
  before insert or update on public.inventory_items
  for each row execute function public.stamp_inventory_stock_status();

-- --- 4. No work in a removed person's name (119, 122), nor another household's ------
create or replace function public.refuse_archived_staff_on_stock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if (tg_op = 'INSERT' or new.stock_status_by is distinct from old.stock_status_by)
     and public.is_archived_staff(new.stock_status_by) then
    raise exception 'staff_archived' using errcode = '42501',
      hint = 'This person was removed from the household; work is no longer recorded in their name.';
  end if;
  if (tg_op = 'INSERT' or new.amount_set_by is distinct from old.amount_set_by)
     and new.amount_set_by is not null then
    if public.is_archived_staff(new.amount_set_by) then
      raise exception 'staff_archived' using errcode = '42501',
        hint = 'This person was removed from the household; work is no longer recorded in their name.';
    end if;
    if not exists (
      select 1 from public.staff_profiles s
       where s.id = new.amount_set_by and s.household_id = new.household_id
    ) then
      raise exception 'staff_not_in_household' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_items_refuse_archived_staff on public.inventory_items;
create trigger inventory_items_refuse_archived_staff
  before insert or update of stock_status_by, amount_set_by on public.inventory_items
  for each row execute function public.refuse_archived_staff_on_stock();

revoke all on function public.stamp_inventory_stock_status() from public, anon, authenticated;
revoke all on function public.refuse_archived_staff_on_stock() from public, anon, authenticated;

-- --- 5. Minus and plus (099), with who did it ---------------------------------------
-- An increment, not a write of the total, so two phones tapping at once both
-- count; floored at 0. SECURITY INVOKER: the caller's RLS and the guard apply.
drop function if exists public.adjust_inventory_quantity(uuid, numeric);
create or replace function public.adjust_inventory_quantity(
  p_item_id uuid,
  p_delta numeric,
  p_staff_id uuid default null
)
returns setof public.inventory_items
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_delta is null or abs(p_delta) > 100000 then
    raise exception 'bad_amount' using errcode = '22023';
  end if;
  return query
    update public.inventory_items
       set quantity = greatest(quantity + p_delta, 0),
           amount_set_by = p_staff_id
     where id = p_item_id
    returning *;
end;
$$;

revoke all on function public.adjust_inventory_quantity(uuid, numeric, uuid) from public, anon;
grant execute on function public.adjust_inventory_quantity(uuid, numeric, uuid) to authenticated, service_role;

-- --- 6. Bought ----------------------------------------------------------------------
-- Back to enough, by whoever ticked it. On a tracked item with an amount:
-- the amount is added and kept as the next pre-fill, and the status then
-- follows the amount (the trigger), so buying 200 g against a 500 g low
-- level leaves it running low. With no amount ("Skip amount") or on an
-- untracked item, only the status changes. The tick's Undo takes the amount
-- back off with adjust_inventory_quantity and writes back the previous
-- status and pre-fill (all staff-writable). SECURITY INVOKER.
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
           stock_status_by = p_staff_id
     where i.id = p_item_id
    returning i.*;
end;
$$;

revoke all on function public.record_purchase(uuid, numeric, uuid) from public, anon;
grant execute on function public.record_purchase(uuid, numeric, uuid) to authenticated, service_role;

-- --- 7. The Features switch (145) ---------------------------------------------------
alter table public.household_features drop constraint if exists household_features_feature_check;
alter table public.household_features add constraint household_features_feature_check
  check (feature in ('repairs', 'bills', 'food', 'kitchen'));

-- Later features join OFF (171 D4). src/lib/features.ts mirrors this; a unit
-- test reads it from this file.
create or replace function public.household_feature_defaults()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{"repairs": true, "bills": true, "food": true, "kitchen": false}'::jsonb
$$;

revoke all on function public.household_feature_defaults() from public, anon;
grant execute on function public.household_feature_defaults() to authenticated, service_role;

-- On for every household that exists now (the founding household asked for
-- it); an owner's own choice, if one were already saved, is kept.
insert into public.household_features (household_id, feature, enabled, set_at, set_by)
select h.id, 'kitchen', true, now(), null
  from public.households h
on conflict (household_id, feature) do nothing;
