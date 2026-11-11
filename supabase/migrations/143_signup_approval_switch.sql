-- ============================================================================
-- 143 — A switch for automatic sign-up approval, off (Phase 172, PR A1)
-- ============================================================================
-- docs/phase-172-first-ten-minutes-plan.md, section 1. Owner decisions
-- (2026-11-10): D1 A, then changed by the owner the same night: "make sure I
-- still need to approve new households". So automatic approval is BUILT but
-- OFF: every new household still waits for the operator's approval, exactly
-- as before, until a platform admin turns the switch on. D2 A stands: the
-- waiting screen promises an email, and the approvals page gets an Email
-- them button (no mail service).
-- Numbered by build order (manager, 10 November): the next free number above
-- the highest on main when built.
--
-- NEW
--   signup_config              one row: auto_approve (the switch, OFF by
--        default: manual approval) and daily_auto_cap (25 automatic approvals
--        a Jakarta day across Miamus, once it is on). No client access; only
--        with the owner's say-so, a platform admin changes it with SQL, like
--        kakak_config:
--          update public.signup_config set auto_approve = true;    -- approve automatically
--          update public.signup_config set auto_approve = false;   -- back to manual
--          update public.signup_config set daily_auto_cap = 10;
--   household_access_requests.auto   true when the approval was automatic.
--   signup_auto_open()         internal: switch on and today's automatic
--        approvals under the cap (a read, for the screen).
--   signup_auto_approve(uid)   internal: the same check under a GLOBAL
--        transaction-scoped advisory lock taken before the count (as
--        kakak_begin does for its global cap), so a burst of sign-ups can't
--        all read "24"; writes the approved, automatic request. Only for an
--        account with no request row.
--   notify_household_joined(uid, name)   internal: "New household · X just
--        joined" to the platform admins, best-effort.
--
--   household_access_requests.notify_whatsapp   OPTIONAL: the Indonesian
--        WhatsApp number someone waiting for approval asked to be told on
--        (owner, 2026-11-11), as 628…, digits only. Asked only on the waiting
--        screen, never on the way to a household. Read only by platform
--        admins (the approvals list). Kept only until it is used: cleared
--        when the operator opens WhatsApp to tell them, when the request is
--        rejected, when they create their household, and by the nightly prune
--        30 days after they asked at the latest.
--   normalize_id_whatsapp(text)      +62 / 62 / 08 / 8… with spaces or
--        dashes → 628…, or null when it isn't an Indonesian mobile number.
--   set_my_access_contact(number)    the person waiting sets or clears their
--        own number (null: email). Only on their own pending request.
--   my_access_contact()              reads it back, for their own screen.
--   household_access_told(user)      platform admins: the operator opened
--        WhatsApp to tell them; the number is cleared.
--
-- RE-CREATED, each from its newest definition:
--   my_household_access (113)        a sixth answer, 'open': no request yet
--        and automatic approval is available (never while the switch is
--        off). Anonymous sessions get 'none'.
--   create_household (133)           same signature, same lock. A non-admin
--        with no request row is approved automatically in the same
--        transaction when open; over the cap or switched off it raises
--        household_not_approved WITHOUT writing anything (the screen then
--        calls request_household_access, which files the pending request).
--        A household made by an automatically approved account tells the
--        platform admins it joined.
--   request_household_access (113)   approves automatically under the same
--        switch, cap and lock, and returns 'approved' (old app builds map an
--        unknown answer to "none" and still call this; 'approved' is what
--        they understand). Otherwise files pending and pushes, as before.
--   list_household_access_requests (113)   also returns `auto`, the
--        account's language (for the ready message) and the WhatsApp number
--        if they gave one. Return type changes, so it is dropped first.
--   decide_household_access (113)    a rejection clears the number.
--   prune_household_access_requests (116)   also clears any number asked
--        for more than 30 days ago; 116's locked re-check is kept.
--
-- WITH THE SWITCH OFF (the default) nothing about signing up changes:
-- my_household_access answers 'none' to a new account, it taps Request
-- access, request_household_access files a pending request and pushes the
-- operator, and create_household refuses until the operator approves.
--
-- NOT CHANGED either way: a rejected account is refused; one household per
-- account; pending requests stay manual; decide_household_access; the 30-day
-- prune of rejected requests; anonymous sessions can never request or create.
--
-- Privacy policy and legal.ts updated in the same PR (section 3: we review
-- each request and tell the person by WhatsApp or email; the optional
-- number, who sees it and when it is deleted; if automatic approval is
-- switched on, new households are reviewed afterwards; whether an approval
-- was automatic is stored; section 7: the number's retention). Additive: one table, one column with a default, new
-- internal functions, four re-created. Every SECURITY DEFINER function
-- revokes EXECUTE from public and anon; the internal ones from
-- authenticated too.
-- ============================================================================

-- --- 1. The switch and the cap ---------------------------------------------------------
create table if not exists public.signup_config (
  id boolean primary key default true check (id),
  -- Off: the owner approves every new household (2026-11-10).
  auto_approve boolean not null default false,
  daily_auto_cap int not null default 25 check (daily_auto_cap >= 0)
);
insert into public.signup_config (id, auto_approve) values (true, false) on conflict (id) do nothing;

alter table public.signup_config enable row level security;
revoke all on public.signup_config from public, anon, authenticated;
grant select, insert, update, delete on public.signup_config to service_role;

alter table public.household_access_requests add column if not exists auto boolean not null default false;

-- The optional WhatsApp number to tell them on (owner, 2026-11-11).
alter table public.household_access_requests add column if not exists notify_whatsapp text;
alter table public.household_access_requests drop constraint if exists household_access_requests_notify_whatsapp_check;
alter table public.household_access_requests add constraint household_access_requests_notify_whatsapp_check
  check (notify_whatsapp is null or notify_whatsapp ~ '^628[1-9][0-9]{6,10}$');

-- An Indonesian mobile number as WhatsApp wants it (628…), from what people
-- type: +62 812-3456-7890, 0812 3456 7890, 812345678. Null if it isn't one.
create or replace function public.normalize_id_whatsapp(p_input text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when d ~ '^628[1-9][0-9]{6,10}$' then d end
    from (
      select case
               when x like '62%' then x
               when x like '0%' then '62' || substr(x, 2)
               when x like '8%' then '62' || x
               else x
             end as d
        from (select regexp_replace(coalesce(p_input, ''), '[[:space:]().+-]', '', 'g') as x) a
    ) b;
$$;
revoke all on function public.normalize_id_whatsapp(text) from public, anon;
grant execute on function public.normalize_id_whatsapp(text) to authenticated, service_role;

-- The cap counts automatic approvals by the Jakarta day they were made.
create index if not exists household_access_requests_auto_decided_idx
  on public.household_access_requests (decided_at) where auto;

-- --- 2. Is automatic approval available right now? -------------------------------------
create or replace function public.signup_auto_open()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select c.auto_approve and (
      select count(*)
        from public.household_access_requests r
       where r.auto
         and r.decided_at >= ((now() at time zone 'Asia/Jakarta')::date)::timestamp at time zone 'Asia/Jakarta'
    ) < c.daily_auto_cap
      from public.signup_config c
     where c.id
  ), false);
