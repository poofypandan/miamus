-- ============================================================================
-- 124 — Morning food reminder, and database hygiene (Phase 157)
-- ============================================================================
-- THE MORNING REMINDER (decision F4 in docs/phase-156-plan.md: "Yes, owners;
-- staff optional"). At 07:00 in Jakarta, each household whose listed food
-- expires today or tomorrow gets one push to its admins, in each admin's own
-- language, through 114's queue_owner_push:
--   "To eat soon: Rendang, Lapis legit and 1 more."
--   "Perlu segera dimakan: Rendang, Lapis legit, dan 1 lagi."
-- Food already past its date is left out: it was in yesterday's reminder,
-- and the list shows it in red. Staff are not sent it (optional in F4, and
-- staff phones get no pushes today). One push per household per morning —
-- the tag carries the date, so a second run the same day replaces it on the
-- phone instead of adding another.
--
-- HYGIENE (Supabase's database advisors on staging, 2026-11-07):
--   * Twelve foreign keys had no covering index: deletes on the referenced
--     table (a staff member, a pet, an account) scanned the whole child
--     table. Each now has one. household_tasks' location key is composite
--     (location_id, household_id), so its index is too.
--   * storage_object_household (092) had no fixed search_path. It only uses
--     built-ins, so '' changes nothing it does and closes the warning.
--
-- Additive: indexes, one function, one cron job, one ALTER FUNCTION.
-- ============================================================================

-- --- 1. Indexes for foreign keys --------------------------------------------------
create index if not exists household_tasks_completed_by_idx on public.household_tasks (completed_by);
create index if not exists household_tasks_location_household_idx on public.household_tasks (location_id, household_id);
create index if not exists households_owner_auth_id_idx on public.households (owner_auth_id);
create index if not exists inventory_alerts_pet_id_idx on public.inventory_alerts (pet_id);
create index if not exists inventory_audit_logs_audited_by_idx on public.inventory_audit_logs (audited_by);
create index if not exists leave_requests_decided_by_idx on public.leave_requests (decided_by);
create index if not exists leave_requests_fallback_assignee_id_idx on public.leave_requests (fallback_assignee_id);
create index if not exists owner_invites_created_by_idx on public.owner_invites (created_by);
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);
create index if not exists staff_profiles_user_id_idx on public.staff_profiles (user_id);
create index if not exists staff_sign_in_attempts_household_id_idx on public.staff_sign_in_attempts (household_id);
create index if not exists staff_sign_in_attempts_staff_id_idx on public.staff_sign_in_attempts (staff_id);

-- --- 2. A fixed search_path for 092's helper ---------------------------------------
alter function public.storage_object_household(text) set search_path = '';

-- --- 3. The morning reminder --------------------------------------------------------
-- Returns how many households were sent one. Not SECURITY DEFINER: only the
-- cron job (as its owner) and the clean-up role call it.
create or replace function public.notify_food_expiring()
returns int
language plpgsql
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Jakarta')::date;
  household record;
  shown text;
  extra int;
  message_en text;
  message_id text;
  sent int := 0;
begin
  for household in
    select f.household_id,
           array_agg(coalesce(f.name, '') order by f.expires_on, f.created_at) as names,
           count(*) as total
    from public.food_items f
    where f.outcome is null
      and f.expires_on between today and today + 1
    group by f.household_id
  loop
    begin
      -- Up to two names; photo-only food is counted, not named.
      select string_agg(n, ', ') into shown
      from (select n from unnest(household.names) as n where n <> '' limit 2) named;
      extra := household.total - coalesce(array_length(string_to_array(shown, ', '), 1), 0);

      if shown is null then
        message_en := household.total || ' food' || case when household.total = 1 then '' else 's' end
                      || ' to eat today or tomorrow.';
        message_id := household.total || ' makanan perlu dimakan hari ini atau besok.';
      else
        message_en := 'To eat soon: ' || shown
                      || case when extra > 0 then ' and ' || extra || ' more' else '' end || '.';
        message_id := 'Perlu segera dimakan: ' || shown
                      || case when extra > 0 then ', dan ' || extra || ' lagi' else '' end || '.';
      end if;

      perform public.queue_owner_push(
        household.household_id,
        'Food to eat soon', message_en,
        'Makanan perlu segera dimakan', message_id,
        '/dashboard?module=inventory', 'food-soon-' || today::text,
        null
      );
      sent := sent + 1;
    exception when others then
      raise warning 'Morning food push not queued for household %: %', household.household_id, sqlerrm;
    end;
  end loop;
  return sent;
end;
$$;

revoke all on function public.notify_food_expiring() from public, anon, authenticated;
grant execute on function public.notify_food_expiring() to service_role;

-- 00:00 UTC is 07:00 in Jakarta: after breakfast is planned, before the day.
select cron.unschedule('notify-food-expiring')
where exists (select 1 from cron.job where jobname = 'notify-food-expiring');

select cron.schedule('notify-food-expiring', '0 0 * * *', $job$ select public.notify_food_expiring(); $job$);
