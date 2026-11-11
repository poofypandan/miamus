-- ============================================================================
-- 146 — Pre-launch hardening (audit of 11 Nov 2026: H1, L1, M1, M2, M6, M7)
-- ============================================================================
-- Staff phones sign in anonymously and hold the `authenticated` role, and
-- get_user_household_ids() includes them, so every policy guarded only by it
-- let a staff phone make owner-only changes straight through the API. The
-- newer tables already have admin-only policies or a guard trigger (128's
-- pattern); this closes the oldest ones, keeping exactly what the staff
-- screens write.
--
-- H1. WHAT STAFF PHONES STILL WRITE (from src/components/staff, the
--     household context, the data provider and the offline queue)
--   task_entities      update `status` only, to 'admitted' (vet admission,
--                      agenda-group-card) or 'home' (DischargeButton on the
--                      staff page). Guard trigger: nothing else may change.
--   task_logs          insert (unchanged). Delete only a log this phone saved
--                      (created_by, new), within 5 minutes of reaching the
--                      server (received_at, 144) — the app's undo. A
--                      three-photo walk's steps stay deletable until its end
--                      photo is 5 minutes old ("Batalkan jalan-jalan"), as
--                      the app allows, for one day at most.
--   routine_proposals  insert as 'pending' (unchanged otherwise) and the
--                      5-minute withdraw (unchanged). Deciding is admin-only.
--   leave_requests     end_leave_early: an admin, or the person on leave
--                      themself — the person whose PIN last opened this phone
--                      (device_sessions.staff_id, new).
--   storage            household-logs: a phone may delete only a file it
--                      uploaded in the last day (every staff delete is an
--                      undo or a clean-up of its own upload, see below);
--                      admins delete any file of their household.
--   Admin-only from now on: task_entities insert and delete (a pet delete
--   cascades to its whole history), staff_profiles insert and update,
--   medical_records insert, routine_proposals update. "Admin" is a
--   household_members row for that household (is_household_admin), never
--   get_user_household_ids().
--
-- L1. Leftover grants revoked: anon on the older tables and the sequence,
--     TRUNCATE / REFERENCES / TRIGGER from authenticated, anon and PUBLIC
--     EXECUTE on the six non-definer helpers (authenticated keeps it; RLS
--     and checks call them). Default privileges stop handing these out to
--     tables and functions created later.
--
-- M1. House code and PIN guessing.
--   * Archiving a person gives the household a new house code, and pushes
--     the other admins (the one archiving sees the new code in the app).
--   * Lockouts grow: 5 wrong PINs lock for 15 minutes; the next 5 within a
--     day lock for 1 hour; the next 5 lock until an admin sets or resets the
--     PIN (set_staff_pin's admin path clears every lock). Admins are pushed
--     each time.
--   * Wrong PINs are also counted per phone session (10 an hour) and per
--     household (15 an hour); past either, PIN tries answer
--     'too_many_attempts' and are not checked.
--   * The global cap of 200 wrong house codes an hour is gone: one person
--     could use it to block house-code sign-in for every household. A wrong
--     code can't be tied to a household, so the per-household cap sits on
--     the PIN step; the per-session limit of 10 wrong codes stays.
--
-- M2. An owner invite is refused, with its own error, when the Google
--     account already belongs to a different household.
--
-- M6. When an account's last household goes (the household is deleted, or
--     an admin is removed), the account is deleted 30 days later, unless it
--     joins or asks to set up a household in the meantime. Its roster rows
--     are archived first, so a name can't become claimable by PIN.
--
-- M7. A linked staff phone not seen for 60 days is unlinked nightly. "Seen"
--     is the latest of its last sign-in or PIN, and its last token refresh
--     (auth.sessions), which an open app does every hour; the job writes that
--     back to last_seen_at so the admins' list shows it.
--
-- RE-CREATED (each from its newest definition)
--   check_pin_internal (132), house_code_attempts_exceeded (115),
--   sign_in_with_house_code (115), set_staff_pin (110), end_leave_early
--   (108), archive_staff_profile (144), use_owner_invite_token (093),
--   stamp_task_log_received_at (144).
--
-- NEW: is_household_admin, task_entities_staff_guard, task_log_undo_open,
--   unlink_idle_phones, account_deletions (+ three trigger functions),
--   delete_orphaned_accounts; columns task_logs.created_by,
--   device_sessions.staff_id, staff_profiles.pin_lock_level / pin_locked_at.
--   Every new or re-created SECURITY DEFINER function revokes EXECUTE from
--   public and anon and grants it only to the roles that need it.
--
-- Privacy policy and legal.ts change in the same PR (60-day unlinking,
-- 30-day account deletion, growing PIN lockouts, which phone saved a record
-- and whose PIN last opened a phone). No new service.
-- ============================================================================

