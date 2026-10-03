-- ============================================================================
-- 101 — Storage hardening and the 14-day task-photo retention (Phase 117)
-- ============================================================================
-- THE AUDIT. migrations/092 already did the heavy lifting: both buckets are
-- private, `anon` has no policy on storage.objects, and every SELECT / INSERT
-- / DELETE is gated on the household prefix of the object key against
-- get_user_household_ids(). Re-checked against the live database for this
-- phase; nothing there needed to change. There is deliberately still no
-- UPDATE policy — nothing in the app overwrites an object (keys carry a
-- timestamp and a random suffix), so "no policy" is the strictest answer:
-- RLS denies an operation that has none.
--
-- What the audit did find is that the buckets accepted ANY file of ANY size:
--   * Size. Compression happens on the phone (lib/image.ts), which is a
--     courtesy, not a control — anyone holding a session can call the storage
--     API directly with a 50MB file.
--   * Type. /api/photo streams an object back with its stored Content-Type,
--     from the app's own origin. An "image" uploaded as text/html or
--     image/svg+xml would run script there, against the owner's session, the
--     moment the owner opened it. The proxy now refuses non-images as well
--     (app/api/photo/route.ts); this closes it at the door.
-- Every live object is image/webp or image/jpeg and under 210KB, so neither
-- limit touches anything that exists. PNG stays allowed because it is what a
-- browser that cannot encode WebP hands back from a canvas.
--
-- THE RETENTION. Chore and routine proof photos are evidence for a day, not
-- an archive: after 14 days they are deleted. Pet avatars, medical scans and
-- inventory photos are permanent and never touched.
--
-- WHY THIS IS NOT A PURE-SQL CRON JOB. Deleting rows from storage.objects
-- does NOT delete the file — the row is only the catalogue entry, the bytes
-- live in S3, and a SQL delete would orphan them (still billed, now
-- unreachable). Supabase blocks it outright with storage.protect_delete for
-- exactly that reason. Only the Storage API removes both. So the split is:
--   * SQL decides WHAT is due (task_photos_due_for_pruning) — one place that
--     knows the rule and its exclusions;
--   * the prune-task-photos Edge Function removes those objects through the
--     Storage API, then calls forget_missing_task_photos to clear the URLs
--     that now point at nothing, so no screen renders a broken thumbnail;
--   * pg_cron + pg_net call that function nightly.
--
-- WHO MAY TRIGGER IT. The function is deployed with verify_jwt off and
-- authorises itself: the caller must present a random secret that lives only
-- in Vault (task_photo_retention_secret), and the check happens inside the
-- RPCs below, so a request without it can neither list nor clear anything.
-- The RPCs are also revoked from every client role and granted to
-- service_role alone. Belt and braces: calling it early would only ever do
-- what tonight's run was going to do anyway.
--
-- Additive only: two bucket limits, two extensions, five functions. On its
-- own this migration deletes nothing — the RPCs refuse every caller until
-- migrations/102 creates the Vault secret and schedules the nightly run.
-- ============================================================================

-- --- 1. Bucket limits ------------------------------------------------------
update storage.buckets
set file_size_limit = 2 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id in ('household-logs', 'inventory_audits');

