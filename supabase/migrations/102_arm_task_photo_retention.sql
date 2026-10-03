-- ============================================================================
-- 102 — Arm the 14-day task-photo retention (Phase 117)
-- ============================================================================
-- migrations/101 built the pruning machinery and left it inert: its RPCs
-- refuse every caller until the Vault secret below exists. This creates the
-- secret and schedules the nightly call, so running it is the moment photos
-- older than 14 days start being deleted.
--
-- Kept separate from 101 on purpose: it writes to Vault, and it is the step
-- that turns an irreversible deletion on. Run it in the SQL editor once the
-- prune-task-photos Edge Function is deployed. Safe to re-run.
-- ============================================================================

-- Generated here and never written down anywhere else: pg_cron reads it out
-- of Vault at call time and the RPCs compare against the same row.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'task_photo_retention_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'task_photo_retention_secret',
      'Authorises the prune-task-photos Edge Function (migrations/101)'
    );
  end if;
  if not exists (select 1 from vault.secrets where name = 'project_url') then
    perform vault.create_secret(
      'https://ozsegmpxluxirkasaqzz.supabase.co',
      'project_url',
      'Base URL pg_cron jobs use to reach Edge Functions'
    );
  end if;
end;
$$;

-- 20:00 UTC is 03:00 in Indonesia: nobody is finishing a chore, and a
-- photo crossing the 14-day line goes at the start of its day, not mid-shift.
select cron.unschedule('prune-task-photos')
where exists (select 1 from cron.job where jobname = 'prune-task-photos');

select cron.schedule(
  'prune-task-photos',
  '0 20 * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/prune-task-photos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-retention-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'task_photo_retention_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);
