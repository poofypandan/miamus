-- ============================================================================
-- 113 — New households need the operator's approval (Phase 148)
-- ============================================================================
-- Until now any signed-in account could create a household:
--
--   * households_insert_own (088) let `authenticated` insert a household
--     stamped with its own id — a staff phone's anonymous session included,
--     if it called the API directly;
--   * the middleware sends any Google account with no membership to
--     /onboarding, which inserted a household and an owner membership.
--
-- That is how staff who tapped "Continue with Google" came to own empty
-- households of their own, and how a stranger with the URL would get in.
--
-- And one door wider than that: members_insert_own / members_update_own (088)
-- let any signed-in session write a household_members row for itself, into
-- ANY household whose id it knows, with any role. A staff phone keeps its
-- household's id in localStorage, so it could make itself an owner and walk
-- past 093's "a staff device cannot become a co-owner". Onboarding was the
-- only client that used them; it now goes through create_household(), and
-- co-owners have always joined through use_owner_invite_token() (definer).
--
-- THE PIECES
--   platform_admins            who may approve. Seeded BY HAND on each project
--                              (never an email in a migration or in code):
--                                insert into public.platform_admins (user_id)
--                                select id from auth.users where email = '…';
--   household_access_requests  one row per account: pending, approved or
--                              rejected, when, and by whom. Name and email are
--                              not copied here; they are read from auth.users
--                              when the approvals screen lists them.
--   is_platform_admin()        the one check every admin-only function uses.
--   my_household_access()      what /onboarding shows: admin, approved,
--                              pending, rejected or none.
--   request_household_access() files the request (never for an anonymous
--                              session) and pushes it to the platform admins.
--   list_household_access_requests() / decide_household_access()
--                              the approvals screen; platform admins only.
--   create_household(name)     the household and its owner membership in one
--                              transaction (it was two client writes, Phase
--                              120). Platform admins, or an approved account
--                              that has no household yet.
--   prune_household_access_requests()
--                              nightly: a request rejected more than 30 days
--                              ago is deleted, and so is its Google sign-in
--                              account unless it has since joined a household
--                              (privacy policy, section 7).
--
-- NOT CHANGED: staff invites, co-owner invites (/join/owner — the invite is
-- the approval), and every existing household and membership. No backfill:
-- approval only gates creating a NEW household, and every current member
-- already has one (owner decision, 2026-11-06).
--
-- Additive except for the three dropped policies, which is the point.
-- ============================================================================

-- --- Who may approve --------------------------------------------------------------
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- No client reads or writes it; the definer functions below do. 107's default
-- privileges would otherwise grant `authenticated` the table, so say so here.
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from public, anon, authenticated;
grant select, insert, update, delete on public.platform_admins to service_role;

-- Read from auth.users, not the JWT: the claim is whatever the token carries,
-- the table is what the auth server recorded (cf. 093). An anonymous session
-- is never an admin, even if its id were somehow listed.
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.platform_admins pa
      join auth.users u on u.id = pa.user_id
     where pa.user_id = auth.uid()
       and not coalesce(u.is_anonymous, false)
  );
$$;

-- --- Access requests -------------------------------------------------------------
create table if not exists public.household_access_requests (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  constraint household_access_requests_decided
    check ((status = 'pending') = (decided_at is null))
);

create index if not exists household_access_requests_decided_by_idx
  on public.household_access_requests (decided_by);

alter table public.household_access_requests enable row level security;
revoke all on public.household_access_requests from public, anon, authenticated;
grant select, insert, update, delete on public.household_access_requests to service_role;

-- What /onboarding should show this account.
create or replace function public.my_household_access()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then 'none'
    when public.is_platform_admin() then 'admin'
    else coalesce(
      (select r.status from public.household_access_requests r where r.user_id = auth.uid()),
      'none'
    )
  end;
$$;

-- Files the request and tells the platform admins. Returns the account's
-- status afterwards. Asking again is harmless: an existing request (pending,
-- approved or rejected) is returned as it is, and nobody is pushed twice.
-- A rejected account cannot re-file until the nightly prune has removed it.
create or replace function public.request_household_access()
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
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- No auth.users row counts as anonymous: refuse rather than guess.
  select u.is_anonymous into anonymous from auth.users u where u.id = uid;
  if coalesce(anonymous, true) then
    raise exception 'anonymous_cannot_request_household' using errcode = '42501';
  end if;

  if public.is_platform_admin() then
    return 'admin';
  end if;

  insert into public.household_access_requests (user_id)
  values (uid)
  on conflict (user_id) do nothing;

  if not found then
    select r.status into existing from public.household_access_requests r where r.user_id = uid;
    return existing;
  end if;

  -- Same shape as send_test_push (103): an admin's devices are registered
  -- under the household they were in at the time, and push_dispatch_plan
  -- re-checks that membership at send time. Best-effort: a push that cannot
  -- be queued must never cost the request itself.
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

