-- ============================================================================
-- 117 — House code and PIN checks skip archived staff (Phase 151 + 141)
-- ============================================================================
-- 109 lets an owner take someone off the roster (archived_at); 115 added the
-- house code, written before 109 was in the repo. Archiving clears the PIN,
-- so an archived person could never sign in through 115 — but:
--
--   * house_code_roster still listed them, as "Belum punya PIN", on the name
--     screen anyone with the house code sees: a former worker's name shown
--     to whoever picks up the code next;
--   * check_pin_internal and check_staff_pin did not look at archived_at, so
--     a PIN set on an archived row (set_staff_pin's admin path allows it)
--     would sign them in. 110's verify_staff_pin refused that; 115 replaced
--     it with a wrapper around check_staff_pin and the check was lost.
--
-- THE FIX. The same three functions with `archived_at is null` added, the
-- way 110's verify_staff_pin had it. An archived person is not on the list,
-- and their PIN check answers "no_pin", the same as an unknown id. verify_staff_pin
-- (115's wrapper) picks this up through check_staff_pin.
--
-- Bringing someone back (restore_staff_profile, 109) clears archived_at, and
-- they choose a new PIN through an invite link, as before.
--
-- Needs 109 (archived_at) and 115. Additive: three functions replaced in
-- place, same signatures and grants.
-- ============================================================================

create or replace function public.check_pin_internal(
  p_staff_id uuid,
  p_pin text,
  p_user_id uuid,
  p_household_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  person record;
  attempts integer;
  until timestamptz;
begin
  select s.name, s.pin, s.failed_pin_attempts, s.pin_locked_until
    into person
    from public.staff_profiles s
   where s.id = p_staff_id
     and s.household_id = p_household_id
     and s.user_id is null
     and s.archived_at is null
   for update;

  if not found or person.pin is null then
    return jsonb_build_object('status', 'no_pin');
  end if;

  if person.pin_locked_until is not null and person.pin_locked_until > now() then
    insert into public.staff_sign_in_attempts (user_id, household_id, staff_id, kind, success)
    values (p_user_id, p_household_id, p_staff_id, 'pin', false);
    return jsonb_build_object('status', 'locked', 'locked_until', person.pin_locked_until);
  end if;

  if p_pin is not null and person.pin = extensions.crypt(p_pin, person.pin) then
    update public.staff_profiles
       set failed_pin_attempts = 0, pin_locked_until = null
     where id = p_staff_id;
    insert into public.staff_sign_in_attempts (user_id, household_id, staff_id, kind, success)
    values (p_user_id, p_household_id, p_staff_id, 'pin', true);
    return jsonb_build_object('status', 'ok');
  end if;

  attempts := person.failed_pin_attempts + 1;
  insert into public.staff_sign_in_attempts (user_id, household_id, staff_id, kind, success)
  values (p_user_id, p_household_id, p_staff_id, 'pin', false);

  if attempts >= 5 then
    until := now() + interval '15 minutes';
    update public.staff_profiles
       set failed_pin_attempts = 0, pin_locked_until = until
     where id = p_staff_id;
    -- Best-effort: a push that can't be queued must not undo the lock.
    begin
      perform public.queue_owner_push(
        p_household_id,
        '🔒 PIN locked',
        person.name || '''s PIN was locked after 5 wrong tries. It can be tried again in 15 minutes.',
        '🔒 PIN terkunci',
        'PIN ' || person.name || ' terkunci setelah 5 kali salah. Bisa dicoba lagi dalam 15 menit.',
        '/dashboard?module=access',
        'pin-lock-' || p_staff_id::text,
        null
      );
    exception when others then
      raise warning 'PIN-lock push not queued for staff %: %', p_staff_id, sqlerrm;
    end;
    return jsonb_build_object('status', 'locked', 'locked_until', until);
  end if;

  update public.staff_profiles set failed_pin_attempts = attempts where id = p_staff_id;
  return jsonb_build_object('status', 'wrong_pin', 'attempts_left', 5 - attempts);
end;
$$;

create or replace function public.house_code_roster(p_code text)
returns table (id uuid, name text, has_pin boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.require_staff_phone_session();
  household uuid;
begin
  perform public.lock_house_code_session(uid);
  if public.house_code_attempts_exceeded(uid) then
    raise exception 'too_many_attempts' using errcode = 'P0001';
  end if;

  select c.household_id into household
    from public.household_join_codes c
   where c.code = public.normalize_house_code(p_code);

  insert into public.staff_sign_in_attempts (user_id, household_id, kind, success)
  values (uid, household, 'code', household is not null);

  if household is null then
    return;
  end if;

  return query
    select s.id, s.name, s.has_pin
      from public.staff_profiles s
     where s.household_id = household
       and s.user_id is null
       and s.archived_at is null
     order by s.name;
end;
$$;

create or replace function public.check_staff_pin(p_staff_id uuid, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  household uuid;
  result jsonb;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select s.household_id into household
    from public.staff_profiles s
   where s.id = p_staff_id
     and s.user_id is null
     and s.archived_at is null
     and s.household_id = any (public.get_user_household_ids());
  if household is null then
    return jsonb_build_object('status', 'no_pin');
  end if;

  result := public.check_pin_internal(p_staff_id, p_pin, uid, household);
  if result->>'status' = 'ok' then
    update public.device_sessions set last_seen_at = now() where user_id = uid;
  end if;
  return result;
end;
$$;

-- Replaced in place: create or replace keeps 115's grants, restated so this
-- file reads on its own.
revoke all on function public.house_code_roster(text) from public, anon;
grant execute on function public.house_code_roster(text) to authenticated, service_role;
revoke all on function public.check_staff_pin(uuid, text) from public, anon;
grant execute on function public.check_staff_pin(uuid, text) to authenticated, service_role;
revoke all on function public.check_pin_internal(uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.check_pin_internal(uuid, text, uuid, uuid) to service_role;