$$;
revoke all on function public.signup_auto_open() from public, anon, authenticated;
grant execute on function public.signup_auto_open() to service_role;

-- Approves p_uid automatically if it may be: no request row yet, the switch
-- on, and under today's cap. The global lock is taken BEFORE the count and
-- held to the end of the transaction, so two sign-ups can't both take the
-- 25th place. True when this call approved the account.
create or replace function public.signup_auto_approve(p_uid uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_uid is null then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtext('auto_approve'));
  if exists (select 1 from public.household_access_requests r where r.user_id = p_uid) then
    return false;
  end if;
  if not public.signup_auto_open() then
    return false;
  end if;
  insert into public.household_access_requests (user_id, status, requested_at, decided_at, decided_by, auto)
  values (p_uid, 'approved', now(), now(), null, true);
  return true;
end;
$$;
revoke all on function public.signup_auto_approve(uuid) from public, anon, authenticated;
grant execute on function public.signup_auto_approve(uuid) to service_role;

-- "New household · Sam just joined" to every platform admin's devices, in
-- that admin's language. Best-effort: a push that can't be queued never costs
-- the household (the caller wraps it too).
create or replace function public.notify_household_joined(p_uid uuid, p_household_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  who text;
  target record;
begin
  who := coalesce(
    nullif(btrim(left((select u.raw_user_meta_data ->> 'full_name' from auth.users u where u.id = p_uid), 60)), ''),
    nullif(btrim(left((select u.raw_user_meta_data ->> 'name' from auth.users u where u.id = p_uid), 60)), ''),
    nullif(btrim(left(p_household_name, 60)), ''),
    'Someone'
  );
  for target in
    select distinct s.user_id, s.household_id, coalesce(p.locale, 'en') as locale
      from public.platform_admins pa
      join public.push_subscriptions s on s.user_id = pa.user_id
      join public.household_members m on m.household_id = s.household_id and m.user_id = s.user_id
      left join public.user_preferences p on p.user_id = pa.user_id
  loop
    perform public.queue_push(
      target.household_id, 'owner',
      case when target.locale = 'id' then 'Rumah baru' else 'New household' end,
      case when target.locale = 'id' then who || ' baru bergabung.' else who || ' just joined.' end,
      '/dashboard/approvals', 'household-joined-' || p_uid::text,
      target.user_id, null
    );
  end loop;
end;
$$;
revoke all on function public.notify_household_joined(uuid, text) from public, anon, authenticated;
grant execute on function public.notify_household_joined(uuid, text) to service_role;

-- --- 3. What /onboarding shows (113, plus 'open') ---------------------------------------
create or replace function public.my_household_access()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then 'none'
    -- A staff phone never sets up a household.
    when coalesce((select u.is_anonymous from auth.users u where u.id = auth.uid()), true) then 'none'
    when public.is_platform_admin() then 'admin'
    when exists (select 1 from public.household_access_requests r where r.user_id = auth.uid())
      then (select r.status from public.household_access_requests r where r.user_id = auth.uid())
    when public.signup_auto_open() then 'open'
    else 'none'
  end;
$$;
revoke all on function public.my_household_access() from public, anon;
grant execute on function public.my_household_access() to authenticated, service_role;

-- --- 4. Asking (113, approving automatically when it may) -------------------------------
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

  -- An old app build asks first: let it straight through when it may
  -- (migrations/143). The household itself tells the operator it joined.
  if public.signup_auto_approve(uid) then
    return 'approved';
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
revoke all on function public.request_household_access() from public, anon;
grant execute on function public.request_household_access() to authenticated, service_role;

-- --- 5. The approvals list (113, plus auto and the account's language) ------------------
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
  whatsapp text
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
      r.notify_whatsapp
    from public.household_access_requests r
    join auth.users u on u.id = r.user_id
    left join public.user_preferences p on p.user_id = r.user_id
    where r.status = 'pending' or r.decided_at > now() - interval '30 days'
    order by (r.status = 'pending') desc, coalesce(r.decided_at, r.requested_at) desc;
end;
$$;
revoke all on function public.list_household_access_requests() from public, anon;
grant execute on function public.list_household_access_requests() to authenticated, service_role;

-- --- 6. Creating a household (133, approving automatically when it may) -----------------
create or replace function public.create_household(p_name text, p_has_pets boolean default null)
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
  joined_auto boolean := false;
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
    -- No request yet: approved automatically when the switch is on and
    -- today's cap isn't reached (migrations/143). Nothing is written
    -- otherwise; the raise below rolls back nothing that matters.
    perform public.signup_auto_approve(uid);
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
    select r.auto into joined_auto from public.household_access_requests r where r.user_id = uid;
  end if;

  -- The answer, when given: who answered and when, as the setter records it.
  insert into public.households (name, owner_auth_id, has_pets, has_pets_set_at, has_pets_set_by)
  values (
    clean, uid, p_has_pets,
    case when p_has_pets is not null then now() end,
    case when p_has_pets is not null then uid end
  )
  returning id into new_id;

  -- Fires household_members_create_profile (106), which gives the new owner
  -- their roster row, exactly as the client insert did.
  insert into public.household_members (household_id, user_id, role)
  values (new_id, uid, 'owner');

  -- In: the number they asked to be told on has done its job (or never will).
  update public.household_access_requests r
     set notify_whatsapp = null
   where r.user_id = uid and r.notify_whatsapp is not null;

  -- Reviewed afterwards: the operator hears who joined (D1). Never at the
  -- household's cost.
  if coalesce(joined_auto, false) then
    begin
      perform public.notify_household_joined(uid, clean);
    exception when others then
      raise warning 'Household joined push not queued for %: %', uid, sqlerrm;
    end;
  end if;

  return new_id;
end;
$$;
revoke all on function public.create_household(text, boolean) from public, anon;
grant execute on function public.create_household(text, boolean) to authenticated, service_role;

-- --- 7. Telling them they're in: the optional WhatsApp number -------------------------
-- The person waiting sets (or clears, with null or '') the number on their
-- own pending request. Returns what is stored: 628…, or null for email.
create or replace function public.set_my_access_contact(p_whatsapp text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  anonymous boolean;
  clean text;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select u.is_anonymous into anonymous from auth.users u where u.id = uid;
  if coalesce(anonymous, true) then
    raise exception 'anonymous_cannot_request_household' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_whatsapp, '')), '') is not null then
    clean := public.normalize_id_whatsapp(p_whatsapp);
    if clean is null then
      raise exception 'invalid_whatsapp' using errcode = '22023';
    end if;
  end if;
  update public.household_access_requests r
     set notify_whatsapp = clean
   where r.user_id = uid and r.status = 'pending';
  if not found then
    raise exception 'no_pending_request' using errcode = '22023';
  end if;
  return clean;
