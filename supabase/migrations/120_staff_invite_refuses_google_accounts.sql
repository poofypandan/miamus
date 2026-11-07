-- ============================================================================
-- 120 — A staff invite link is for staff phones only (Phase 147, database half)
-- ============================================================================
-- Phase 147 stopped the app from redeeming a staff invite on a phone signed in
-- with Google: the owner tapping the link they were about to send would spend
-- it on their own account and file that account as a staff device. That check
-- lives in /join/staff only. redeem_staff_invite (089) still accepts any
-- signed-in caller, so a direct call — or an older version of the app —
-- could still do it. Reserved as "112" in the 2026-11-06 handoff; numbered
-- 120 because 113–119 were applied first.
--
-- THE FIX. Refuse a caller that is not an anonymous session, read from
-- auth.users rather than the token (cf. 093, 113). The invite is left unused,
-- so it still works on the staff phone it was meant for. Everything else is
-- 089's function as it was, with search_path pinned to '' and names
-- qualified.
--
-- Same signature; 111's grants restated.
-- ============================================================================

create or replace function public.redeem_staff_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved uuid;
  uid uuid := auth.uid();
  anonymous boolean;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- No auth.users row counts as not anonymous: refuse rather than guess.
  select u.is_anonymous into anonymous from auth.users u where u.id = uid;
  if not coalesce(anonymous, false) then
    raise exception 'staff_invite_needs_staff_phone' using errcode = '42501';
  end if;

  update public.staff_invites
     set used_at = now()
   where token = p_token
     and expires_at > now()
     and used_at is null
  returning household_id into resolved;

  if resolved is null then
    raise exception 'invalid_or_expired_invite' using errcode = '22023';
  end if;

  insert into public.device_sessions (user_id, household_id)
  values (uid, resolved)
  on conflict (user_id) do update
    set household_id = excluded.household_id, last_seen_at = now();

  return resolved;
end;
$$;

revoke all on function public.redeem_staff_invite(text) from public, anon;
grant execute on function public.redeem_staff_invite(text) to authenticated, service_role;
