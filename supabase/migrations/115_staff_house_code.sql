-- ============================================================================
-- 115 — Staff sign in with a house code and PIN (Phase 151)
-- ============================================================================
-- A staff phone that gets signed out (a cleaner app wiped the browser, the
-- WhatsApp link opened in another browser) used to need a new invite link
-- from an admin. Now staff can get back in themselves: house code → their
-- name → their PIN. Invite links keep working as before.
-- Plan and owner decisions (2026-11-07): docs/phase-150-plan.md.
--
-- THE PIECES
--   household_join_codes   one 6-character code per household (XXX-XXX, no
--                          look-alike characters). Its own table with no
--                          client grants, so only the functions below read it.
--   staff_sign_in_attempts every code and PIN try (who, which phone session,
--                          when, whether it worked). Kept 30 days, for the
--                          limits below and nothing else.
--   staff_profiles         + failed_pin_attempts, pin_locked_until.
--
-- LIMITS
--   * 5 wrong PINs for one person → that person is locked for 15 minutes and
--     the household's admins get a push. Applies to the house-code sign-in
--     and to the PIN check on phones that are already linked
--     (verify_staff_pin), which had no limit at all.
--   * 10 wrong codes from one phone session in an hour → that session waits.
--   * Only anonymous sessions (staff phones) may use a house code: a Google
--     account can never be turned into a staff device (handoff conflict 6).
--   * A phone is linked to the household only by the right code, name and
--     PIN together, in one statement. The right code alone shows the names
--     of people who sign in by PIN, nothing else.
--
-- ADMINS (household_members only — never get_user_household_ids(), which
-- staff phones pass): see and change the code; see and remove linked phones.
--
-- Additive: two tables, two columns, new functions, verify_staff_pin
-- replaced in place with the same signature.
-- ============================================================================

-- --- The code ----------------------------------------------------------------------

create table if not exists public.household_join_codes (
  household_id uuid primary key references public.households (id) on delete cascade,
  code text not null unique check (code ~ '^[A-HJKMNP-Z2-9]{6}$'),
  rotated_at timestamptz not null default now()
);

alter table public.household_join_codes enable row level security;
revoke all on public.household_join_codes from public, anon, authenticated;
grant select, insert, update, delete on public.household_join_codes to service_role;

-- 31 characters: A–Z without I, L, O, and 2–9. Six of them ≈ 887 million codes.
create or replace function public.new_house_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate
        || substr(alphabet, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 31), 1);
    end loop;
    exit when not exists (select 1 from public.household_join_codes c where c.code = candidate);
  end loop;
  return candidate;
end;
$$;

-- "k7m-2qx", "K7M 2QX", "k7m2qx" → "K7M2QX".
create or replace function public.normalize_house_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- Every household has one, existing and new.
do $$
declare
  h record;
begin
  for h in
    select hh.id from public.households hh
    where not exists (select 1 from public.household_join_codes c where c.household_id = hh.id)
  loop
    insert into public.household_join_codes (household_id, code)
    values (h.id, public.new_house_code());
  end loop;
end;
$$;

create or replace function public.give_household_join_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.household_join_codes (household_id, code)
  values (new.id, public.new_house_code())
  on conflict (household_id) do nothing;
  return new;
end;
$$;

drop trigger if exists households_give_join_code on public.households;
create trigger households_give_join_code
  after insert on public.households
  for each row execute function public.give_household_join_code();

-- --- Attempts and locks ----------------------------------------------------------------

