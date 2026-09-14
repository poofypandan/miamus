-- ============================================================================
-- Phase 60C — inventory_items (master inventory)
-- ============================================================================
-- The household's catalogue of the things it actually buys: "Royal Canin Mini
-- Adult", "NexGard", a particular shampoo. Distinct from inventory_alerts,
-- which are the running-low *reports* staff file against those things.
--
-- The owner curates this list; staff read it to pick a known item instead of
-- retyping a product name from memory.
--
-- RUN THIS BEFORE USING THE FEATURE. Until it is applied the Household tab
-- shows an empty catalogue and the staff quick-select simply doesn't appear —
-- the app degrades rather than breaking (see listInventoryItems in
-- lib/data/supabase-provider.ts).
-- ============================================================================

create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Mirrors ItemType in src/types/database.ts. Deliberately unconstrained, as
  -- with inventory_alerts.item_type: the live table there never had a CHECK
  -- and declaring one only here would mean a fresh database rejecting values
  -- production accepts.
  category text not null default 'other',
  created_at timestamptz not null default now()
);

create index if not exists inventory_items_category_idx on inventory_items(category);

-- ============================================================================
-- RLS
-- ============================================================================
-- Same posture as every other operational table (see rls-policies.sql): staff
-- and owner both arrive as `anon` with a key that ships in the public bundle,
-- so "owner writes / staff reads" is enforced in the UI, not here — the
-- Household tab is owner-gated by userRole. What RLS does is drop the verbs
-- the app never issues.
--
-- SELECT is open so staff can populate their quick-select. INSERT and DELETE
-- are open because the owner curates the list. No UPDATE policy: the app only
-- ever adds or removes an item, never renames one in place.
-- ============================================================================
alter table inventory_items enable row level security;

drop policy if exists "anon_select_inventory_items" on inventory_items;
create policy "anon_select_inventory_items" on inventory_items
  for select to anon using (true);

drop policy if exists "anon_insert_inventory_items" on inventory_items;
create policy "anon_insert_inventory_items" on inventory_items
  for insert to anon with check (true);

drop policy if exists "anon_delete_inventory_items" on inventory_items;
create policy "anon_delete_inventory_items" on inventory_items
  for delete to anon using (true);
