-- ============================================================================
-- 122 — Shopping list: each item is enough, running low, or out (Phase 154)
-- ============================================================================
-- Owner decision R3 (docs/phase-153-review.md, 2026-11-07). Inventory asked
-- staff to weigh and count every item on a schedule and owners to keep
-- thresholds; the counts went stale and the tab showed the same low item
-- three times. It becomes a shopping list: staff say an item is running low
-- or out with one tap; the owner sees what to buy and ticks it off.
--
-- THE PIECES
--   inventory_items.stock_status     'ok' (enough), 'low' (running low) or
--                                    'out'. Everything starts as 'ok'.
--   inventory_items.stock_status_at  when it last changed — stamped by the
--                                    trigger below from the server's clock,
--                                    not the phone's.
--   inventory_items.stock_status_by  who changed it, as selected on the phone
--                                    (self-declared, like every staff_id;
--                                    see migrations/071).
--
-- WHO MAY SET IT. Any session of the household, staff phones included: the
-- column is not in inventory_items_owner_guard's list of owner-only fields
-- (099), so the existing update policy (090) already covers it, and staff
-- still cannot rename, recategorise or delete an item. 119's guard against
-- recording work under a removed person is extended to stock_status_by.
--
-- NOT DROPPED: quantity, min_threshold, audit_frequency_days,
-- last_audited_at and inventory_audit_logs stay in the table (an app on the
-- previous build keeps working through the deploy, and nothing is lost).
-- The app stops showing and asking for them. inventory_alerts stays: it is
-- now only the staff's "something else we need" note (free text, photo).
--
-- Additive: three nullable or defaulted columns, one trigger.
-- ============================================================================

alter table public.inventory_items
  add column if not exists stock_status text not null default 'ok',
  add column if not exists stock_status_at timestamptz,
  add column if not exists stock_status_by uuid references public.staff_profiles (id) on delete set null;

alter table public.inventory_items drop constraint if exists inventory_items_stock_status_check;
alter table public.inventory_items add constraint inventory_items_stock_status_check
  check (stock_status in ('ok', 'low', 'out'));

create index if not exists inventory_items_stock_status_by_idx
  on public.inventory_items (stock_status_by);

-- The server's clock, whoever sets the status.
create or replace function public.stamp_inventory_stock_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.stock_status is distinct from old.stock_status then
    new.stock_status_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_items_stamp_stock_status on public.inventory_items;
create trigger inventory_items_stamp_stock_status
  before insert or update of stock_status on public.inventory_items
  for each row execute function public.stamp_inventory_stock_status();

-- 119: no new work in a removed person's name, now covering this column too.
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
  return new;
end;
$$;

drop trigger if exists inventory_items_refuse_archived_staff on public.inventory_items;
create trigger inventory_items_refuse_archived_staff
  before insert or update of stock_status_by on public.inventory_items
  for each row execute function public.refuse_archived_staff_on_stock();

-- Trigger functions are never called directly.
revoke all on function public.stamp_inventory_stock_status() from public, anon, authenticated;
revoke all on function public.refuse_archived_staff_on_stock() from public, anon, authenticated;
