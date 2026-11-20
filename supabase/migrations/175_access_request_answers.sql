-- ============================================================================
-- 175 — Two questions when asking for access (owner, 2026-11-20)
-- ============================================================================
-- The owner wants to know why people want Miamus, to improve the product,
-- and who sent them, ahead of invite links. Request access (/onboarding,
-- the "none" state) now asks:
--
--   "What would you like Miamus to help with?"   required on the screen,
--        up to 300 characters, with tappable suggestions that fill the box.
--   "Who told you about Miamus?"                 optional, up to 100.
--
-- NEW
--   household_access_requests.wants_help_with   text, nullable
--   household_access_requests.heard_from        text, nullable
--        Both written only by request_household_access(), read only by
--        platform admins (the approvals list). Never in a push or any other
--        notification: the "New household request" push is unchanged.
--        Cleared 12 months after the request by the nightly prune (the
--        request itself stays: who was let in, and when), and deleted with
--        the request (a rejected request after 30 days, an account that is
--        deleted). Privacy policy sections 2 and 7 say so.
--
-- RE-CREATED, each from its newest definition (143):
--   request_household_access(p_wants_help_with, p_heard_from)
--        Was request_household_access() with no arguments. Both new ones
--        default to null, so an old app build calling with none still files
--        its request exactly as before (dropped and re-created rather than
--        overloaded: two versions would make a no-argument call ambiguous).
--        The answers are trimmed; empty becomes null; longer than 300 / 100
--        characters raises invalid_access_answer. The screen requires the
--        first; the database does not, for those old builds. Stored on a new
--        request, pending or approved automatically. An existing request is
--        returned as it is, its answers unchanged.
--   list_household_access_requests()   also returns both answers. Return
--        type changes, so it is dropped first.
--   prune_household_access_requests()  143's body, plus one statement:
--        answers given more than 12 months ago are cleared.
--
-- NOT CHANGED: RLS on household_access_requests (no client access; only the
-- definer functions read or write it), the push text, the auto-approval
-- switch and cap, decisions, the 30-day deletion of rejected requests.
--
-- Additive: two nullable columns with length checks; old rows stay valid.
-- Every re-created SECURITY DEFINER function revokes EXECUTE from public
-- and anon and grants it only to who needs it.
-- ============================================================================

-- --- 1. The answers --------------------------------------------------------------------
alter table public.household_access_requests add column if not exists wants_help_with text;
alter table public.household_access_requests add column if not exists heard_from text;

alter table public.household_access_requests drop constraint if exists household_access_requests_wants_help_with_check;
alter table public.household_access_requests add constraint household_access_requests_wants_help_with_check
  check (wants_help_with is null or char_length(wants_help_with) between 1 and 300);
alter table public.household_access_requests drop constraint if exists household_access_requests_heard_from_check;
alter table public.household_access_requests add constraint household_access_requests_heard_from_check
  check (heard_from is null or char_length(heard_from) between 1 and 100);