-- --- 0. Who is an admin of a household ------------------------------------------------
-- A household_members row, never a device session. Takes the household
-- explicitly, so an account in two households (M2) is checked against the
-- right one.
create or replace function public.is_household_admin(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
     where m.household_id = p_household_id
       and m.user_id = auth.uid()
  );
$$;

revoke all on function public.is_household_admin(uuid) from public, anon;
grant execute on function public.is_household_admin(uuid) to authenticated, service_role;

-- --- 1. task_entities: pets and other entities ---------------------------------------
drop policy if exists "tenant_insert_task_entities" on public.task_entities;
drop policy if exists "tenant_delete_task_entities" on public.task_entities;
drop policy if exists "admin_insert_task_entities" on public.task_entities;
drop policy if exists "admin_delete_task_entities" on public.task_entities;

create policy "admin_insert_task_entities" on public.task_entities
  for insert to authenticated
  with check (public.is_household_admin(household_id));

create policy "admin_delete_task_entities" on public.task_entities
  for delete to authenticated
  using (public.is_household_admin(household_id));

-- Update stays open to the household (tenant_update_task_entities, 090):
-- staff record a vet admission and a discharge. The guard keeps them to that.
create or replace function public.task_entities_staff_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Server jobs and definer functions acting for no one.
  if auth.uid() is null then
    return new;
  end if;
  if public.is_household_admin(old.household_id) then
    return new;
  end if;
  if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status')
     or new.status is null
     or new.status not in ('home', 'admitted')
  then
    raise exception 'pet_owner_only' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.task_entities_staff_guard() from public, anon, authenticated;
grant execute on function public.task_entities_staff_guard() to service_role;

drop trigger if exists task_entities_staff_guard on public.task_entities;
create trigger task_entities_staff_guard
  before update on public.task_entities
  for each row execute function public.task_entities_staff_guard();

-- --- 2. task_logs: which phone saved it, and the undo window ----------------------------
-- Added with no default, so the rows already there stay null: no phone can
-- delete a log it can't be shown to have saved.
alter table public.task_logs
  add column if not exists created_by uuid references auth.users (id) on delete set null;
-- For the nightly prune of unlinked phones' sessions (on delete set null).
create index if not exists task_logs_created_by_idx on public.task_logs (created_by);
comment on column public.task_logs.created_by is
  'Pre-launch audit H1: the session (a staff phone, or an admin) that saved the log, set by trigger. Only that phone may undo it, within the window in task_log_undo_open.';

-- 144's stamp, now also noting who saved it. Whatever the phone sends.
create or replace function public.stamp_task_log_received_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.received_at := now();
  new.created_by := auth.uid();
  return new;
end;
$$;
revoke all on function public.stamp_task_log_received_at() from public, anon, authenticated;

-- May a phone still take back this log? 5 minutes from reaching the server;
-- a three-photo walk's steps until the walk's end photo is 5 minutes old
-- (an unfinished walk can be cancelled), one day at most.
create or replace function public.task_log_undo_open(
  p_schedule_id uuid,
  p_entity_id uuid,
  p_sub_type text,
  p_received_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_received_at is not null and (
    p_received_at > now() - interval '5 minutes'
    or (
      p_sub_type in ('check_in', 'arrived', 'check_out')
      and p_received_at > now() - interval '1 day'
      and exists (
        select 1 from public.master_schedules s
         where s.id = p_schedule_id and s.proof = 'three'
      )
      and not exists (
        select 1 from public.task_logs e
         where e.schedule_id = p_schedule_id
           and e.entity_id = p_entity_id
           and e.sub_type = 'check_out'
           and e.received_at >= p_received_at
           and e.received_at <= now() - interval '5 minutes'
      )
    )
  );
$$;

revoke all on function public.task_log_undo_open(uuid, uuid, text, timestamptz) from public, anon;
grant execute on function public.task_log_undo_open(uuid, uuid, text, timestamptz) to authenticated, service_role;

drop policy if exists "tenant_delete_task_logs" on public.task_logs;
drop policy if exists "admin_delete_task_logs" on public.task_logs;
drop policy if exists "phone_undo_task_logs" on public.task_logs;

create policy "admin_delete_task_logs" on public.task_logs
  for delete to authenticated
  using (exists (
    select 1 from public.task_entities e
     where e.id = task_logs.entity_id
       and public.is_household_admin(e.household_id)));

create policy "phone_undo_task_logs" on public.task_logs
  for delete to authenticated
  using (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.task_entities e
       where e.id = task_logs.entity_id
         and e.household_id = any (public.get_user_household_ids()))
    and public.task_log_undo_open(schedule_id, entity_id, sub_type, received_at)
  );

