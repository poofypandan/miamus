-- ============================================================================
-- Phase 88 (part 1 of 2) — device identities and the tenant helper
-- ============================================================================
-- Gives a staff phone something it has never had: an identity of its own.
-- Until now every request arrived as `anon`, so the database could not tell
-- this household's phone from anyone holding the public key, and tenant
-- separation was a filter in the app rather than a rule in Postgres.
--
-- A device signs in anonymously (Supabase Auth), which gives it a real
-- auth.uid(), and that uid is bound here to exactly one household. Owners are
-- bound the same way through household_members. Part 2 (migration 090) is the
-- lockdown that starts enforcing it.
--
-- Nothing here changes an existing policy, so applying it alone is safe.
-- ============================================================================

create table if not exists device_sessions (
  id uuid primary key default gen_random_uuid(),
  -- One household per device. Unique so the binding can be upserted: a phone
  -- that redeems a second invite moves, it does not accumulate access.
  user_id uuid not null unique references auth.users(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists device_sessions_household_id_idx on device_sessions(household_id);

alter table device_sessions enable row level security;

-- A device may see and create its own binding, nothing else. No UPDATE or
-- DELETE policy: moving a device to another household happens inside the
-- definer functions below, which check a token or a legacy proof first.
drop policy if exists "device_sessions_select_own" on device_sessions;
create policy "device_sessions_select_own" on device_sessions
  for select to authenticated using (user_id = auth.uid());

-- ============================================================================
-- get_user_household_ids — the one question every policy asks
-- ============================================================================
-- Returns every household the caller may touch: the ones they own (a Google
-- account in household_members) and the one their device is bound to.
--
-- SECURITY DEFINER for two reasons: it must read household_members and
-- device_sessions from inside policies without those tables' own RLS
-- recursing, and it keeps the lookup to one index hit per query. STABLE so
-- Postgres evaluates it once per statement rather than per row — with the
-- array form below, a policy becomes `household_id = any (<one array>)`.
--
-- search_path is pinned: a definer function resolving names through the
-- caller's path can be pointed at a shadowed table.
-- ============================================================================
create or replace function get_user_household_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(household_id), '{}'::uuid[])
  from (
    select household_id from household_members where user_id = auth.uid()
    union
    select household_id from device_sessions where user_id = auth.uid()
  ) as allowed;
$$;

grant execute on function get_user_household_ids() to authenticated;

-- ============================================================================
-- redeem_staff_invite — the magic link, now binding as well as resolving
-- ============================================================================
-- Replaces use_staff_invite_token (Phase 86C), which handed back a household
-- id and left the device anonymous to the database. The caller must already
-- be signed in — the app signs in anonymously first — so there is a uid to
-- bind. One statement marks the token used, so two phones racing the same
-- link cannot both win.
-- ============================================================================
drop function if exists use_staff_invite_token(text);

create or replace function redeem_staff_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  resolved uuid;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  update staff_invites
     set used_at = now()
   where token = p_token
     and expires_at > now()
     and used_at is null
  returning household_id into resolved;

  if resolved is null then
    -- One message for "no such token", "expired" and "already used": a caller
    -- probing tokens learns only that this one is no good.
    raise exception 'invalid_or_expired_invite' using errcode = '22023';
  end if;

  insert into device_sessions (user_id, household_id)
  values (uid, resolved)
  on conflict (user_id) do update
    set household_id = excluded.household_id, last_seen_at = now();

  return resolved;
end;
$$;

grant execute on function redeem_staff_invite(text) to authenticated;

-- ============================================================================
-- The grandfather window, and why it is a window
-- ============================================================================
-- The phones already in the house have no token and no account. All they
-- carry is a staff id in localStorage, from the day someone picked their name.
-- Binding on that alone is weaker than a token: a staff id is a uuid, not a
-- secret, and the default household id ships in the public bundle.
--
-- So legacy binding is allowed only while a household's window is open, and
-- only for a staff id that really belongs to that household. Existing houses
-- get 30 days, which is long enough for every phone to open the app once. The
-- owner closes it early by setting the column to null — worth doing the moment
-- the last phone has upgraded, because until then this is the softest way in.
-- ============================================================================
alter table households add column if not exists legacy_binding_until timestamptz;

update households
   set legacy_binding_until = now() + interval '30 days'
 where legacy_binding_until is null;

create or replace function bind_legacy_device(p_staff_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  resolved uuid;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select s.household_id into resolved
    from staff_profiles s
    join households h on h.id = s.household_id
   where s.id = p_staff_id
     and h.legacy_binding_until is not null
     and h.legacy_binding_until > now();

  if resolved is null then
    raise exception 'legacy_binding_unavailable' using errcode = '22023';
  end if;

  insert into device_sessions (user_id, household_id)
  values (uid, resolved)
  on conflict (user_id) do update
    set household_id = excluded.household_id, last_seen_at = now();

  return resolved;
end;
$$;

grant execute on function bind_legacy_device(uuid) to authenticated;
