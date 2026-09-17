-- ============================================================================
-- Phase 80A — let the app actually delete the photos it says it deletes
-- ============================================================================
-- schema.sql granted select + insert on the household-logs bucket but never
-- delete, so deletePhoto() in supabase-provider.ts has been refused every time.
-- household-context swallows that failure on purpose — a storage error must not
-- strand a task as done — which made the failure invisible: every photo anyone
-- has ever "deleted" is still in the bucket, still reachable by its public URL.
-- The policy below is the fix the Phase-32 security audit wrote and left in
-- supabase/rls-policies.sql; it was never applied to the live database.
--
-- WHAT THIS OPENS, PLAINLY: staff and owner both arrive as `anon` with a key
-- that ships in the public bundle, so this lets anyone holding that key delete
-- any object in this bucket. That is the same posture every other table here
-- has (see migrations/060) and the same one the bucket already had for reads —
-- it is public:true, so those photos were world-readable regardless. The app
-- limits deletion to a 5-minute window for staff and to the owner otherwise;
-- that limit is UI, not enforcement.
--
-- A tighter alternative was considered and rejected: restricting deletes to
-- objects younger than five minutes would enforce the staff window in the
-- database, but it would also break the owner's ability to remove an old photo,
-- which is the one deletion path that matters most.
-- ============================================================================

drop policy if exists "Public delete access for household-logs" on storage.objects;
create policy "Public delete access for household-logs"
on storage.objects for delete
using (bucket_id = 'household-logs');
