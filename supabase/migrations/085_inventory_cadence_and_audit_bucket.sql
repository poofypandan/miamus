-- ============================================================================
-- Phase 83B — revised stock-check cadence + the inventory_audits bucket
-- ============================================================================
-- Cadence: the PM tightened fresh food to every 3 days (it spoils faster than
-- a weekly check can catch) and moved household supplies from monthly to
-- weekly alongside the dog supplies. Pantry stays bi-weekly.
-- ============================================================================

update inventory_items set audit_frequency_days = 3  where category = 'fresh_food';
update inventory_items set audit_frequency_days = 7  where category in ('dog_supplies', 'household_supplies');
update inventory_items set audit_frequency_days = 14 where category = 'pantry';

-- ============================================================================
-- Storage: stock-check photos
-- ============================================================================
-- Separate from household-logs so a stock photo is never mistaken for proof of
-- a pet task, and so the two can be cleaned up on different schedules.
--
-- Public, like household-logs: the owner's thumbnails load by plain URL. The
-- posture is the same as every other table here (see rls-policies.sql) — the
-- anon key ships in the bundle, so anyone holding it can read and upload.
-- No DELETE policy: an audit log is append-only (migrations/083), and deleting
-- its photo would leave the record pointing at nothing.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('inventory_audits', 'inventory_audits', true)
on conflict (id) do update set public = true;

drop policy if exists "Public read access for inventory_audits" on storage.objects;
create policy "Public read access for inventory_audits"
on storage.objects for select
using (bucket_id = 'inventory_audits');

drop policy if exists "Public insert access for inventory_audits" on storage.objects;
create policy "Public insert access for inventory_audits"
on storage.objects for insert
with check (bucket_id = 'inventory_audits');
