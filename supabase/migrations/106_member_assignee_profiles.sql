-- ============================================================================
-- 106 — Admins can be assigned chores (Phase 139)
-- ============================================================================
-- Miamus began as an owner with paid staff, and the schema says so: a chore's
-- assigned_to and completed_by, a log's staff_id, a stock check's audited_by
-- all point at staff_profiles — names on a roster, signed in with a PIN on a
-- shared phone. The Google accounts in household_members had no row there,
-- so an admin could not be given a chore, and work they did themselves was
-- filed under nobody.
--
-- That does not fit a house of siblings or flatmates, where the people
-- setting the chores are the people doing them. Rather than teach every one
-- of those columns (and every query, filter and RPC that reads them) a second
-- kind of person, each admin gets a row of their own on the roster, linked
-- to their account:
--
--   staff_profiles.user_id   null  -> a person who signs in by name and PIN
--                            set   -> an admin, who signs in with Google
--
-- Every foreign key, the claim guard, the workload RPC and the RLS policies
-- keep working untouched — an admin's row is simply one more person they
-- already handle. Roles in household_members stay 'owner'; only the app's
-- wording changes.
--
-- Additive only: one nullable column, one index, and functions.
-- ============================================================================

alter table staff_profiles
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- One row per admin per house. A plain unique index rather than a partial
-- one: NULLs never collide, so the PIN-only roster is unaffected, and ON
-- CONFLICT can name it directly.
create unique index if not exists staff_profiles_household_user_idx
  on staff_profiles(household_id, user_id);

-- Readable like the rest of the roster (migrations/096 grants by column). It
-- tells the app which names are admins; it is an id, not a secret. Not
-- insertable or updatable by clients: only the functions below link a row.
grant select (user_id) on staff_profiles to authenticated;

-- ----------------------------------------------------------------------------
-- The name an admin appears under: their first name from Google, falling
-- back to the full name, the email's local part, and finally "Admin".
-- ----------------------------------------------------------------------------
create or replace function member_display_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select left(coalesce(
    nullif(split_part(btrim(u.raw_user_meta_data->>'full_name'), ' ', 1), ''),
    nullif(split_part(btrim(u.raw_user_meta_data->>'name'), ' ', 1), ''),
    nullif(split_part(u.email::text, '@', 1), ''),
    'Admin'
  ), 40)
  from auth.users u
  where u.id = p_user_id;
$$;

revoke all on function member_display_name(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Every admin, past and future, gets their row.
-- ----------------------------------------------------------------------------
create or replace function create_member_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into staff_profiles (household_id, name, user_id)
  values (new.household_id, coalesce(member_display_name(new.user_id), 'Admin'), new.user_id)
  on conflict (household_id, user_id) do nothing;
  return new;
end;
$$;

revoke all on function create_member_profile() from public, anon, authenticated;

drop trigger if exists household_members_create_profile on household_members;
create trigger household_members_create_profile
  after insert on household_members
  for each row execute function create_member_profile();

insert into staff_profiles (household_id, name, user_id)
select m.household_id, coalesce(member_display_name(m.user_id), 'Admin'), m.user_id
  from household_members m
on conflict (household_id, user_id) do nothing;

-- ----------------------------------------------------------------------------
-- ensure_my_member_profile — the signed-in admin's own row, made if missing
-- ----------------------------------------------------------------------------
-- The app's way to learn which roster row is "me" when an admin opens Action
-- Mode. Creates the row as well, so an admin is never left without one: the
-- trigger covers every new membership, and this covers anything the trigger
-- could not (a membership restored by hand, say). Refuses anyone who is not
-- an admin of that household.
create or replace function ensure_my_member_profile(p_household_id uuid)
returns table (id uuid, name text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not exists (
    select 1 from household_members m
     where m.household_id = p_household_id and m.user_id = uid
  ) then
    raise exception 'not_a_household_member' using errcode = '42501';
  end if;

  insert into staff_profiles (household_id, name, user_id)
  values (p_household_id, coalesce(member_display_name(uid), 'Admin'), uid)
  on conflict (household_id, user_id) do nothing;

  return query
    select s.id, s.name from staff_profiles s
     where s.household_id = p_household_id and s.user_id = uid;
end;
$$;

revoke all on function ensure_my_member_profile(uuid) from public, anon;
grant execute on function ensure_my_member_profile(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- PINs are for the name-and-PIN roster only
-- ----------------------------------------------------------------------------
-- An admin's row is theirs by Google sign-in. Letting a PIN be set on it
-- would let anyone holding a household phone pick the admin's name at the
-- PIN screen and act as them. Same bodies as migrations/095, plus
-- `user_id is null`.
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
     and s.household_id = any (get_user_household_ids());

  if stored is null then
    return false;
  end if;

  return stored = extensions.crypt(p_pin, stored);
end;
$$;

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
     and s.user_id is null
     and s.household_id = any (get_user_household_ids());

  if target is null then
    raise exception 'staff_not_found' using errcode = '42501';
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
