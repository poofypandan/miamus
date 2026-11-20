-- 180 — Staff onboarding, step 4: who takes their work, bringing someone
-- back, and 12 months then "Former staff" (docs/private/staff-onboarding-plan.md,
-- sections 2c and 5; owner decisions 5 and 7, 20 Nov).
--
--   archive_staff_profile(staff, give_to)   one new optional argument: their
--        unfinished and repeating chores, and the pet routines made for them,
--        go to that person instead of Anyone. give_to must be someone else on
--        this household's staff list (not archived, not an owner's row). The
--        1-argument form is dropped and re-created with a default, so older
--        app builds calling it with p_staff_id alone still work. The owners'
--        push no longer asks them to share the new house code: phones already
--        signed in stay signed in, and the code is on Staff sign-in.
--   staff_profiles.claimable_from   nullable; set when someone is brought
--        back. The 7-day claim window (147) counts from it when it is set, so
--        the same welcome link works again after a rehire. Older rows read
--        null: the window counts from created_at, as before.
--   restore_staff_profile(staff)   also sets claimable_from, and refuses a
--        profile already replaced with "Former staff".
--   staff_profiles.forgotten_at   nullable; when the name was replaced.
--   forget_staff_profile(staff)   "Remove for good" (owners only): an archived
--        person's name becomes "Mantan staf" (the app shows "Former staff" to
--        English owners) and what is left on the row is cleared. Past work
--        stays, now unnamed. Their sign-in attempts lose the name, and their
--        notification choices go.
--   forget_former_staff()   the same, every night, for anyone archived 12
--        months ago or more (pg_cron, 03.30 WIB).
--
-- Guards (AGENTS.md): every SECURITY DEFINER function here revokes EXECUTE
-- from public and anon and grants only what is needed. The owner actions are
-- guarded by caller_admin_household(), never get_user_household_ids() (staff
-- phones hold the authenticated role too). forget_former_staff is for the
-- scheduler only: no client role may call it.
--
-- Privacy: claimable_from is the date someone was brought back, a new fact
-- about a named person; forgotten_at is when their name was removed. Both
-- are in the policy's Staff section, with the 12-month rule in section 7
-- (src/components/legal/privacy-policy.tsx, both languages; legal.ts).
--
-- Tests: supabase/tests/180_staff_give_to_rehire_retention.sql (local only).

-- --- 1. Columns ----------------------------------------------------------------------
alter table public.staff_profiles add column if not exists claimable_from timestamptz;
alter table public.staff_profiles add column if not exists forgotten_at timestamptz;
comment on column public.staff_profiles.claimable_from is
  'When an admin last brought this person back (180). The 7-day claim window counts from here when set, else from created_at.';
comment on column public.staff_profiles.forgotten_at is
  'When the name was replaced with "Mantan staf" (180): by Remove for good, or 12 months after they left.';
-- Readable like the other granted columns (096): the owner's list shows Send
-- welcome again after a rehire, and "Former staff" in the history. Written
-- only by the functions below.
grant select (claimable_from, forgotten_at) on public.staff_profiles to authenticated;