end;
$$;
revoke all on function public.set_my_access_contact(text) from public, anon;
grant execute on function public.set_my_access_contact(text) to authenticated, service_role;

-- Their own number, for the waiting screen. Null for email, or no request.
create or replace function public.my_access_contact()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select r.notify_whatsapp from public.household_access_requests r where r.user_id = auth.uid();
$$;
revoke all on function public.my_access_contact() from public, anon;
grant execute on function public.my_access_contact() to authenticated, service_role;

-- The operator opened WhatsApp to tell them they're in: the number goes.
-- Platform admins only; only for an approved request.
create or replace function public.household_access_told(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not_platform_admin' using errcode = '42501';
  end if;
  update public.household_access_requests r
     set notify_whatsapp = null
   where r.user_id = p_user_id and r.status = 'approved';
end;
$$;
revoke all on function public.household_access_told(uuid) from public, anon;
grant execute on function public.household_access_told(uuid) to authenticated, service_role;

-- --- 8. Decisions (113): a rejection clears the number --------------------------------
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
         decided_by = auth.uid(),
         -- Nobody is told on WhatsApp that they weren't approved.
         notify_whatsapp = case when p_approve then r.notify_whatsapp end
   where r.user_id = p_user_id;

  if not found then
    raise exception 'request_not_found' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.decide_household_access(uuid, boolean) from public, anon;
grant execute on function public.decide_household_access(uuid, boolean) to authenticated, service_role;

-- --- 9. The nightly prune (116, its newest definition): numbers go after 30 days -----
-- 116's body unchanged (the request locked and its decision re-checked
-- before the account is touched), plus one statement first.
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