-- --- 3. routine_proposals: suggestions are decided by admins -------------------------
drop policy if exists "tenant_update_routine_proposals" on public.routine_proposals;
drop policy if exists "admin_update_routine_proposals" on public.routine_proposals;
create policy "admin_update_routine_proposals" on public.routine_proposals
  for update to authenticated
  using (exists (
    select 1 from public.task_entities e
     where e.id = routine_proposals.pet_id
       and public.is_household_admin(e.household_id)))
  with check (exists (
    select 1 from public.task_entities e
     where e.id = routine_proposals.pet_id
       and public.is_household_admin(e.household_id)));

-- Staff file suggestions as pending; only an admin's row may start decided.
drop policy if exists "tenant_insert_routine_proposals" on public.routine_proposals;
create policy "tenant_insert_routine_proposals" on public.routine_proposals
  for insert to authenticated
  with check (exists (
    select 1 from public.task_entities e
     where e.id = routine_proposals.pet_id
       and e.household_id = any (public.get_user_household_ids())
       and (routine_proposals.status = 'pending' or public.is_household_admin(e.household_id))));

-- --- 4. staff_profiles: the roster is the admins' ------------------------------------
-- PINs, archiving and the admin's own row go through definer functions
-- (set_staff_pin, archive_staff_profile, ensure_my_member_profile), which
-- these policies don't affect.
drop policy if exists "tenant_insert_staff_profiles" on public.staff_profiles;
drop policy if exists "tenant_update_staff_profiles" on public.staff_profiles;
drop policy if exists "admin_insert_staff_profiles" on public.staff_profiles;
drop policy if exists "admin_update_staff_profiles" on public.staff_profiles;

create policy "admin_insert_staff_profiles" on public.staff_profiles
  for insert to authenticated
  with check (public.is_household_admin(household_id));

create policy "admin_update_staff_profiles" on public.staff_profiles
  for update to authenticated
  using (public.is_household_admin(household_id))
  with check (public.is_household_admin(household_id));

-- --- 5. medical_records: health records are added by admins --------------------------
drop policy if exists "tenant_insert_medical_records" on public.medical_records;
drop policy if exists "admin_insert_medical_records" on public.medical_records;
create policy "admin_insert_medical_records" on public.medical_records
  for insert to authenticated
  with check (exists (
    select 1 from public.task_entities e
     where e.id = medical_records.entity_id
       and public.is_household_admin(e.household_id)));

-- --- 6. Whose PIN last opened this phone ----------------------------------------------
-- Kept on the phone's link to the household, so "my own leave" survives the
-- 30-day pruning of sign-in attempts. Set by every PIN that works on the
-- phone, and by a person choosing their first PIN on it.
alter table public.device_sessions
  add column if not exists staff_id uuid references public.staff_profiles (id) on delete set null;
create index if not exists device_sessions_staff_id_idx on public.device_sessions (staff_id);
comment on column public.device_sessions.staff_id is
  'Pre-launch audit H1: the person whose PIN last opened this phone (check_pin_internal, set_staff_pin). Kept while the phone is linked.';

-- From the sign-in attempts still kept (30 days).
with last_pin as (
  select distinct on (a.user_id) a.user_id, a.household_id, a.staff_id
    from public.staff_sign_in_attempts a
   where a.kind = 'pin' and a.success and a.user_id is not null and a.staff_id is not null
   order by a.user_id, a.created_at desc, a.id desc
)
update public.device_sessions d
   set staff_id = l.staff_id
  from last_pin l
 where d.user_id = l.user_id
   and d.household_id = l.household_id
   and d.staff_id is null;