-- --- 2. Asking (143, with the answers) ---------------------------------------------------
drop function if exists public.request_household_access();
create or replace function public.request_household_access(
  p_wants_help_with text default null,
  p_heard_from text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  anonymous boolean;
  existing text;
  requester text;
  target record;
  help text := nullif(btrim(coalesce(p_wants_help_with, '')), '');
  heard text := nullif(btrim(coalesce(p_heard_from, '')), '');
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- No auth.users row counts as anonymous: refuse rather than guess.
  select u.is_anonymous into anonymous from auth.users u where u.id = uid;
  if coalesce(anonymous, true) then
    raise exception 'anonymous_cannot_request_household' using errcode = '42501';
  end if;

  -- The screen's own limits (maxLength 300 and 100).
  if char_length(help) > 300 or char_length(heard) > 100 then
    raise exception 'invalid_access_answer' using errcode = '22023';
  end if;

  if public.is_platform_admin() then
    return 'admin';
  end if;

  -- An old app build asks first: let it straight through when it may
  -- (migrations/143). The household itself tells the operator it joined.
  -- The row was written a moment ago in this transaction, with no answers.
  if public.signup_auto_approve(uid) then
    update public.household_access_requests r
       set wants_help_with = help,
           heard_from = heard
     where r.user_id = uid;
    return 'approved';
  end if;

  insert into public.household_access_requests (user_id, wants_help_with, heard_from)
  values (uid, help, heard)
  on conflict (user_id) do nothing;

  if not found then
    select r.status into existing from public.household_access_requests r where r.user_id = uid;
    return existing;
  end if;

  -- Same shape as send_test_push (103): an admin's devices are registered
  -- under the household they were in at the time, and push_dispatch_plan
  -- re-checks that membership at send time. Best-effort: a push that cannot
  -- be queued must never cost the request itself. The answers stay out of
  -- it (migrations/175): a lock screen is no place for them.
  begin
    requester := coalesce(
      nullif(btrim(left((select u.raw_user_meta_data ->> 'full_name' from auth.users u where u.id = uid), 60)), ''),
      nullif(btrim(left((select u.raw_user_meta_data ->> 'name' from auth.users u where u.id = uid), 60)), ''),
      'Someone'
    );
    for target in
      select distinct s.user_id, s.household_id
        from public.platform_admins pa
        join public.push_subscriptions s on s.user_id = pa.user_id
        join public.household_members m on m.household_id = s.household_id and m.user_id = s.user_id
    loop
      perform public.queue_push(
        target.household_id, 'owner', 'New household request',
        requester || ' is waiting for your approval.',
        '/dashboard/approvals', 'household-request-' || uid::text,
        target.user_id, null
      );
    end loop;
  exception when others then
    raise warning 'Household request push not queued for %: %', uid, sqlerrm;
  end;

  return 'pending';
end;
$$;
revoke all on function public.request_household_access(text, text) from public, anon;
grant execute on function public.request_household_access(text, text) to authenticated, service_role;

-- --- 3. The approvals list (143, plus the answers) ---------------------------------------
drop function if exists public.list_household_access_requests();
create or replace function public.list_household_access_requests()
returns table (
  user_id uuid,
  full_name text,
  email text,
  status text,
  requested_at timestamptz,
  decided_at timestamptz,
  auto boolean,
  locale text,
  whatsapp text,
  wants_help_with text,
  heard_from text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not_platform_admin' using errcode = '42501';
  end if;

  return query
    select
      r.user_id,
      coalesce(
        nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
        nullif(btrim(u.raw_user_meta_data ->> 'name'), '')
      )::text,
      u.email::text,
      r.status,
      r.requested_at,
      r.decided_at,
      r.auto,
      coalesce(p.locale, 'en')::text,
      r.notify_whatsapp,
      r.wants_help_with,
      r.heard_from
    from public.household_access_requests r
    join auth.users u on u.id = r.user_id
    left join public.user_preferences p on p.user_id = r.user_id
    where r.status = 'pending' or r.decided_at > now() - interval '30 days'
    order by (r.status = 'pending') desc, coalesce(r.decided_at, r.requested_at) desc;
end;
$$;
revoke all on function public.list_household_access_requests() from public, anon;
grant execute on function public.list_household_access_requests() to authenticated, service_role;

-- --- 4. The nightly prune (143, its newest definition): answers go after 12 months -------
-- 143's body unchanged, plus the second statement.
create or replace function public.prune_household_access_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target record;
  current_status text;
  current_decided timestamptz;
  removed integer := 0;
begin
  -- The WhatsApp number to tell them on is kept 30 days at most (privacy
  -- policy, section 7), whatever became of the request (migrations/143).
  update public.household_access_requests r
     set notify_whatsapp = null
   where r.notify_whatsapp is not null
     and r.requested_at < now() - interval '30 days';

  -- Why they wanted Miamus and who told them: kept 12 months from the
  -- request (privacy policy, section 7; migrations/175).
  update public.household_access_requests r
     set wants_help_with = null,
         heard_from = null
   where (r.wants_help_with is not null or r.heard_from is not null)
     and r.requested_at < now() - interval '12 months';

  for target in
    select r.user_id
      from public.household_access_requests r
     where r.status = 'rejected'
       and r.decided_at < now() - interval '30 days'
  loop
    begin
      -- The request first, then a fresh look at it: a decision made since the
      -- loop's query, or one waiting on this lock, decides what happens next.
      select r.status, r.decided_at
        into current_status, current_decided
        from public.household_access_requests r
       where r.user_id = target.user_id
       for update;

      if not found
         or current_status <> 'rejected'
         or current_decided >= now() - interval '30 days'
      then
        continue;
      end if;

      perform 1 from auth.users u where u.id = target.user_id for update;

      if found
         and not exists (select 1 from public.household_members m where m.user_id = target.user_id)
         and not exists (select 1 from public.device_sessions d where d.user_id = target.user_id)
         and not exists (select 1 from public.platform_admins pa where pa.user_id = target.user_id)
      then
        -- Cascades to the request row, identities, sessions and push devices.
        delete from auth.users u where u.id = target.user_id;
      else
        -- Gone already, or kept because it is something else now: only the
        -- request goes.
        delete from public.household_access_requests r where r.user_id = target.user_id;
      end if;
      removed := removed + 1;
    exception when others then
      -- The block's changes roll back, the request with them: retried tomorrow.
      raise warning 'Rejected account % not deleted, will retry: %', target.user_id, sqlerrm;
    end;
  end loop;

  return removed;
end;
$$;
revoke all on function public.prune_household_access_requests() from public, anon, authenticated;
grant execute on function public.prune_household_access_requests() to service_role;
