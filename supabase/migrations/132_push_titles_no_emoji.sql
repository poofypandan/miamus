-- ============================================================================
-- 132 — Push titles without emoji
-- ============================================================================
-- Owner, 2026-11-09: no standard emoji anywhere in Miamus; the app uses its
-- own line icons. Three push titles still began with one:
--   send_test_push      "🔔 Test notification" / "🔔 Tes notifikasi"   (114)
--   notify_sick_report  "🚨 Pet Alert" / "🚨 Hewan Sakit"               (114)
--   check_pin_internal  "🔒 PIN locked" / "🔒 PIN terkunci"             (117)
-- Each is re-created from its latest definition with only the title changed.
-- The phone's notification already shows the Miamus icon beside the title.
--
-- Same signatures, same security (definer, search_path = ''), same grants,
-- restated below. No table, policy or data change. Pushes already queued keep
-- the title they were queued with.
-- ============================================================================

-- --- 1. Test notification (114) ---
create or replace function public.send_test_push()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  devices integer := 0;
  target record;
  indonesian boolean;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  indonesian := public.locale_of(uid) = 'id';
  for target in
    select household_id, count(*) as n
    from public.push_subscriptions
    where user_id = uid and household_id = any (public.get_user_household_ids())
    group by household_id
  loop
    if not public.queue_push(
      target.household_id, 'all',
      case when indonesian then 'Tes notifikasi' else 'Test notification' end,
      case when indonesian then 'Notifikasi sudah berfungsi di perangkat ini.'
           else 'Push notifications are working on this device.' end,
      '/dashboard?module=access',
      'test-' || uid::text, uid, null
    ) then
      raise exception 'Push is not configured on the server yet' using errcode = '55000';
    end if;
    devices := devices + target.n;
  end loop;
  return devices;
end;
$$;

-- --- 2. Sick report (114) ---
create or replace function public.notify_sick_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pet_name text;
  household uuid;
  staff_name text;
  note text;
  quoted text;
  message_en text;
  message_id text;
begin
  if new.schedule_id is not null or new.notes is null or new.notes not like 'Muntah / Sakit%' then
    return new;
  end if;
  if new.completed_at < now() - interval '1 day' then
    return new;
  end if;

  begin
    select e.name, e.household_id into pet_name, household
    from public.task_entities e
    where e.id = new.entity_id;
    if household is null then
      return new;
    end if;

    if new.staff_id is not null then
      select s.name into staff_name from public.staff_profiles s where s.id = new.staff_id;
    end if;

    -- "Muntah / Sakit — muntah sedikit setelah makan" → the staff's own words.
    note := nullif(btrim(regexp_replace(substring(new.notes from char_length('Muntah / Sakit') + 1), '^\s*—\s*', '')), '');
    quoted := coalesce(E'\n“' || left(note, 140) || '”', '');

    message_en := coalesce(pet_name, 'A pet') || ' has been reported sick'
      || coalesce(' by ' || staff_name, '') || quoted;
    message_id := coalesce(pet_name, 'Hewan peliharaan') || ' dilaporkan sakit'
      || coalesce(' oleh ' || staff_name, '') || quoted;

    perform public.queue_owner_push(
      household,
      'Pet Alert', message_en,
      'Hewan Sakit', message_id,
      '/dashboard?module=agenda', 'sick-' || new.id::text,
      auth.uid()
    );
  exception when others then
    raise warning 'Sick-report push not queued for log %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

-- --- 3. PIN locked (117) ---
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
        'PIN locked',
        person.name || '''s PIN was locked after 5 wrong tries. It can be tried again in 15 minutes.',
        'PIN terkunci',
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

-- --- Who may call what (unchanged; restated) ------------------------------------------
revoke all on function public.send_test_push() from public, anon;
grant execute on function public.send_test_push() to authenticated;
revoke all on function public.notify_sick_report() from public, anon, authenticated;
revoke all on function public.check_pin_internal(uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.check_pin_internal(uuid, text, uuid, uuid) to service_role;
