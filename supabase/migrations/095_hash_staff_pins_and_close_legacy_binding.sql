-- ============================================================================
-- Phase 97 — hashed staff PINs, and the end of legacy device binding
-- ============================================================================
-- Two loose ends from the SaaS transition, both flagged in the Phase 96 audit.
--
-- 1. PINs were stored as typed. staff_profiles is readable by every bound
--    device in the household, so any staff phone could read everyone's PIN —
--    including, in this house, two people who share one.
--
-- 2. bind_legacy_device let a phone bind itself to a household on nothing more
--    than a staff id, which is a uuid rather than a secret. That existed to
--    carry the pre-SaaS phones across; they have all transitioned, so the
--    window is now only an attack surface.
--
-- APPLIED IN TWO STEPS, on purpose: this migration hashes and adds the
-- functions while `select *` still works, so the bundle running on phones
-- right now keeps loading the staff list. migrations/096 then revokes the
-- column, once the build that names its columns is deployed.
--
-- WHAT HASHING BUYS, PLAINLY: a 4-digit PIN has ten thousand possibilities, so
-- a leaked bcrypt hash falls to a laptop in seconds. The point is not that the
-- hash is unbreakable — it is that the hash is no longer *readable*: the
-- column is revoked from every client role in migrations/096, so there is
-- nothing to leak through the API in the first place. The hash is defence for the copy that
-- escapes another way (a backup, a dump).
-- ============================================================================

-- The column used to be CHECKed as four digits, which a 60-character bcrypt
-- hash obviously is not. The rule has not gone away — it moved into
-- set_staff_pin below, which validates the PIN *before* hashing it, which is
-- the only place the rule can still be enforced meaningfully.
alter table staff_profiles drop constraint if exists staff_profiles_pin_4_digits;

-- `has_pin` replaces "is pin null" for the client, which can no longer see the
-- column at all. The login gate needs this to tell "enter your PIN" from
-- "choose one".
alter table staff_profiles add column if not exists has_pin boolean not null default false;
update staff_profiles set has_pin = (pin is not null);

-- Hash what is there. Guarded by the bcrypt prefix so re-running is harmless.
update staff_profiles
   set pin = extensions.crypt(pin, extensions.gen_salt('bf'))
 where pin is not null
   and pin !~ '^\$2[aby]\$';

-- ============================================================================
-- verify_staff_pin / set_staff_pin — the only way in or out of the column
-- ============================================================================
-- SECURITY DEFINER, so they read and write a column no client role can touch.
-- Both check that the staff member belongs to a household the caller is bound
-- to, which stops a device in one household probing another's PINs.
-- ============================================================================
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
     and s.household_id = any (get_user_household_ids());

  -- No such staff member, none this caller may see, or no PIN set: all answer
  -- false rather than explaining which, so this cannot be used to enumerate.
  if stored is null then
    return false;
  end if;

  return stored = extensions.crypt(p_pin, stored);
end;
$$;

grant execute on function verify_staff_pin(uuid, text) to authenticated;

create or replace function set_staff_pin(p_staff_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  target uuid;
begin
  select s.household_id into target
    from staff_profiles s
   where s.id = p_staff_id
     and s.household_id = any (get_user_household_ids());

  if target is null then
    raise exception 'staff_not_found' using errcode = '42501';
  end if;

  -- Null clears it, which is how the owner hands a PIN back to its owner to
  -- choose again.
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

grant execute on function set_staff_pin(uuid, text) to authenticated;

-- ============================================================================
-- Close the legacy binding window
-- ============================================================================
-- From here a device joins a household by redeeming an invite token and no
-- other way. The column stays (dropping it would rewrite the table for no
-- gain) but is cleared, so even a restored copy of the old function would
-- find every window shut.
-- ============================================================================
drop function if exists bind_legacy_device(uuid);

update households set legacy_binding_until = null;
