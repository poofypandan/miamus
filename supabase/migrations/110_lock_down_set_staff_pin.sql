-- ============================================================================
-- Phase 142 — set_staff_pin: staff may claim an empty name, never take one
-- ============================================================================
-- THE HOLE. set_staff_pin was guarded by get_user_household_ids(), which
-- unions household_members with device_sessions — so it is true for every
-- staff phone in the household. Staff phones sign in with
-- signInAnonymously(), which carries the `authenticated` role (see
-- migrations/109). Together: any staff member could call set_staff_pin on a
-- colleague who already had a PIN, set it to one they know, and sign in as
-- them — forging who-did-what and locking the colleague out. The function was
-- also granted to PUBLIC and anon.
--
-- WHY NOT JUST MAKE IT ADMIN-ONLY. Staff legitimately call it once: the first
-- time someone taps their name on the sign-in screen, they choose their own
-- PIN (staff-login-gate.tsx, the "create" step). Admin-only would break that.
--
-- THE RULE NOW:
--   admin  (a household_members row)  set or clear any PIN-holder's PIN, as
--                                     before — the owner's "Change PIN" and
--                                     "let them choose again".
--   staff  (a device session only)    set a PIN only on a name that has none
--                                     yet and is not archived. Never clear,
--                                     never overwrite.
--
-- What remains, honestly: a staff member can still claim a colleague's name
-- in the window before that colleague picks a PIN — a brand-new person, or one
-- the owner just reset. That is inherent to "they choose their own PIN on
-- first sign-in" and is the same exposure as tapping their name on the house
-- phone. It is a short window the owner opens deliberately, rather than a
-- permanent one anyone can use at any time.
-- ============================================================================

create or replace function set_staff_pin(p_staff_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_profile staff_profiles;
  v_is_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Visible to the caller at all: their own household, a PIN person, not an
  -- admin's Google-linked row.
  select * into v_profile
    from staff_profiles s
   where s.id = p_staff_id
     and s.user_id is null
     and s.household_id = any (get_user_household_ids());

  if not found then
    raise exception 'staff_not_found' using errcode = '42501';
  end if;

  -- coalesce, not a bare comparison. For a staff phone caller_admin_household()
  -- is NULL, so `household_id = NULL` is NULL — and `IF NOT NULL` does not run
  -- its body. Without this, the staff restrictions below are silently skipped
  -- for exactly the callers they exist for. (Caught by testing a simulated
  -- staff session against the first version of this migration.)
  v_is_admin := coalesce(v_profile.household_id = caller_admin_household(), false);

  if not v_is_admin then
    -- A staff device. It may only claim a name nobody has claimed yet.
    if p_pin is null then
      raise exception 'only_an_admin_can_reset_a_pin' using errcode = '42501';
    end if;
    if v_profile.has_pin then
      raise exception 'pin_already_set' using errcode = '42501';
    end if;
    -- Someone who has been taken off the roster (migrations/109) has no PIN,
    -- which would otherwise make them look claimable. Their name is off the
    -- sign-in screen; this closes the direct call too.
    if v_profile.archived_at is not null then
      raise exception 'staff_not_found' using errcode = '42501';
    end if;
  end if;

  if p_pin is null then
    update staff_profiles set pin = null, has_pin = false where id = p_staff_id;
    return;
  end if;

  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'pin_must_be_four_digits' using errcode = '22023';
  end if;

  update staff_profiles
     set pin = extensions.crypt(p_pin, extensions.gen_salt('bf')),
         has_pin = true
   where id = p_staff_id;
end;
$$;

-- Defence in depth: an archived person's PIN is already null, so this changes
-- nothing today. It keeps verify and set from drifting apart if a later change
-- stops clearing the PIN on archive.
create or replace function verify_staff_pin(p_staff_id uuid, p_pin text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  stored text;
begin
  select s.pin into stored
    from staff_profiles s
   where s.id = p_staff_id
     and s.user_id is null
     and s.archived_at is null
     and s.household_id = any (get_user_household_ids());

  if stored is null then
    return false;
  end if;

  return stored = extensions.crypt(p_pin, stored);
end;
$$;

-- Neither has any business being reachable without a session: an `anon`
-- caller has no household anyway, so these grants only widened the surface.
-- Staff phones keep access through `authenticated`.
revoke all on function set_staff_pin(uuid, text) from public, anon;
revoke all on function verify_staff_pin(uuid, text) from public, anon;
grant execute on function set_staff_pin(uuid, text) to authenticated;
grant execute on function verify_staff_pin(uuid, text) to authenticated;