-- --- 7. end_leave_early: an admin, or the person on leave ----------------------------
create or replace function end_leave_early(p_id uuid, p_today date)
returns leave_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target leave_requests;
  phone_person uuid;
  updated leave_requests;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into target
    from leave_requests
   where id = p_id
     and status = 'approved'
     and household_id = any (get_user_household_ids());
  if not found then
    raise exception 'leave_not_active' using errcode = '22023';
  end if;

  if not public.is_household_admin(target.household_id) then
    select d.staff_id into phone_person
      from device_sessions d
     where d.user_id = auth.uid() and d.household_id = target.household_id;
    -- A phone whose PIN was last used before this was recorded (staff_id
    -- still null) keeps the old behaviour until its next PIN; any phone that
    -- signs in with the house code has it set at once.
    if phone_person is not null and phone_person <> target.staff_id then
      raise exception 'not_your_leave' using errcode = '42501';
    end if;
  end if;

  update leave_requests
     set status = 'ended_early',
         ended_on = greatest(start_date, least(p_today, end_date + 1))
   where id = target.id
     and status = 'approved'
  returning * into updated;

  if updated.id is null then
    raise exception 'leave_not_active' using errcode = '22023';
  end if;
  return updated;
end;
$$;

revoke all on function end_leave_early(uuid, date) from public, anon;
grant execute on function end_leave_early(uuid, date) to authenticated;

-- --- 8. Storage: deleting photos ------------------------------------------------------
-- Every staff delete is the phone's own recent upload: an undone log, a
-- withdrawn "couldn't do", a food or repair photo it just took, a chore
-- photo that didn't make it. Anything older is the nightly clean-up's or an
-- admin's. The founding household's old files without a folder stay
-- reachable by its admins only (L2, unchanged otherwise).
drop policy if exists "tenant_delete_household_logs" on storage.objects;
drop policy if exists "admin_delete_household_logs" on storage.objects;
drop policy if exists "phone_delete_own_recent_household_logs" on storage.objects;

create policy "admin_delete_household_logs" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'household-logs'
    and (
      public.is_household_admin(public.storage_object_household(name))
      or (public.storage_object_household(name) is null
          and public.is_household_admin('975f0914-4d0d-43ad-8dee-a967d9bd10cd'::uuid))
    )
  );

create policy "phone_delete_own_recent_household_logs" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'household-logs'
    and public.storage_object_household(name) = any (public.get_user_household_ids())
    and coalesce(owner_id, owner::text) = (select auth.uid())::text
    and created_at > now() - interval '1 day'
  );

-- --- 9. L1: leftover grants -----------------------------------------------------------
do $$
declare
  t record;
begin
  for t in
    select c.relname
      from pg_class c
     where c.relnamespace = 'public'::regnamespace
       and c.relkind in ('r', 'p', 'v', 'm')
  loop
    execute format('revoke all on public.%I from anon', t.relname);
    execute format('revoke truncate, references, trigger on public.%I from authenticated', t.relname);
  end loop;
  for t in
    select c.relname
      from pg_class c
     where c.relnamespace = 'public'::regnamespace
       and c.relkind = 'S'
  loop
    execute format('revoke all on sequence public.%I from anon', t.relname);
  end loop;
end;
$$;
-- Written only by definer functions.
revoke all on sequence public.staff_sign_in_attempts_id_seq from authenticated;

