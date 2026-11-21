-- ============================================================================
-- 179 — the photo backup reader (security audit S5, pre-launch H3)
-- ============================================================================
-- Database backups don't include Storage objects, so a nightly job copies
-- every photo to a versioned bucket in AWS Singapore
-- (.github/workflows/photo-backup.yml, scripts/photo-backup/,
-- docs/photo-backups.md). It has to read every household's photos, and
-- nothing else.
--
-- Supabase has no read-only storage key: the secret key and Storage's S3
-- access keys can each delete every photo (and the secret key reads every
-- table). So the job signs in as one dedicated account, and this policy lets
-- that account, and only it, READ the three photo buckets. It can't upload,
-- rename or delete (no such policy names it), and it reads no table rows: it
-- belongs to no household, so every table policy already shuts it out.
--
-- HOW THE ACCOUNT IS NAMED: app_metadata.miamus_role = 'photo_backup_reader'.
-- app_metadata can be set only with the service role (dashboard SQL or the
-- admin API), never by the user, and it travels in the session's JWT, so the
-- check needs no table and no SECURITY DEFINER function. Set BY HAND on each
-- project, after creating the account (docs/photo-backups.md, owner steps):
--
--   update auth.users
--      set raw_app_meta_data = raw_app_meta_data || '{"miamus_role": "photo_backup_reader"}'
--    where email = '<the backup reader account''s email>';
--
-- To revoke: remove the key (or delete the account). A session already
-- signed in keeps reading until its token expires (an hour at most).
--
-- Nothing else changes. Not destructive; rolls back by dropping the policy.
-- ============================================================================

drop policy if exists "photo_backup_reader_read" on storage.objects;
create policy "photo_backup_reader_read" on storage.objects
  for select to authenticated using (
    bucket_id in ('household-logs', 'inventory_audits', 'owner-receipts')
    and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'miamus_role', '') = 'photo_backup_reader'
  );

comment on policy "photo_backup_reader_read" on storage.objects is
  'Photo backups (migrations/179): the one account with app_metadata.miamus_role = photo_backup_reader may read, and only read, every photo bucket.';
