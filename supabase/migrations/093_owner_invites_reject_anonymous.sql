-- ============================================================================
-- Phase 91 — a staff device cannot become a co-owner
-- ============================================================================
-- Phase 91 hides the "Owner Dashboard" button from anonymous sessions by
-- keying it on household_members. That leaves one way for a staff phone to
-- acquire a membership anyway: open a co-owner invite link. It is already
-- signed in (anonymously, since Phase 88), so use_owner_invite_token would
-- have admitted it — and a staff device would then hold owner access to the
-- whole dashboard.
--
-- A co-owner invite is for a person with a Google account. Anonymous callers
-- are refused, with their own message so the UI can say something useful
-- rather than "invalid link".
--
-- Read from auth.users rather than the JWT's is_anonymous claim: the claim is
-- whatever the token carries, the table is what the auth server recorded.
-- ============================================================================

create or replace function use_owner_invite_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  resolved uuid;
  uid uuid := auth.uid();
  anonymous boolean;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select u.is_anonymous into anonymous from auth.users u where u.id = uid;
  if coalesce(anonymous, false) then
    raise exception 'anonymous_cannot_be_owner' using errcode = '42501';
  end if;

  update owner_invites
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

  -- do nothing, not an error: clicking your own invite twice should land you
  -- in the household, not on an error screen.
  insert into household_members (household_id, user_id, role)
  values (resolved, uid, 'owner')
  on conflict (household_id, user_id) do nothing;

  return resolved;
end;
$$;

grant execute on function use_owner_invite_token(text) to authenticated;