-- --- 2. Extensions -----------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- --- 3. Reading a stored photo URL -------------------------------------------
-- Rows keep the getPublicUrl() string as the photo's identifier (see
-- supabase-provider.ts). This is the SQL twin of parseStorageRef() in
-- lib/photos.ts: {bucket, object name}, or null for anything else.
create or replace function public.photo_object_ref(url text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select regexp_match(url, '/storage/v1/object/(?:public|sign)/([^/]+)/([^?]+)');
$$;

-- --- 4. The rule ---------------------------------------------------------------
create or replace function public.task_photo_retention_cutoff()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select now() - interval '14 days';
$$;

-- Raises unless p_secret is the Vault secret. The Edge Function passes on
-- whatever its caller sent, so this is the endpoint's whole authorisation.
create or replace function public.assert_task_photo_retention_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected text;
begin
  select decrypted_secret into expected
  from vault.decrypted_secrets
  where name = 'task_photo_retention_secret';
  if expected is null or p_secret is null or p_secret <> expected then
    raise exception 'Not authorised to prune task photos' using errcode = '42501';
  end if;
end;
$$;

-- The household-logs objects that are due: every row pointing at the object
-- is a task_log or household_task completed before the cutoff, and nothing
-- permanent points at it.
--
--   * "Every row", not "any row": an agenda batch photo is shared by several
--     logs (agenda-group-card), and one still inside the window keeps it.
--     A household_task that is not completed yet (a before photo on a chore
--     in progress) is never expired.
--   * Permanent references are checked by URL, not by folder: a pet's
--     avatar is any string anywhere in task_entities.metadata (avatar_url,
--     full_image_url, whatever comes next), plus medical scans and both
--     inventory tables. Folder names are a convention; a reference is a fact.
--   * Only objects that still exist are returned, oldest first, so repeated
--     calls walk forward through the backlog.
-- Photos no row references at all (an upload abandoned mid-form) are not
-- task photos by this rule and are left alone.
create or replace function public.task_photos_due_for_pruning(p_secret text, p_limit int default 100)
returns table (name text, size bigint, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  cutoff timestamptz := public.task_photo_retention_cutoff();
begin
  perform public.assert_task_photo_retention_secret(p_secret);

  return query
  with refs as (
    select public.photo_object_ref(l.photo_url) as r, l.completed_at < cutoff as expired
    from public.task_logs l
    where l.photo_url is not null
    union all
    select public.photo_object_ref(u), coalesce(t.completed_at < cutoff, false)
    from public.household_tasks t,
         unnest(array[t.photo_url, t.before_photo_url, t.after_photo_url]) as u
    where u is not null
  ),
  due as (
    select r[2] as object_name
    from refs
    where r is not null and r[1] = 'household-logs'
    group by r[2]
    having bool_and(expired)
  ),
  permanent as (
    select public.photo_object_ref(p.url) as r
    from (
      select m.document_photo_url as url from public.medical_records m
      union all
      select i.photo_url from public.inventory_items i
      union all
      select a.photo_url from public.inventory_audit_logs a
      union all
      select v #>> '{}'
      from public.task_entities e,
           jsonb_path_query(e.metadata, 'strict $.** ? (@.type() == "string")') as v
    ) p
    where p.url is not null
  )
  select o.name, (o.metadata->>'size')::bigint, o.created_at
  from due d
  join storage.objects o on o.bucket_id = 'household-logs' and o.name = d.object_name
  where not exists (
    select 1 from permanent pm
    where pm.r is not null and pm.r[1] = 'household-logs' and pm.r[2] = d.object_name
  )
  order by o.created_at
  limit greatest(p_limit, 0);
end;
$$;

-- After the objects are gone: clear every expired row's URL whose object no
-- longer exists. Keyed on "missing", not on a list of names, so it is
-- self-healing — a run that removed files and then died before this step is
-- tidied by the next one. Rows inside the window are never touched, even if
-- their object is missing for some other reason.
create or replace function public.forget_missing_task_photos(p_secret text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  cutoff timestamptz := public.task_photo_retention_cutoff();
  logs_cleared int;
  tasks_cleared int;
begin
  perform public.assert_task_photo_retention_secret(p_secret);

  update public.task_logs l
  set photo_url = null
  where l.completed_at < cutoff
    and (public.photo_object_ref(l.photo_url))[1] = 'household-logs'
    and not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'household-logs'
        and o.name = (public.photo_object_ref(l.photo_url))[2]
    );
  get diagnostics logs_cleared = row_count;

  -- One pass per column would be three scans; this nulls whichever of the
  -- three point at a missing object and leaves the rest as they are.
  update public.household_tasks t
  set photo_url = case when public.photo_object_ref(t.photo_url) is not null
                        and not exists (select 1 from storage.objects o where o.bucket_id = 'household-logs'
                                        and o.name = (public.photo_object_ref(t.photo_url))[2])
                       then null else t.photo_url end,
      before_photo_url = case when public.photo_object_ref(t.before_photo_url) is not null
                        and not exists (select 1 from storage.objects o where o.bucket_id = 'household-logs'
                                        and o.name = (public.photo_object_ref(t.before_photo_url))[2])
                       then null else t.before_photo_url end,
      after_photo_url = case when public.photo_object_ref(t.after_photo_url) is not null
                        and not exists (select 1 from storage.objects o where o.bucket_id = 'household-logs'
                                        and o.name = (public.photo_object_ref(t.after_photo_url))[2])
                       then null else t.after_photo_url end
  where t.completed_at < cutoff
    and exists (
      select 1
      from unnest(array[t.photo_url, t.before_photo_url, t.after_photo_url]) u
      where (public.photo_object_ref(u))[1] = 'household-logs'
        and not exists (select 1 from storage.objects o where o.bucket_id = 'household-logs'
                        and o.name = (public.photo_object_ref(u))[2])
    );
  get diagnostics tasks_cleared = row_count;

  return logs_cleared + tasks_cleared;
end;
$$;

-- PostgREST exposes public functions as RPCs; none of these is for a client.
revoke all on function public.assert_task_photo_retention_secret(text) from public, anon, authenticated;
revoke all on function public.task_photos_due_for_pruning(text, int) from public, anon, authenticated;
revoke all on function public.forget_missing_task_photos(text) from public, anon, authenticated;
grant execute on function public.task_photos_due_for_pruning(text, int) to service_role;
grant execute on function public.forget_missing_task_photos(text) to service_role;