-- Pending first, then the last 30 days of decisions (older approved rows stay
-- in the table as the record of who was let in; they just aren't listed).
create or replace function public.list_household_access_requests()
returns table (
  user_id uuid,
  full_name text,
  email text,
  status text,
  requested_at timestamptz,
  decided_at timestamptz
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
      r.decided_at
    from public.household_access_requests r
    join auth.users u on u.id = r.user_id
    where r.status = 'pending' or r.decided_at > now() - interval '30 days'
    order by (r.status = 'pending') desc, coalesce(r.decided_at, r.requested_at) desc;
end;
$$;

-- Approve or reject. A decision can be changed (a mis-tap on Reject is
-- undone by approving); a rejection restarts its 30-day clock.
create or replace function public.decide_household_access(p_user_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not_platform_admin' using errcode = '42501';
  end if;
  if p_approve is null then
    raise exception 'decision_required' using errcode = '22023';
  end if;

  update public.household_access_requests r
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_at = now(),
         decided_by = auth.uid()
   where r.user_id = p_user_id;

  if not found then
    raise exception 'request_not_found' using errcode = '22023';
  end if;
end;
$$;

-- --- Creating a household ---------------------------------------------------------
create or replace function public.create_household(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  anonymous boolean;
  clean text := btrim(coalesce(p_name, ''));
  new_id uuid;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select u.is_anonymous into anonymous from auth.users u where u.id = uid;
  if coalesce(anonymous, true) then
    raise exception 'anonymous_cannot_create_household' using errcode = '42501';
  end if;

  -- The onboarding field's own limit (maxLength 60).
  if char_length(clean) = 0 or char_length(clean) > 60 then
    raise exception 'invalid_household_name' using errcode = '22023';
  end if;

  -- One at a time per account, so a double tap (or two tabs) cannot slip two
  -- households past the "no household yet" check below.
  perform pg_advisory_xact_lock(hashtext('create_household:' || uid::text));

  if not public.is_platform_admin() then
    if not exists (
      select 1 from public.household_access_requests r
       where r.user_id = uid and r.status = 'approved'
    ) then
      raise exception 'household_not_approved' using errcode = '42501';
    end if;
    -- Approval is for one household. More is a conversation, not an API call.
    if exists (select 1 from public.household_members m where m.user_id = uid) then
      raise exception 'already_has_household' using errcode = '42501';
    end if;
  end if;

  insert into public.households (name, owner_auth_id)
  values (clean, uid)
  returning id into new_id;

  -- Fires household_members_create_profile (106), which gives the new owner
  -- their roster row, exactly as the client insert did.
  insert into public.household_members (household_id, user_id, role)
  values (new_id, uid, 'owner');

  return new_id;
end;
$$;

-- --- Closing the direct-write doors -----------------------------------------------
drop policy if exists "households_insert_own" on public.households;
drop policy if exists "members_insert_own" on public.household_members;
drop policy if exists "members_update_own" on public.household_members;

-- And the table rights behind them (107 granted them for RLS to arbitrate):
-- with no policy left there is nothing to arbitrate, and a policy re-added by
-- mistake should not quietly reopen the door. Reads are unchanged.
revoke insert on public.households from anon, authenticated;
revoke insert, update on public.household_members from anon, authenticated;

-- --- Forgetting rejected requests -------------------------------------------------
-- The privacy policy promises: a request that is not approved is deleted after
-- 30 days, together with the Google sign-in it came from. The account is kept
-- only if it has since become something else — a member of a household (a
-- co-owner invite), a staff device, or a platform admin — in which case just
-- the request goes. Every foreign key to auth.users in this schema cascades or
-- sets null; each account is handled on its own, so one that cannot be deleted
-- does not hold up the rest.
--
-- THE LOCK. The account row is locked FOR UPDATE before anything is checked.
-- A membership, device session or admin row being inserted for it at that
-- moment takes a FOR KEY SHARE lock on the same row (the foreign key), so the
-- two are serialised: an insert that committed first is seen by the checks
-- below and keeps the account; one that comes after waits, then fails its
-- foreign key cleanly (the invite can be sent again). Without the lock, a
-- co-owner invite redeemed mid-run could be deleted along with the account it
-- had just joined (Codex review, PR #5).
--
-- FAILURES ARE RETRIED. If the account cannot be deleted, the request is kept,
-- so the next night tries again; dropping it would forget the account for good
-- and break the 30-day promise (Codex review, PR #5).
create or replace function public.prune_household_access_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target record;
  removed integer := 0;
begin
  for target in
    select r.user_id
      from public.household_access_requests r
     where r.status = 'rejected'
       and r.decided_at < now() - interval '30 days'
  loop
    begin
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

-- 20:30 UTC is 03:30 in Indonesia, half an hour after prune-task-photos (102),
-- which this leaves alone. Skipped with a warning where pg_cron is not
-- installed, so the rest of this migration still applies there.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('prune-household-access-requests')
      where exists (select 1 from cron.job where jobname = 'prune-household-access-requests');
    perform cron.schedule(
      'prune-household-access-requests',
      '30 20 * * *',
      'select public.prune_household_access_requests();'
    );
  else
    raise warning 'pg_cron is not installed: rejected household requests will not be pruned';
  end if;
end;
$$;

-- --- Who may call what --------------------------------------------------------------
-- Supabase grants EXECUTE to PUBLIC by default (cf. 111): revoke, then grant
-- exactly who needs each one.
revoke all on function public.is_platform_admin() from public, anon;
revoke all on function public.my_household_access() from public, anon;
revoke all on function public.request_household_access() from public, anon;
revoke all on function public.list_household_access_requests() from public, anon;
revoke all on function public.decide_household_access(uuid, boolean) from public, anon;
revoke all on function public.create_household(text) from public, anon;

grant execute on function public.is_platform_admin() to authenticated, service_role;
grant execute on function public.my_household_access() to authenticated, service_role;
grant execute on function public.request_household_access() to authenticated, service_role;
grant execute on function public.list_household_access_requests() to authenticated, service_role;
grant execute on function public.decide_household_access(uuid, boolean) to authenticated, service_role;
grant execute on function public.create_household(text) to authenticated, service_role;

-- Internal: only the cron job (which runs as the owner) and the service role.
revoke all on function public.prune_household_access_requests() from public, anon, authenticated;
grant execute on function public.prune_household_access_requests() to service_role;