create table if not exists public.staff_sign_in_attempts (
  id bigint generated always as identity primary key,
  -- The phone's session: anonymous for staff phones.
  user_id uuid references auth.users (id) on delete set null,
  household_id uuid references public.households (id) on delete cascade,
  staff_id uuid references public.staff_profiles (id) on delete set null,
  kind text not null check (kind in ('code', 'pin')),
  success boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists staff_sign_in_attempts_user_idx
  on public.staff_sign_in_attempts (user_id, created_at);
create index if not exists staff_sign_in_attempts_created_idx
  on public.staff_sign_in_attempts (created_at);

alter table public.staff_sign_in_attempts enable row level security;
revoke all on public.staff_sign_in_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.staff_sign_in_attempts to service_role;

-- staff_profiles has column-level grants (096); these two get none, so no
-- client reads or writes them.
alter table public.staff_profiles
  add column if not exists failed_pin_attempts integer not null default 0,
  add column if not exists pin_locked_until timestamptz;

-- The one PIN check everything goes through. Returns, never raises, so the
-- attempt it records survives:
--   {"status":"ok"} | {"status":"wrong_pin","attempts_left":n}
--   {"status":"locked","locked_until":t} | {"status":"no_pin"}
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

-- The caller's session, refused unless it is a staff phone's anonymous one.
create or replace function public.require_staff_phone_session()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  anonymous boolean;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select u.is_anonymous into anonymous from auth.users u where u.id = uid;
  if not coalesce(anonymous, false) then
    raise exception 'staff_phones_only' using errcode = '42501';
  end if;
  return uid;
end;
$$;

create or replace function public.house_code_attempts_exceeded(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) >= 10
    from public.staff_sign_in_attempts a
   where a.user_id = p_user_id
     and a.kind = 'code'
     and not a.success
     and a.created_at > now() - interval '1 hour';
$$;

-- --- Staff: sign in with the code ------------------------------------------------------

-- Step 1: the names to tap. Empty for a wrong code (recorded); raises
-- 'too_many_attempts' after 10 wrong codes in an hour.
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
     order by s.name;
end;
$$;

-- Step 2: name and PIN. On "ok" this phone is linked to the household
-- (device_sessions), exactly as redeeming an invite link does.
--   {"status":"ok","household_id":…} | "wrong_code" | "too_many_attempts"
--   | "wrong_pin" (+attempts_left) | "locked" (+locked_until) | "no_pin"
create or replace function public.sign_in_with_house_code(p_code text, p_staff_id uuid, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.require_staff_phone_session();
  household uuid;
  result jsonb;
begin
  if public.house_code_attempts_exceeded(uid) then
    return jsonb_build_object('status', 'too_many_attempts');
  end if;

  select c.household_id into household
    from public.household_join_codes c
   where c.code = public.normalize_house_code(p_code);

  if household is null then
    insert into public.staff_sign_in_attempts (user_id, kind, success)
    values (uid, 'code', false);
    return jsonb_build_object('status', 'wrong_code');
  end if;

  result := public.check_pin_internal(p_staff_id, p_pin, uid, household);
  if result->>'status' <> 'ok' then
    return result;
  end if;

  insert into public.device_sessions (user_id, household_id)
  values (uid, household)
  on conflict (user_id) do update
    set household_id = excluded.household_id, last_seen_at = now();

  return jsonb_build_object('status', 'ok', 'household_id', household);
end;
$$;

-- --- Staff: the PIN check on a phone that is already linked ----------------------------

-- What the staff gate calls: same answers as check_pin_internal.
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

-- 106's verify_staff_pin, same signature, now behind the same limit. Was
-- STABLE; it records attempts now, so it no longer is.
create or replace function public.verify_staff_pin(p_staff_id uuid, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.check_staff_pin(p_staff_id, p_pin)->>'status' = 'ok';
end;
$$;

-- --- Admins: the code and the linked phones --------------------------------------------

create or replace function public.require_household_admin(p_household_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.household_members m
     where m.household_id = p_household_id and m.user_id = uid
  ) then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  return uid;
end;
$$;

create or replace function public.my_house_code(p_household_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_household_admin(p_household_id);
  return (select c.code from public.household_join_codes c where c.household_id = p_household_id);
end;
$$;

-- A new code. Phones already linked stay linked; only new sign-ins need it.
create or replace function public.rotate_house_code(p_household_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  fresh text := public.new_house_code();
begin
  perform public.require_household_admin(p_household_id);
  insert into public.household_join_codes (household_id, code, rotated_at)
  values (p_household_id, fresh, now())
  on conflict (household_id) do update set code = excluded.code, rotated_at = excluded.rotated_at;
  return fresh;
end;
$$;

create or replace function public.list_linked_phones(p_household_id uuid)
returns table (id uuid, linked_at timestamptz, last_seen_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_household_admin(p_household_id);
  return query
    select d.id, d.created_at, d.last_seen_at
      from public.device_sessions d
     where d.household_id = p_household_id
     order by d.last_seen_at desc;
end;
$$;

-- Unlinks a staff phone: it loses the household on its next request, and
-- stops receiving the household's notifications.
create or replace function public.remove_linked_phone(p_household_id uuid, p_device_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  phone uuid;
begin
  perform public.require_household_admin(p_household_id);
  delete from public.device_sessions d
   where d.id = p_device_id and d.household_id = p_household_id
  returning d.user_id into phone;
  if phone is null then
    return false;
  end if;
  delete from public.push_subscriptions s
   where s.user_id = phone and s.household_id = p_household_id;
  return true;
end;
$$;

-- --- 30 days, then gone ----------------------------------------------------------------

create or replace function public.prune_staff_sign_in_attempts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.staff_sign_in_attempts where created_at < now() - interval '30 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('prune-staff-sign-in-attempts')
      where exists (select 1 from cron.job where jobname = 'prune-staff-sign-in-attempts');
    perform cron.schedule(
      'prune-staff-sign-in-attempts',
      '45 20 * * *',
      'select public.prune_staff_sign_in_attempts();'
    );
  else
    raise warning 'pg_cron is not installed: staff sign-in attempts will not be pruned';
  end if;
end;
$$;

-- --- Who may call what -----------------------------------------------------------------

-- Staff phones (anonymous, so `authenticated`) and admins.
revoke all on function public.house_code_roster(text) from public, anon;
revoke all on function public.sign_in_with_house_code(text, uuid, text) from public, anon;
revoke all on function public.check_staff_pin(uuid, text) from public, anon;
revoke all on function public.verify_staff_pin(uuid, text) from public, anon;
revoke all on function public.my_house_code(uuid) from public, anon;
revoke all on function public.rotate_house_code(uuid) from public, anon;
revoke all on function public.list_linked_phones(uuid) from public, anon;
revoke all on function public.remove_linked_phone(uuid, uuid) from public, anon;
grant execute on function public.house_code_roster(text) to authenticated, service_role;
grant execute on function public.sign_in_with_house_code(text, uuid, text) to authenticated, service_role;
grant execute on function public.check_staff_pin(uuid, text) to authenticated, service_role;
grant execute on function public.verify_staff_pin(uuid, text) to authenticated, service_role;
grant execute on function public.my_house_code(uuid) to authenticated, service_role;
grant execute on function public.rotate_house_code(uuid) to authenticated, service_role;
grant execute on function public.list_linked_phones(uuid) to authenticated, service_role;
grant execute on function public.remove_linked_phone(uuid, uuid) to authenticated, service_role;

-- Internal: only the functions above (and the trigger, which needs no grant).
revoke all on function public.new_house_code() from public, anon, authenticated;
revoke all on function public.normalize_house_code(text) from public, anon, authenticated;
revoke all on function public.give_household_join_code() from public, anon, authenticated;
revoke all on function public.check_pin_internal(uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.require_staff_phone_session() from public, anon, authenticated;
revoke all on function public.house_code_attempts_exceeded(uuid) from public, anon, authenticated;
revoke all on function public.require_household_admin(uuid) from public, anon, authenticated;
revoke all on function public.prune_staff_sign_in_attempts() from public, anon, authenticated;
grant execute on function public.new_house_code() to service_role;
grant execute on function public.normalize_house_code(text) to service_role;
grant execute on function public.check_pin_internal(uuid, text, uuid, uuid) to service_role;
grant execute on function public.require_staff_phone_session() to service_role;
grant execute on function public.house_code_attempts_exceeded(uuid) to service_role;
grant execute on function public.require_household_admin(uuid) to service_role;
grant execute on function public.prune_staff_sign_in_attempts() to service_role;
