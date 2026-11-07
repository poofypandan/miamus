-- ============================================================================
-- 121 — Phone sign-ins nobody uses are removed after a week (Phase 153)
-- ============================================================================
-- A staff phone signs in anonymously before it is linked to a household
-- (invite link or house code, migrations/089, /115). When a phone is
-- unlinked — removed under "Linked staff phones", signed out when its person
-- is removed (119), or simply replaced — its anonymous sign-in stays behind in
-- auth.users with nothing pointing at it. Production had 15 of them for 2
-- staff on 2026-11-07, and they never went away.
--
-- THE FIX. Nightly: delete anonymous sign-ins that are linked to no household
-- (no device_sessions row) and have not signed in for 7 days. A linked phone
-- is never touched, however long since it was used. A phone caught mid-way
-- (signed in, not yet linked) has signed in recently, so the 7 days protect
-- it. A phone whose sign-in was removed simply gets a new one the next time it
-- opens the app (ensureAnonymousSession), and links again as before.
--
-- Google accounts are never touched here: they are people, and they go
-- through 113's rules.
--
-- Privacy policy (both languages) updated in the same PR.
-- ============================================================================

create or replace function public.prune_unlinked_phone_sign_ins()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from auth.users u
   where coalesce(u.is_anonymous, false)
     and coalesce(u.last_sign_in_at, u.created_at) < now() - interval '7 days'
     and not exists (select 1 from public.device_sessions d where d.user_id = u.id);
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- Internal: only the cron job (which runs as the owner) and the service role.
revoke all on function public.prune_unlinked_phone_sign_ins() from public, anon, authenticated;
grant execute on function public.prune_unlinked_phone_sign_ins() to service_role;

-- 20:50 UTC (03:50 in Indonesia), after the other nightly clean-ups.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('prune-unlinked-phone-sign-ins')
      where exists (select 1 from cron.job where jobname = 'prune-unlinked-phone-sign-ins');
    perform cron.schedule(
      'prune-unlinked-phone-sign-ins',
      '50 20 * * *',
      'select public.prune_unlinked_phone_sign_ins();'
    );
  else
    raise warning 'pg_cron is not installed: unlinked phone sign-ins will not be pruned';
  end if;
end;
$$;
