-- ============================================================================
-- Phase 90 — private buckets and storage RLS
-- ============================================================================
-- The last public hole. Since Phase 88 every row is behind an identity, but
-- both buckets were public:true with policies keyed only on bucket_id, so
-- every task photo and stock photo was readable by URL — no key, no account,
-- nothing — and uploadable by anyone holding the anon key.
--
-- After this migration:
--   * both buckets are private, so the /object/public/ path stops serving;
--   * `anon` has no policy on storage.objects at all;
--   * an authenticated identity reaches only its own household's objects.
--
-- HOW AN OBJECT IS TIED TO A HOUSEHOLD
-- New uploads are keyed <household_id>/<old prefix>/<file> (see
-- supabase-provider.ts), so the first path segment is the tenant and the
-- check is a string split rather than a join.
--
-- The 406 objects that predate this phase have no such prefix. They all
-- belong to Banyuwangi 11 — it is the only household that has ever existed —
-- so they are grandfathered to it explicitly, by id. Deliberately NOT "any
-- authenticated user may read un-prefixed objects": that would hand every old
-- photo to the first second tenant who signs up.
--
-- Moving those objects under the new prefix needs the storage API (renaming
-- storage.objects rows by hand does not move the underlying file), so it is
-- its own job. Until then this clause stays; delete it once they are moved.
-- ============================================================================

update storage.buckets set public = false where id in ('household-logs', 'inventory_audits');

-- The tenant an object key names, or null when it carries no household prefix.
-- IMMUTABLE and null-safe: a policy cannot afford to raise on a key that
-- happens not to start with a uuid.
create or replace function storage_object_household(object_name text)
returns uuid
language sql
immutable
as $$
  select case
    when object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    then substring(object_name from 1 for 36)::uuid
  end;
$$;

grant execute on function storage_object_household(text) to authenticated;

-- Everything the old, public policies allowed.
drop policy if exists "Public read access for household-logs" on storage.objects;
drop policy if exists "Public insert access for household-logs" on storage.objects;
drop policy if exists "Public delete access for household-logs" on storage.objects;
drop policy if exists "Public read access for inventory_audits" on storage.objects;
drop policy if exists "Public insert access for inventory_audits" on storage.objects;

-- --- household-logs: task photos, chore proof, pet avatars, medical scans ---
-- Read covers both the new prefix and the grandfathered objects.
drop policy if exists "tenant_read_household_logs" on storage.objects;
create policy "tenant_read_household_logs" on storage.objects
  for select to authenticated using (
    bucket_id = 'household-logs'
    and (
      storage_object_household(name) = any (get_user_household_ids())
      or (
        storage_object_household(name) is null
        and '975f0914-4d0d-43ad-8dee-a967d9bd10cd'::uuid = any (get_user_household_ids())
      )
    )
  );

-- Writes must carry the prefix: there is no reason for a new object to land
-- outside its household's folder, and allowing it would recreate the hole.
drop policy if exists "tenant_insert_household_logs" on storage.objects;
create policy "tenant_insert_household_logs" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'household-logs'
    and storage_object_household(name) = any (get_user_household_ids())
  );

-- Deleting stays available (the app removes a photo when a log is undone),
-- and the grandfather clause is included so an old photo can still be tidied.
drop policy if exists "tenant_delete_household_logs" on storage.objects;
create policy "tenant_delete_household_logs" on storage.objects
  for delete to authenticated using (
    bucket_id = 'household-logs'
    and (
      storage_object_household(name) = any (get_user_household_ids())
      or (
        storage_object_household(name) is null
        and '975f0914-4d0d-43ad-8dee-a967d9bd10cd'::uuid = any (get_user_household_ids())
      )
    )
  );

-- --- inventory_audits: stock-check photos ----------------------------------
-- Append-only, like the audit rows they belong to (migrations/083): no delete
-- policy, so a count's evidence cannot be removed after the fact.
drop policy if exists "tenant_read_inventory_audits" on storage.objects;
create policy "tenant_read_inventory_audits" on storage.objects
  for select to authenticated using (
    bucket_id = 'inventory_audits'
    and (
      storage_object_household(name) = any (get_user_household_ids())
      or (
        storage_object_household(name) is null
        and '975f0914-4d0d-43ad-8dee-a967d9bd10cd'::uuid = any (get_user_household_ids())
      )
    )
  );

drop policy if exists "tenant_insert_inventory_audits" on storage.objects;
create policy "tenant_insert_inventory_audits" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'inventory_audits'
    and storage_object_household(name) = any (get_user_household_ids())
  );
