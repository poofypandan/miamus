-- ============================================================================
-- 147 — Starter templates and staff in one go (Phase 172, PR A2)
-- ============================================================================
-- docs/phase-172-first-ten-minutes-plan.md, sections 2 and 4; owner decisions
-- (2026-11-10/11): A for D3–D7 and D10. The owner picks a kind of home,
-- unticks what doesn't apply, types staff names, and sends one WhatsApp
-- message; each person picks their name and makes a PIN.
--
-- Numbered 147: 145 is Phase 171 PR A (PR #87); 146 is the security fixes, which go live first (manager, 11 Nov).
--
-- NEW
--   apply_household_setup(household, draft)   the reviewed list in ONE call,
--        all or nothing: floors, rooms (with the rooms inside them), staff,
--        chores and bills. SECURITY INVOKER, so every insert still passes
--        the tables' own row-level security and triggers; it also refuses
--        anyone without a household_members row for that household (never
--        get_user_household_ids(), which staff phones pass; AGENTS.md).
--        Nothing is duplicated: a place with the same name under the same
--        parent is reused, a chore with the same title, place and repeat that
--        is still going is skipped, and a staff name already on the roster is
--        reused. Returns how many of each it added.
--   claim_staff_with_house_code(code, staff, pin, claim)   D10: a staff
--        phone with the house code AND the claim code from the owner's
--        WhatsApp link picks its name and makes a PIN, only for a person with
--        no PIN yet, not archived, added less than 7 days ago (110's "claim an
--        empty name, never take one", reachable from the house code and
--        narrowed to a week). Links the phone (device_sessions) as the
--        house-code sign-in does. Same limits as the house code (115), plus
--        at most 20 claims an hour per household.
--   staff_claim_links / staff_claim_link(household)   the claim code (audit
--        L5): ten random characters an owner's "one WhatsApp message" carries
--        beside the house code, good for 7 days. The house code alone (which
--        former staff may still know) can sign in with a PIN, never claim.
--   undo_staff_claim(household, staff)   owners only: "Not Sari? Undo" (audit
--        L5): clears the PIN that was made and removes the phone that made
--        it, so the name can be claimed again from the link.
--   staff_claims_today(household)   owners only: who claimed their name in
--        the last 24 hours and still has the PIN, for Today's quiet line
--        "Sari's phone is linked · Not Sari? Undo".
--
-- RE-CREATED
--   house_code_roster (117)       also returns `claimable`: no PIN yet and
--        added in the last 7 days.
--
-- CHANGED (additive)
--   staff_sign_in_attempts.kind   gains 'claim' (kept 30 days like every
--        attempt; the owner sees each claim and can undo it with "let them
--        choose again" (110) or remove the phone (115)).
--
-- No new kind of data: rooms, chores, staff names and the claim attempt are
-- covered by the privacy policy already (section 3, "Staff": sign-in
-- attempts and linked phones). Every function revokes EXECUTE from public
-- and anon, then grants only what's needed.
-- ============================================================================

-- --- 1. A claim is an attempt too ---------------------------------------------------
alter table public.staff_sign_in_attempts drop constraint if exists staff_sign_in_attempts_kind_check;
alter table public.staff_sign_in_attempts
  add constraint staff_sign_in_attempts_kind_check check (kind in ('code', 'pin', 'claim'));

-- --- 2. Apply the reviewed list ---------------------------------------------------------
-- p_draft (src/lib/setup-templates.ts, toApplyPayload):
--   { "v": 1,
--     "floors": [{ "key", "name" }],                       at most 8
--     "rooms":  [{ "key", "name", "parent": key | null }], at most 60; a parent
--               is a floor key or a room listed before it
--     "staff":  [{ "key", "name" }],                       at most 12
--     "chores": [{ "title", "place": key | null, "recurrence", "interval",
--                  "due_date", "category",
--                  "assignee": null | { "staff": key } | { "me": true } | { "profile": uuid },
--                  "remind": null | 0 | 1 | 3 | 7,
--                  "from_bills": true (optional: counted as a bill) }] }   at most 150
create or replace function public.apply_household_setup(p_household uuid, p_draft jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'Asia/Jakarta')::date;
  places jsonb := '{}'::jsonb;   -- draft key → location id
  people jsonb := '{}'::jsonb;   -- draft key → staff profile id
  item jsonb;
  k text;
  v_name text;
  v_parent uuid;
  v_kind text;
  v_id uuid;
  v_title text;
  v_place uuid;
  v_rec text;
  v_int int;
  v_due date;
  v_cat text;
  v_who uuid;
  v_remind int;
  n_rooms int := 0;
  n_chores int := 0;
  n_bills int := 0;
  n_staff int := 0;
  n_skipped int := 0;
begin
  if uid is null or not exists (
    select 1 from public.household_members m where m.user_id = uid and m.household_id = p_household
  ) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_draft is null or jsonb_typeof(p_draft) <> 'object' or p_draft ->> 'v' is distinct from '1' then
    raise exception 'invalid_draft' using errcode = '22023';
  end if;
  for k in select unnest(array['floors', 'rooms', 'staff', 'chores']) loop
    if jsonb_typeof(coalesce(p_draft -> k, '[]'::jsonb)) <> 'array' then
      raise exception 'invalid_draft: %', k using errcode = '22023';
    end if;
  end loop;
  if jsonb_array_length(coalesce(p_draft -> 'floors', '[]')) > 8
     or jsonb_array_length(coalesce(p_draft -> 'rooms', '[]')) > 60
     or jsonb_array_length(coalesce(p_draft -> 'staff', '[]')) > 12
     or jsonb_array_length(coalesce(p_draft -> 'chores', '[]')) > 150 then
    raise exception 'too_many' using errcode = '22023';
  end if;

  -- Floors: an existing top-level place with the same name is reused.
  for item in select * from jsonb_array_elements(coalesce(p_draft -> 'floors', '[]')) loop
    k := item ->> 'key';
    v_name := btrim(coalesce(item ->> 'name', ''));
    if k is null or length(k) > 30 or places ? k or char_length(v_name) not between 1 and 60 then
      raise exception 'invalid_floor' using errcode = '22023';
    end if;
    select l.id, l.kind into v_id, v_kind from public.household_locations l
     where l.household_id = p_household and l.parent_id is null and lower(btrim(l.name)) = lower(v_name);
    if v_id is null then
      insert into public.household_locations (household_id, name, kind)
      values (p_household, v_name, 'floor') returning id into v_id;
    elsif v_kind <> 'floor' then
      raise exception 'place_name_taken: %', v_name using errcode = '23505';
    end if;
    places := places || jsonb_build_object(k, v_id);
    v_id := null;
  end loop;

  -- Rooms, in order (a room inside another comes after it).
  for item in select * from jsonb_array_elements(coalesce(p_draft -> 'rooms', '[]')) loop
    k := item ->> 'key';
    v_name := btrim(coalesce(item ->> 'name', ''));
    if k is null or length(k) > 30 or places ? k or char_length(v_name) not between 1 and 60 then
      raise exception 'invalid_room' using errcode = '22023';
    end if;
    v_parent := null;
    if item ->> 'parent' is not null then
      if not places ? (item ->> 'parent') then
        raise exception 'invalid_room_parent' using errcode = '22023';
      end if;
      v_parent := (places ->> (item ->> 'parent'))::uuid;
    end if;
    select l.id, l.kind into v_id, v_kind from public.household_locations l
     where l.household_id = p_household and l.parent_id is not distinct from v_parent
       and lower(btrim(l.name)) = lower(v_name);
    if v_id is null then
      insert into public.household_locations (household_id, name, kind, parent_id)
      values (p_household, v_name, 'room', v_parent) returning id into v_id;
      n_rooms := n_rooms + 1;
    elsif v_kind <> 'room' then
      raise exception 'place_name_taken: %', v_name using errcode = '23505';
    end if;
    places := places || jsonb_build_object(k, v_id);
    v_id := null;
  end loop;

  -- Staff: a name already on the roster (not archived) is that person.
  for item in select * from jsonb_array_elements(coalesce(p_draft -> 'staff', '[]')) loop
    k := item ->> 'key';
    v_name := regexp_replace(btrim(coalesce(item ->> 'name', '')), '\s+', ' ', 'g');
    if k is null or length(k) > 30 or people ? k or char_length(v_name) not between 1 and 40
       or v_name ~ '[<>\r\n\t]' then
      raise exception 'invalid_staff' using errcode = '22023';
    end if;
    select s.id into v_id from public.staff_profiles s
     where s.household_id = p_household and s.user_id is null and s.archived_at is null
       and lower(s.name) = lower(v_name)
     order by s.created_at limit 1;
    if v_id is null then
      insert into public.staff_profiles (household_id, name) values (p_household, v_name) returning id into v_id;
      n_staff := n_staff + 1;
    end if;
    people := people || jsonb_build_object(k, v_id);
    v_id := null;
  end loop;

  -- Chores and bills.
  for item in select * from jsonb_array_elements(coalesce(p_draft -> 'chores', '[]')) loop
    v_title := btrim(coalesce(item ->> 'title', ''));
    v_rec := item ->> 'recurrence';
    v_cat := item ->> 'category';
    if char_length(v_title) not between 1 and 80
       or v_rec is null or v_rec not in ('none', 'daily', 'weekly', 'monthly')
       or v_cat is null or v_cat not in ('cleaning', 'maintenance', 'errand', 'groceries', 'bill')
       or coalesce(jsonb_typeof(item -> 'interval'), '') <> 'number'
       or coalesce(jsonb_typeof(item -> 'due_date'), '') <> 'string' then
      raise exception 'invalid_chore' using errcode = '22023';
    end if;
    v_int := (item ->> 'interval')::numeric::int;
    if v_int not between 1 and 12 or (item ->> 'interval')::numeric <> v_int then
      raise exception 'invalid_chore' using errcode = '22023';
    end if;
    begin
      v_due := (item ->> 'due_date')::date;
    exception when others then
      raise exception 'invalid_chore' using errcode = '22023';
    end;
    if v_due < today - 1 or v_due > today + 400 then
      raise exception 'invalid_chore' using errcode = '22023';
    end if;
    v_remind := null;
    if item -> 'remind' is not null and jsonb_typeof(item -> 'remind') <> 'null' then
      if jsonb_typeof(item -> 'remind') <> 'number' or (item ->> 'remind') not in ('0', '1', '3', '7') then
        raise exception 'invalid_chore' using errcode = '22023';
      end if;
      v_remind := (item ->> 'remind')::int;
    end if;
    v_place := null;
    if item ->> 'place' is not null then
      if not places ? (item ->> 'place') then
        raise exception 'invalid_chore_place' using errcode = '22023';
      end if;
      v_place := (places ->> (item ->> 'place'))::uuid;
    end if;
    v_who := null;
    if item -> 'assignee' is not null and jsonb_typeof(item -> 'assignee') <> 'null' then
      if item -> 'assignee' ? 'staff' and people ? (item -> 'assignee' ->> 'staff') then
        v_who := (people ->> (item -> 'assignee' ->> 'staff'))::uuid;
      elsif item -> 'assignee' ->> 'me' = 'true' then
        -- The caller's own roster entry, found here rather than trusted
        -- from a phone that may not have loaded it yet (Codex, PR #90): a
        -- bill "for you" never quietly becomes anyone's.
        select s.id into v_who from public.staff_profiles s
         where s.household_id = p_household and s.user_id = uid and s.archived_at is null
         order by s.created_at limit 1;
        if v_who is null then
          raise exception 'no_owner_profile' using errcode = '22023';
        end if;
      elsif item -> 'assignee' ? 'profile' then
        select s.id into v_who from public.staff_profiles s
         where s.id::text = item -> 'assignee' ->> 'profile'
           and s.household_id = p_household and s.archived_at is null;
        if v_who is null then
          raise exception 'invalid_assignee' using errcode = '22023';
        end if;
      else
        raise exception 'invalid_assignee' using errcode = '22023';
      end if;
    end if;

    -- The same chore, still going: skipped (D7).
    if exists (
      select 1 from public.household_tasks t
       where t.household_id = p_household
         and t.parent_task_id is null
         and t.status <> 'cancelled'
         and lower(regexp_replace(btrim(t.title), '\s+', ' ', 'g')) = lower(regexp_replace(v_title, '\s+', ' ', 'g'))
         and t.location_id is not distinct from v_place
         and t.recurrence = v_rec
         and t.recurrence_interval = v_int
         and (
           (t.recurrence <> 'none' and (t.recurrence_until is null or t.recurrence_until >= today))
           or (t.recurrence = 'none' and t.status <> 'completed' and t.due_date >= today)
         )
    ) then
      n_skipped := n_skipped + 1;
      continue;
    end if;

    insert into public.household_tasks
      (household_id, title, category, due_date, status, recurrence, recurrence_interval,
       location_id, assigned_to, remind_days_before)
    values
      (p_household, v_title, v_cat, v_due, 'pending', v_rec, v_int, v_place, v_who, v_remind);
    -- Bills and upkeep (from the Phase 164 list, or any bill) count as bills.
    if v_cat = 'bill' or (item ->> 'from_bills') = 'true' then n_bills := n_bills + 1; else n_chores := n_chores + 1; end if;
  end loop;

  return jsonb_build_object(
    'rooms_added', n_rooms, 'chores_added', n_chores, 'bills_added', n_bills,
    'staff_added', n_staff, 'skipped', n_skipped,
    'staff', people
  );
end;
$$;

revoke all on function public.apply_household_setup(uuid, jsonb) from public, anon;
grant execute on function public.apply_household_setup(uuid, jsonb) to authenticated;

-- --- 3. Staff in one go: pick your name, make a PIN ------------------------------------
-- The claim code (audit L5): what the owner's one WhatsApp message carries
-- beside the house code. Plain text like the house code itself, with no
-- client grants: only the functions below read it.
create table if not exists public.staff_claim_links (
  token text primary key check (token ~ '^[A-Z2-9]{10}$'),
  household_id uuid not null references public.households (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);
create index if not exists staff_claim_links_household_idx
  on public.staff_claim_links (household_id, created_at desc);
alter table public.staff_claim_links enable row level security;
revoke all on public.staff_claim_links from public, anon, authenticated;
grant select, insert, update, delete on public.staff_claim_links to service_role;

-- Owners only. The newest code if it was made in the last day (so the
-- Staff page and a second send carry the same link), otherwise a new one.
-- Each code works for 7 days; older ones are deleted here.
create or replace function public.staff_claim_link(p_household uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_token text;
begin
  if not exists (
    select 1 from public.household_members m where m.user_id = auth.uid() and m.household_id = p_household
  ) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  delete from public.staff_claim_links l
   where l.household_id = p_household and l.created_at < now() - interval '7 days';
  select l.token into v_token from public.staff_claim_links l
   where l.household_id = p_household and l.created_at > now() - interval '1 day'
   order by l.created_at desc limit 1;
  if v_token is not null then
    return v_token;
  end if;
  loop
    v_token := '';
    for i in 1..10 loop
      v_token := v_token || substr(alphabet, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 31), 1);
    end loop;
    exit when not exists (select 1 from public.staff_claim_links l where l.token = v_token);
  end loop;
  insert into public.staff_claim_links (token, household_id, created_by) values (v_token, p_household, auth.uid());
  return v_token;
end;
$$;

revoke all on function public.staff_claim_link(uuid) from public, anon;
grant execute on function public.staff_claim_link(uuid) to authenticated, service_role;

create or replace function public.claim_staff_with_house_code(
  p_code text, p_staff_id uuid, p_new_pin text, p_claim text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.require_staff_phone_session();
  household uuid;
  person public.staff_profiles;
begin
  perform public.lock_house_code_session(uid);
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

  -- At most 20 claims an hour per household, made or refused (audit L5).
  if (select count(*) from public.staff_sign_in_attempts a
       where a.household_id = household and a.kind = 'claim'
         and a.created_at > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('status', 'too_many_attempts');
  end if;

  -- The claim code from the owner's link (audit L5). A wrong one counts as a
  -- wrong code toward this phone's house-code limit.
  if p_claim is null or not exists (
    select 1 from public.staff_claim_links l
     where l.household_id = household
       and l.token = upper(btrim(p_claim))
       and l.created_at > now() - interval '7 days'
  ) then
    insert into public.staff_sign_in_attempts (user_id, household_id, kind, success)
    values (uid, household, 'code', false);
    return jsonb_build_object('status', 'no_claim_link');
  end if;

  if p_new_pin is null or p_new_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('status', 'bad_pin');
  end if;

  -- Only an empty name, inside the claim window; locked so two phones can't
  -- both claim it.
  select * into person
    from public.staff_profiles s
   where s.id = p_staff_id
     and s.household_id = household
     and s.user_id is null
     and s.archived_at is null
     and not s.has_pin
     and s.created_at > now() - interval '7 days'
     for update;
  if not found then
    insert into public.staff_sign_in_attempts (user_id, household_id, staff_id, kind, success)
    values (uid, household, case when exists (select 1 from public.staff_profiles s where s.id = p_staff_id and s.household_id = household) then p_staff_id end, 'claim', false);
    return jsonb_build_object('status', 'not_claimable');
  end if;

  update public.staff_profiles
     set pin = extensions.crypt(p_new_pin, extensions.gen_salt('bf')),
         has_pin = true,
         failed_pin_attempts = 0,
         pin_locked_until = null
   where id = person.id;

  insert into public.device_sessions (user_id, household_id)
  values (uid, household)
  on conflict (user_id) do update
    set household_id = excluded.household_id, last_seen_at = now();

  insert into public.staff_sign_in_attempts (user_id, household_id, staff_id, kind, success)
  values (uid, household, person.id, 'claim', true);

  return jsonb_build_object('status', 'ok', 'household_id', household);
end;
$$;

revoke all on function public.claim_staff_with_house_code(text, uuid, text, text) from public, anon;
grant execute on function public.claim_staff_with_house_code(text, uuid, text, text) to authenticated, service_role;

-- "Not Sari? Undo" (audit L5): owners only. Clears the PIN the claim made
-- and removes the phone that made it (as remove_linked_phone does, 115), so
-- the name can be claimed again from the link. The whole phone goes, even if
-- others sign in on it with their own PINs: when the owner says "not Sari",
-- the phone that claimed the name is the one in doubt. Only a name claimed in the
-- last 7 days; any other PIN is reset the usual way (110).
create or replace function public.undo_staff_claim(p_household uuid, p_staff_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  phone uuid;
begin
  if not exists (
    select 1 from public.household_members m where m.user_id = auth.uid() and m.household_id = p_household
  ) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  select a.user_id into phone
    from public.staff_sign_in_attempts a
    join public.staff_profiles s on s.id = a.staff_id and s.household_id = p_household
   where a.household_id = p_household and a.staff_id = p_staff_id
     and a.kind = 'claim' and a.success
     and a.created_at > now() - interval '7 days'
     and s.user_id is null and s.has_pin
   order by a.created_at desc
   limit 1;
  if phone is null then
    return false;
  end if;
  update public.staff_profiles
     set pin = null, has_pin = false, failed_pin_attempts = 0, pin_locked_until = null
   where id = p_staff_id and household_id = p_household;
  delete from public.device_sessions d where d.user_id = phone and d.household_id = p_household;
  delete from public.push_subscriptions ps where ps.user_id = phone and ps.household_id = p_household;
  return true;
end;
$$;

revoke all on function public.undo_staff_claim(uuid, uuid) from public, anon;
grant execute on function public.undo_staff_claim(uuid, uuid) to authenticated, service_role;

-- --- 3b. The roster says who can still claim ------------------------------------------
-- Re-created from 117 with one more column, so the join screen knows before
-- anyone types a PIN whether a name without one can be claimed (added in the
-- last 7 days) or needs an invite link (code review, PR #90). The return
-- type changes, so it is dropped and re-created with the same grants; old
-- app builds ignore the extra column.
drop function if exists public.house_code_roster(text);
create function public.house_code_roster(p_code text)
returns table (id uuid, name text, has_pin boolean, claimable boolean)
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
    select s.id, s.name, s.has_pin,
           (not s.has_pin and s.created_at > now() - interval '7 days') as claimable
      from public.staff_profiles s
     where s.household_id = household
       and s.user_id is null
       and s.archived_at is null
     order by s.name;
end;
$$;

revoke all on function public.house_code_roster(text) from public, anon;
grant execute on function public.house_code_roster(text) to authenticated, service_role;

-- --- 4. Who linked today, for the owner --------------------------------------------
create or replace function public.staff_claims_today(p_household uuid)
returns table (staff_id uuid, name text, claimed_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.household_members m where m.user_id = auth.uid() and m.household_id = p_household
  ) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return query
    select distinct on (a.staff_id) a.staff_id, s.name, a.created_at
      from public.staff_sign_in_attempts a
      join public.staff_profiles s on s.id = a.staff_id and s.household_id = p_household
     where a.household_id = p_household
       and a.kind = 'claim'
       and a.success
       and s.has_pin   -- an undone claim leaves the line
       -- The last 24 hours, not since midnight: a claim at 23.50 is still
       -- there to undo in the morning (code review, PR #90).
       and a.created_at > now() - interval '24 hours'
     order by a.staff_id, a.created_at desc;
end;
$$;

revoke all on function public.staff_claims_today(uuid) from public, anon;
grant execute on function public.staff_claims_today(uuid) to authenticated, service_role;