-- --- 2. Who takes their work ---------------------------------------------------------
-- archive_staff_profile, re-created from 147 (its newest definition) with the
-- changes above. Everything else is 147's.
drop function if exists public.archive_staff_profile(uuid);
create function public.archive_staff_profile(p_staff_id uuid, p_give_to uuid default null)
returns staff_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row staff_profiles;
  v_phones uuid[];
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_row from staff_profiles
  where id = p_staff_id and household_id = caller_admin_household();

  if not found then
    raise exception 'No such person in your household' using errcode = '42501';
  end if;

  -- An admin's roster row belongs to their Google account (migrations/106).
  -- Taking their access away is the Admins panel's job
  -- (remove_household_member).
  if v_row.user_id is not null then
    raise exception 'This person is an admin — remove their access under Admins instead'
      using errcode = 'raise_exception';
  end if;

  -- Who takes their work (staff onboarding, owner decision 7): someone else
  -- still on this household's staff list, or nobody (Anyone), as before.
  if p_give_to is not null and not exists (
    select 1 from staff_profiles g
     where g.id = p_give_to
       and g.household_id = v_row.household_id
       and g.id <> p_staff_id
       and g.user_id is null
       and g.archived_at is null
  ) then
    raise exception 'give_to_not_staff' using errcode = '22023';
  end if;

  update staff_profiles
     set archived_at = now(),
         pin = null,
         has_pin = false
   where id = p_staff_id
  returning * into v_row;

  -- Unfinished chores, and every repeating chore they hold (118), to the
  -- person given (180), or to Anyone. The staff push trigger (141) tells
  -- that person about any that are for today.
  update household_tasks
     set assigned_to = p_give_to,
         completed_by = case
           when status = 'completed' then coalesce(completed_by, assigned_to)
           else completed_by
         end
   where household_id = v_row.household_id
     and assigned_to = p_staff_id
     and (status = 'pending'
          or (status = 'completed' and recurrence in ('daily', 'weekly', 'monthly')));

  -- Pet routines made for them go to the same person, or back to anyone
  -- (Phase 173, migrations/144; 180):
  -- staff are archived, never deleted, so the column's on delete set null
  -- would never fire.
  update master_schedules ms
     set staff_id = p_give_to
   where ms.staff_id = p_staff_id;

  -- The phones they were last signed in on (119, layer 1), a successful
  -- claim counting as a sign-in (147: a phone that claimed the name and
  -- never used its PIN since leaves with the person; Codex, PR #90).
  with last_pin as (
    select distinct on (a.user_id) a.user_id, a.staff_id
      from staff_sign_in_attempts a
     where a.household_id = v_row.household_id
       and a.kind in ('pin', 'claim')
       and a.success
       and a.user_id is not null
     order by a.user_id, a.created_at desc, a.id desc
  )
  select coalesce(array_agg(l.user_id), '{}') into v_phones
    from last_pin l
   where l.staff_id = p_staff_id;

  -- And the phones they last opened, by the link's own record (146).
  v_phones := v_phones || coalesce((
    select array_agg(d.user_id) from device_sessions d
     where d.household_id = v_row.household_id and d.staff_id = p_staff_id
  ), '{}');

  delete from device_sessions d
   where d.household_id = v_row.household_id
     and d.user_id = any (v_phones);
  delete from push_subscriptions s
   where s.household_id = v_row.household_id
     and s.user_id = any (v_phones);

  -- A new house code (pre-launch audit M1): the old one leaves with them.
  -- Phones still linked stay linked.
  insert into household_join_codes (household_id, code, rotated_at)
  values (v_row.household_id, public.new_house_code(), now())
  on conflict (household_id) do update set code = excluded.code, rotated_at = excluded.rotated_at;

  begin
    perform public.queue_owner_push(
      v_row.household_id,
      'Staff removed',
      v_row.name || ' was removed. Other staff phones stay signed in. The new house code is under Settings, Staff sign-in.',
      'Staf dihapus',
      v_row.name || ' sudah dihapus. HP staf lain tetap masuk. Kode rumah baru ada di Pengaturan, Masuk staf.',
      '/dashboard?module=access&page=sign-in',
      'house-code-' || v_row.household_id::text,
      auth.uid()
    );
  exception when others then
    raise warning 'House-code push not queued for household %: %', v_row.household_id, sqlerrm;
  end;

  return v_row;
end;
$$;

revoke all on function public.archive_staff_profile(uuid, uuid) from public, anon;
grant execute on function public.archive_staff_profile(uuid, uuid) to authenticated;

-- --- 3. Bringing someone back reopens the welcome link -------------------------------
-- restore_staff_profile, re-created from 109. The PIN stays cleared, as
-- before: they make a new one from the welcome link, now inside a fresh
-- 7-day window.
create or replace function public.restore_staff_profile(p_staff_id uuid)
returns staff_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row staff_profiles;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  update staff_profiles
     set archived_at = null,
         claimable_from = now()
   where id = p_staff_id
     and household_id = caller_admin_household()
     and forgotten_at is null
  returning * into v_row;

  if not found then
    raise exception 'No such person in your household' using errcode = '42501';
  end if;

  return v_row;
end;
$$;

revoke all on function public.restore_staff_profile(uuid) from public, anon;
grant execute on function public.restore_staff_profile(uuid) to authenticated;

-- --- 4. The claim window counts from a rehire ----------------------------------------
-- claim_staff_with_house_code and house_code_roster, re-created from 147 with
-- one change each: coalesce(claimable_from, created_at) in place of
-- created_at. Same return types, so no drop.
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

  -- At most 20 claims an hour per household, made or refused (audit L5),
  -- and at most 10 refused claims an hour from one phone: claims count
  -- their own failures (146's caps count 'pin' and 'code' only).
  if (select count(*) from public.staff_sign_in_attempts a
       where a.household_id = household and a.kind = 'claim'
         and a.created_at > now() - interval '1 hour') >= 20
     or (select count(*) from public.staff_sign_in_attempts a
          where a.user_id = uid and a.kind = 'claim' and not a.success
            and a.created_at > now() - interval '1 hour') >= 10 then
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
     -- From when they were added, or brought back (180).
     and coalesce(s.claimable_from, s.created_at) > now() - interval '7 days'
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
         pin_locked_until = null,
         pin_lock_level = 0,
         pin_locked_at = null
   where id = person.id;

  -- Linked as 146's sign_in_with_house_code links: with the person.
  insert into public.device_sessions (user_id, household_id, staff_id)
  values (uid, household, person.id)
  on conflict (user_id) do update
    set household_id = excluded.household_id,
        staff_id = excluded.staff_id,
        last_seen_at = now();

  insert into public.staff_sign_in_attempts (user_id, household_id, staff_id, kind, success)
  values (uid, household, person.id, 'claim', true);

  return jsonb_build_object('status', 'ok', 'household_id', household);
end;
$$;

revoke all on function public.claim_staff_with_house_code(text, uuid, text, text) from public, anon;
grant execute on function public.claim_staff_with_house_code(text, uuid, text, text) to authenticated, service_role;
create or replace function public.house_code_roster(p_code text)
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
           (not s.has_pin and coalesce(s.claimable_from, s.created_at) > now() - interval '7 days') as claimable
      from public.staff_profiles s
     where s.household_id = household
       and s.user_id is null
       and s.archived_at is null
     order by s.name;
end;
$$;

revoke all on function public.house_code_roster(text) from public, anon;
grant execute on function public.house_code_roster(text) to authenticated, service_role;

-- --- 5. 12 months, then "Former staff" -----------------------------------------------
-- The row stays, so past work still points at it, now unnamed.
create or replace function public.forget_staff_row(p_staff_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.staff_profiles
     set name = 'Mantan staf',
         forgotten_at = now(),
         pin = null,
         has_pin = false,
         hidden_areas = '{}',
         claimable_from = null,
         failed_pin_attempts = 0,
         pin_locked_until = null,
         pin_lock_level = 0,
         pin_locked_at = null
   where id = p_staff_id
     and archived_at is not null
     and forgotten_at is null;
  if not found then
    return;
  end if;
  update public.staff_sign_in_attempts set staff_id = null where staff_id = p_staff_id;
  update public.device_sessions set staff_id = null where staff_id = p_staff_id;
  delete from public.staff_push_people where staff_id = p_staff_id;
end;
$$;

-- Internal: only the two functions below call it.
revoke all on function public.forget_staff_row(uuid) from public, anon, authenticated;

-- "Remove for good" (owners only), on the No longer here list.
create or replace function public.forget_staff_profile(p_staff_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (
    select 1 from staff_profiles s
     where s.id = p_staff_id
       and s.household_id = caller_admin_household()
       and s.user_id is null
       and s.archived_at is not null
  ) then
    raise exception 'No such former staff member in your household' using errcode = '42501';
  end if;
  perform public.forget_staff_row(p_staff_id);
end;
$$;

revoke all on function public.forget_staff_profile(uuid) from public, anon;
grant execute on function public.forget_staff_profile(uuid) to authenticated;

-- Every night: anyone archived 12 months ago or more.
create or replace function public.forget_former_staff()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  person record;
  n integer := 0;
begin
  for person in
    select s.id from public.staff_profiles s
     where s.archived_at < now() - interval '12 months'
       and s.forgotten_at is null
       and s.user_id is null
  loop
    perform public.forget_staff_row(person.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- The scheduler only (cron runs as postgres).
revoke all on function public.forget_former_staff() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('forget-former-staff')
      where exists (select 1 from cron.job where jobname = 'forget-former-staff');
    perform cron.schedule(
      'forget-former-staff',
      '30 20 * * *',
      'select public.forget_former_staff();'
    );
  else
    raise warning 'pg_cron is not installed: former staff will not be forgotten after 12 months';
  end if;
end;
$$;
