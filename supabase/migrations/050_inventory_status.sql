-- ============================================================================
-- Phase 50 — inventory_alerts restock tracking
-- ============================================================================
-- Adds a lifecycle to low-stock reports so a restocked item becomes history
-- rather than vanishing. `resolved_at` is what the owner's History tab sorts
-- and dates by; the existing boolean `resolved` predates it.
--
-- RUN THIS BEFORE USING THE FEATURE. Until it is applied the app still works —
-- alerts resolve through the old boolean and the History tab reads it via the
-- fallback in src/lib/inventory-status.ts — but no restock date is recorded.
-- ============================================================================

alter table inventory_alerts add column if not exists status text not null default 'pending';
alter table inventory_alerts add column if not exists resolved_at timestamptz;

-- Backfill rows resolved before this migration existed. They have no real
-- restock time, so created_at stands in — the History tab shows the same value
-- through its fallback, and this keeps the column and the fallback agreeing
-- rather than drifting.
update inventory_alerts
set status = 'resolved',
    resolved_at = coalesce(resolved_at, created_at)
where resolved = true
  and status <> 'resolved';

create index if not exists inventory_alerts_status_idx on inventory_alerts(status);

-- ============================================================================
-- No CHECK constraint on `status`, matching this table's existing shape — the
-- live table has never had one on item_type either (see migrations/049), and
-- adding one here only would mean a fresh database rejecting values production
-- accepts. src/lib/inventory-status.ts is the source of truth.
-- ============================================================================
