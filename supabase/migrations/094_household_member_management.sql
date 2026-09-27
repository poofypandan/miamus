-- ============================================================================
-- Phase 96 — seeing and removing co-owners
-- ============================================================================
-- The owner had no way to answer "who has access to my household?", and no way
-- to take it back. Two things stood in the way:
--
--   * household_members' select policy is `user_id = auth.uid()` — you can see
--     your own row and nobody else's, so a list was impossible;
--   * the table has no DELETE policy at all, so a "Remove" button would have
--     silently affected zero rows;
--   * emails live in auth.users, which clients cannot read at all.
--
-- Both functions below are SECURITY DEFINER for those reasons, and each one
-- re-checks the caller's membership itself rather than trusting the table's
-- policies to do it.
--
-- Note a staff device (anonymous, bound via device_sessions) is NOT a member,
-- so neither function will show it anything — the membership check is
-- deliberately against household_members, not get_user_household_ids().
-- ============================================================================

create or replace function list_household_members()
returns table (
  user_id uuid,
  email text,
  role text,
  joined_at timestamptz,
  is_founder boolean,
  is_self boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    m.user_id,
    u.email::text,
    m.role,
    m.created_at,
    h.owner_auth_id is not distinct from m.user_id,
    m.user_id = auth.uid()
  from household_members m
  join auth.users u on u.id = m.user_id
  join households h on h.id = m.household_id
  where m.household_id in (
    select hm.household_id from household_members hm where hm.user_id = auth.uid()
  )
  order by m.created_at;
$$;

grant execute on function list_household_members() to authenticated;

-- ============================================================================
-- remove_household_member — taking access back
-- ============================================================================
-- Two people are protected, for different reasons:
--
--   yourself   — locking yourself out of your own household with one tap is
--                not a feature, and the UI can't be the only thing stopping it.
--   the founder — households.owner_auth_id is the account the household was
--                created under. A co-owner admitted by an invite should not be
--                able to evict the person who let them in.
-- ============================================================================
create or replace function remove_household_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := auth.uid();
  target_household uuid;
begin
  if caller is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_user_id = caller then
    raise exception 'cannot_remove_self' using errcode = '22023';
  end if;

  select hm.household_id into target_household
    from household_members hm
   where hm.user_id = caller
   limit 1;

  if target_household is null then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  if exists (
    select 1 from households h
     where h.id = target_household and h.owner_auth_id = p_user_id
  ) then
    raise exception 'cannot_remove_founder' using errcode = '42501';
  end if;

  delete from household_members
   where household_id = target_household
     and user_id = p_user_id;

  if not found then
    raise exception 'member_not_found' using errcode = '22023';
  end if;
end;
$$;

grant execute on function remove_household_member(uuid) to authenticated;