-- Non-definer helpers: RLS, checks and the app call them as authenticated.
revoke all on function public.adjust_inventory_quantity(uuid, numeric) from public, anon;
grant execute on function public.adjust_inventory_quantity(uuid, numeric) to authenticated, service_role;
revoke all on function public.staff_workload(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.staff_workload(uuid, timestamptz, timestamptz) to authenticated, service_role;
revoke all on function public.storage_object_household(text) from public, anon;
grant execute on function public.storage_object_household(text) to authenticated, service_role;
revoke all on function public.photo_object_ref(text) from public, anon;
grant execute on function public.photo_object_ref(text) to authenticated, service_role;
revoke all on function public.task_photo_retention_cutoff() from public, anon;
grant execute on function public.task_photo_retention_cutoff() to authenticated, service_role;
revoke all on function public.is_push_endpoint(text) from public, anon;
grant execute on function public.is_push_endpoint(text) to authenticated, service_role;

-- What migrations create from here on (as postgres). authenticated keeps
-- its default table and function grants; each migration still states its own.
-- PUBLIC's EXECUTE on new functions can only be revoked for every schema at
-- once (it would also strip temporary helpers and other schemas), so it is
-- left to each migration's own revoke, as AGENTS.md requires.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from authenticated;

-- --- 10. M1: growing PIN lockouts, per-session and per-household caps -----------------
-- No client grants (staff_profiles has column grants, 096): only the
-- functions below read or write them.
alter table public.staff_profiles
  add column if not exists pin_lock_level smallint not null default 0,
  add column if not exists pin_locked_at timestamptz;

-- The one PIN check everything goes through (132's, plus the lock levels and
-- the caps). Returns, never raises, so the attempt it records survives:
--   {"status":"ok"} | {"status":"wrong_pin","attempts_left":n}
--   {"status":"locked","locked_until":t}            (15 minutes or 1 hour)
--   {"status":"locked","locked_until":null,"until_reset":true}
--   {"status":"too_many_attempts"}                  (session or household cap)
--   {"status":"no_pin"}
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
  level smallint;
  until timestamptz;
begin
  select s.name, s.pin, s.failed_pin_attempts, s.pin_locked_until, s.pin_lock_level, s.pin_locked_at
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

  -- Locked: nothing is checked, so nothing is recorded. 115 recorded these,
  -- but since 146 every recorded wrong PIN counts toward the caps below, and
  -- a locked person tapping on would pause PINs for the whole household.
  if person.pin_locked_until is not null and person.pin_locked_until > now() then
    if person.pin_locked_until = 'infinity'::timestamptz then
      return jsonb_build_object('status', 'locked', 'locked_until', null, 'until_reset', true);
    end if;
    return jsonb_build_object('status', 'locked', 'locked_until', person.pin_locked_until);
  end if;

  -- Caps across people: 10 wrong PINs an hour from one phone session, 15
  -- across the household. Past them nothing is checked or recorded, so the
  -- window ends an hour after the last real try.
  if (select count(*) >= 10
        from public.staff_sign_in_attempts a
       where a.user_id = p_user_id and a.kind = 'pin' and not a.success
         and a.created_at > now() - interval '1 hour')
     or (select count(*) >= 15
           from public.staff_sign_in_attempts a
          where a.household_id = p_household_id and a.kind = 'pin' and not a.success
            and a.created_at > now() - interval '1 hour')
  then
    return jsonb_build_object('status', 'too_many_attempts');
  end if;

  if p_pin is not null and person.pin = extensions.crypt(p_pin, person.pin) then
    update public.staff_profiles
       set failed_pin_attempts = 0, pin_locked_until = null
     where id = p_staff_id;
    insert into public.staff_sign_in_attempts (user_id, household_id, staff_id, kind, success)
    values (p_user_id, p_household_id, p_staff_id, 'pin', true);
    -- Whose PIN last opened this phone (end_leave_early).
    update public.device_sessions
       set staff_id = p_staff_id
     where user_id = p_user_id and household_id = p_household_id;
    return jsonb_build_object('status', 'ok');
  end if;

  attempts := person.failed_pin_attempts + 1;
  insert into public.staff_sign_in_attempts (user_id, household_id, staff_id, kind, success)
  values (p_user_id, p_household_id, p_staff_id, 'pin', false);

  if attempts >= 5 then
    -- A lock within a day of the last one goes up a level; after a quiet
    -- day it starts again at 15 minutes.
    level := case
      when person.pin_locked_at is null or person.pin_locked_at < now() - interval '1 day' then 1
      else least(person.pin_lock_level + 1, 3)
    end;
    until := case level
      when 1 then now() + interval '15 minutes'
      when 2 then now() + interval '1 hour'
      else 'infinity'::timestamptz
    end;
    update public.staff_profiles
       set failed_pin_attempts = 0,
           pin_locked_until = until,
           pin_lock_level = level,
           pin_locked_at = now()
     where id = p_staff_id;
    -- Best-effort: a push that can't be queued must not undo the lock.
    begin
      if level = 1 then
        perform public.queue_owner_push(
          p_household_id,
          'PIN locked',
          person.name || '''s PIN was locked after 5 wrong tries. It can be tried again in 15 minutes.',
          'PIN terkunci',
          'PIN ' || person.name || ' terkunci setelah 5 kali salah. Bisa dicoba lagi dalam 15 menit.',
          '/dashboard?module=access',
          'pin-lock-' || p_staff_id::text,
          null
        );
      elsif level = 2 then
        perform public.queue_owner_push(
          p_household_id,
          'PIN locked again',
          person.name || '''s PIN was locked again after 5 more wrong tries. It can be tried again in 1 hour.',
          'PIN terkunci lagi',
          'PIN ' || person.name || ' terkunci lagi setelah 5 kali salah. Bisa dicoba lagi dalam 1 jam.',
          '/dashboard?module=access',
          'pin-lock-' || p_staff_id::text,
          null
        );
      else
        perform public.queue_owner_push(
          p_household_id,
          'PIN locked until you reset it',
          person.name || '''s PIN was locked after more wrong tries. Set a new PIN for them under Household, Staff.',
          'PIN terkunci sampai diatur ulang',
          'PIN ' || person.name || ' terkunci setelah salah lagi. Buat PIN baru untuknya di Rumah, Staf.',
          '/dashboard?module=access',
          'pin-lock-' || p_staff_id::text,
          null
        );
      end if;
    exception when others then
      raise warning 'PIN-lock push not queued for staff %: %', p_staff_id, sqlerrm;
    end;
    if level = 3 then
      return jsonb_build_object('status', 'locked', 'locked_until', null, 'until_reset', true);
    end if;
    return jsonb_build_object('status', 'locked', 'locked_until', until);
  end if;

  update public.staff_profiles set failed_pin_attempts = attempts where id = p_staff_id;
  return jsonb_build_object('status', 'wrong_pin', 'attempts_left', 5 - attempts);
end;
$$;

revoke all on function public.check_pin_internal(uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.check_pin_internal(uuid, text, uuid, uuid) to service_role;

-- Wrong house codes: 10 an hour from one phone session. The global cap of
-- 200 across every session is gone (see the header).
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

revoke all on function public.house_code_attempts_exceeded(uuid) from public, anon, authenticated;
grant execute on function public.house_code_attempts_exceeded(uuid) to service_role;

-- 115's, recording whose PIN linked the phone.
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

  result := public.check_pin_internal(p_staff_id, p_pin, uid, household);
  if result->>'status' <> 'ok' then
    return result;
  end if;

  insert into public.device_sessions (user_id, household_id, staff_id)
  values (uid, household, p_staff_id)
  on conflict (user_id) do update
    set household_id = excluded.household_id,
        staff_id = excluded.staff_id,
        last_seen_at = now();

  return jsonb_build_object('status', 'ok', 'household_id', household);
end;
$$;

revoke all on function public.sign_in_with_house_code(text, uuid, text) from public, anon;
grant execute on function public.sign_in_with_house_code(text, uuid, text) to authenticated, service_role;

-- 110's, plus: an admin setting or clearing a PIN also lifts every lock (the
-- "until an admin resets" level); a person choosing their first PIN on a
-- phone becomes that phone's person.
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

  -- The person's own household, checked explicitly (an account in two
  -- households would otherwise be checked against one of them).
  v_is_admin := public.is_household_admin(v_profile.household_id);

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
    update staff_profiles
       set pin = null, has_pin = false,
           failed_pin_attempts = 0, pin_locked_until = null,
           pin_lock_level = 0, pin_locked_at = null
     where id = p_staff_id;
    return;
  end if;

  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'pin_must_be_four_digits' using errcode = '22023';
  end if;

  update staff_profiles
     set pin = extensions.crypt(p_pin, extensions.gen_salt('bf')),
         has_pin = true,
         failed_pin_attempts = 0, pin_locked_until = null,
         pin_lock_level = 0, pin_locked_at = null
   where id = p_staff_id;

  if not v_is_admin then
    update device_sessions
       set staff_id = p_staff_id
     where user_id = auth.uid() and household_id = v_profile.household_id;
  end if;
end;
$$;

revoke all on function public.set_staff_pin(uuid, text) from public, anon;
grant execute on function public.set_staff_pin(uuid, text) to authenticated, service_role;

-- --- 11. M1: archiving someone changes the house code ---------------------------------
-- 144's, plus a new house code. The admin archiving reads the new code in
-- the app; the other admins are pushed (the code itself stays out of the
-- notification, which can show on a lock screen).
create or replace function archive_staff_profile(p_staff_id uuid)
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

  update staff_profiles
     set archived_at = now(),
         pin = null,
         has_pin = false
   where id = p_staff_id
  returning * into v_row;

  -- Unfinished chores, and every repeating chore they hold (118).
  update household_tasks
     set assigned_to = null,
         completed_by = case
           when status = 'completed' then coalesce(completed_by, assigned_to)
           else completed_by
         end
   where household_id = v_row.household_id
     and assigned_to = p_staff_id
     and (status = 'pending'
          or (status = 'completed' and recurrence in ('daily', 'weekly', 'monthly')));

  -- Pet routines made for them go back to anyone (Phase 173, migrations/144):
  -- staff are archived, never deleted, so the column's on delete set null
  -- would never fire.
  update master_schedules ms
     set staff_id = null
   where ms.staff_id = p_staff_id;

  -- The phones they were last signed in on (119, layer 1).
  with last_pin as (
    select distinct on (a.user_id) a.user_id, a.staff_id
      from staff_sign_in_attempts a
     where a.household_id = v_row.household_id
       and a.kind = 'pin'
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
      'House code changed',
      v_row.name || ' was removed, so the house code has changed. Open Household to see the new one before you share it.',
      'Kode rumah diganti',
      v_row.name || ' sudah dihapus, jadi kode rumah diganti. Buka Rumah untuk melihat kode baru sebelum dibagikan.',
      '/dashboard?module=access',
      'house-code-' || v_row.household_id::text,
      auth.uid()
    );
  exception when others then
    raise warning 'House-code push not queued for household %: %', v_row.household_id, sqlerrm;
  end;

  return v_row;
end;
$$;

revoke all on function archive_staff_profile(uuid) from public, anon;
grant execute on function archive_staff_profile(uuid) to authenticated;

-- --- 12. M2: one household per account, for now ---------------------------------------
-- 093's, refusing an invite to a second household with its own error
-- ('already_in_a_household'), checked only once the invite itself is good.
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

  -- Raising undoes the update above, so the invite stays usable by another
  -- account.
  if exists (
    select 1 from household_members m
     where m.user_id = uid and m.household_id <> resolved
  ) then
    raise exception 'already_in_a_household' using errcode = '22023';
  end if;

  -- do nothing, not an error: clicking your own invite twice should land you
  -- in the household, not on an error screen.
  insert into household_members (household_id, user_id, role)
  values (resolved, uid, 'owner')
  on conflict (household_id, user_id) do nothing;

  return resolved;
end;
$$;

revoke all on function public.use_owner_invite_token(text) from public, anon;
grant execute on function public.use_owner_invite_token(text) to authenticated, service_role;

-- --- 13. M7: unlink phones not seen for 60 days ---------------------------------------
create or replace function public.unlink_idle_phones()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  -- Seen = the link's own last sign-in or PIN, or the session's last token
  -- refresh, whichever is latest. Written back so the admins' list is true.
  update public.device_sessions d
     set last_seen_at = seen.at
    from (
      select s.user_id,
             max(greatest(s.updated_at, s.refreshed_at at time zone 'UTC')) as at
        from auth.sessions s
       group by s.user_id
    ) seen
   where seen.user_id = d.user_id
     and seen.at > d.last_seen_at;

  -- As remove_linked_phone does: the phone stops getting the household's
  -- notifications with the link.
  delete from public.push_subscriptions p
   using public.device_sessions d
   where d.last_seen_at < now() - interval '60 days'
     and p.user_id = d.user_id
     and p.household_id = d.household_id;

  delete from public.device_sessions d
   where d.last_seen_at < now() - interval '60 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.unlink_idle_phones() from public, anon, authenticated;
grant execute on function public.unlink_idle_phones() to service_role;

-- --- 14. M6: accounts that no longer belong to a household ----------------------------
create table if not exists public.account_deletions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- When the account's last household went.
  since timestamptz not null default now(),
  due_at timestamptz not null default now() + interval '30 days'
);
alter table public.account_deletions enable row level security;
revoke all on public.account_deletions from public, anon, authenticated;
grant select, insert, update, delete on public.account_deletions to service_role;

create or replace function public.household_members_mark_orphan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.household_members m where m.user_id = old.user_id)
     and exists (select 1 from auth.users u where u.id = old.user_id)
  then
    insert into public.account_deletions (user_id)
    values (old.user_id)
    on conflict (user_id) do nothing;
  end if;
  return old;
end;
$$;

create or replace function public.household_members_unmark_orphan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.account_deletions where user_id = new.user_id;
  return new;
end;
$$;

revoke all on function public.household_members_mark_orphan() from public, anon, authenticated;
revoke all on function public.household_members_unmark_orphan() from public, anon, authenticated;
grant execute on function public.household_members_mark_orphan() to service_role;
grant execute on function public.household_members_unmark_orphan() to service_role;

drop trigger if exists household_members_mark_orphan on public.household_members;
create trigger household_members_mark_orphan
  after delete on public.household_members
  for each row execute function public.household_members_mark_orphan();

drop trigger if exists household_members_unmark_orphan on public.household_members;
create trigger household_members_unmark_orphan
  after insert on public.household_members
  for each row execute function public.household_members_unmark_orphan();

-- Asking to set up a household again cancels the deletion in the same
-- transaction as the request (Codex, PR #91); the nightly job re-checks under
-- a lock as well.
create or replace function public.household_access_requests_unmark_orphan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending' then
    delete from public.account_deletions where user_id = new.user_id;
  end if;
  return new;
end;
$$;

revoke all on function public.household_access_requests_unmark_orphan() from public, anon, authenticated;
grant execute on function public.household_access_requests_unmark_orphan() to service_role;

drop trigger if exists household_access_requests_unmark_orphan on public.household_access_requests;
create trigger household_access_requests_unmark_orphan
  after insert or update of status, requested_at on public.household_access_requests
  for each row execute function public.household_access_requests_unmark_orphan();

-- Nightly. Skips (and forgets) an account that has joined a household or
-- asked to set one up since, and never touches the operator's accounts.
--
-- One account at a time, under locks, as 143's prune does (Codex, PR #91): a
-- request filed or a household joined while this runs must win. The request
-- row is locked first (an update to it in flight is waited for), then the
-- account itself: FOR UPDATE on auth.users conflicts with the key-share lock
-- any insert that references the account holds until it commits (a new
-- request, a membership), so those are waited for too, and anything that
-- starts later waits for this. Only then is eligibility read again.
create or replace function public.delete_orphaned_accounts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target record;
  removed integer := 0;
begin
  for target in
    select a.user_id
      from public.account_deletions a
     where a.due_at <= now()
  loop
    begin
      perform 1 from public.household_access_requests r where r.user_id = target.user_id for update;
      perform 1 from auth.users u where u.id = target.user_id for update;
      if not found then
        delete from public.account_deletions a where a.user_id = target.user_id;
        continue;
      end if;

      -- A fresh look, now that nothing about this account can change under us.
      if exists (select 1 from public.household_members m where m.user_id = target.user_id)
         or exists (select 1 from public.household_access_requests r
                     join public.account_deletions a on a.user_id = r.user_id
                    where r.user_id = target.user_id
                      and (r.status = 'pending' or r.requested_at > a.since))
         or exists (select 1 from public.platform_admins p where p.user_id = target.user_id)
         or exists (select 1 from auth.users u where u.id = target.user_id and coalesce(u.is_anonymous, false))
         or not exists (select 1 from public.account_deletions a
                         where a.user_id = target.user_id and a.due_at <= now())
      then
        delete from public.account_deletions a where a.user_id = target.user_id;
        continue;
      end if;

      -- Their roster rows lose user_id with the account (on delete set null),
      -- which would make them look like PIN people nobody has claimed.
      -- Archived first, so no one can take the name.
      update public.staff_profiles s
         set archived_at = coalesce(s.archived_at, now()),
             pin = null,
             has_pin = false
       where s.user_id = target.user_id;

      -- Cascades to the marker, the request, identities, sessions, devices.
      delete from auth.users u where u.id = target.user_id;
      removed := removed + 1;
    exception when others then
      -- This account's changes roll back: retried tomorrow.
      raise warning 'Orphaned account % not deleted, will retry: %', target.user_id, sqlerrm;
    end;
  end loop;
  return removed;
end;
$$;

revoke all on function public.delete_orphaned_accounts() from public, anon, authenticated;
grant execute on function public.delete_orphaned_accounts() to service_role;

-- --- 15. Nightly jobs (UTC; 03:35 and 03:40 in Jakarta, beside the others) ------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('unlink-idle-phones')
      where exists (select 1 from cron.job where jobname = 'unlink-idle-phones');
    perform cron.schedule('unlink-idle-phones', '35 20 * * *', 'select public.unlink_idle_phones();');
    perform cron.unschedule('delete-orphaned-accounts')
      where exists (select 1 from cron.job where jobname = 'delete-orphaned-accounts');
    perform cron.schedule('delete-orphaned-accounts', '40 20 * * *', 'select public.delete_orphaned_accounts();');
  else
    raise warning 'pg_cron is not installed: idle phones and orphaned accounts will not be cleared';
  end if;
end;
$$;
