-- ============================================================================
-- 150 — Timed reminders for staff, and "tell us if it's not done" for owners
--       (Phase 173 PR C)
-- ============================================================================
-- docs/phase-173-pet-routines-plan.md, D7 (owner chose A) and D15 (owner,
-- 11 Nov). Both are switches on a routine in the owner's Add routine sheet,
-- off by default, and both look at the routine only when it is due:
--
--   D7  Remind staff at this time / Ingatkan staf di jam ini. At the
--       routine's time, only if a pet on it is still open (not done, and no
--       "couldn't do" for that pet), one push per phone:
--         Pengingat
--         21.30 · Matikan lampu · Mocha & Matcha
--       to the person it is for (on leave today: the person covering, or
--       everyone; Anyone: everyone), on every linked phone that notifies
--       them. A shared
--       phone gets the same text: a reminder isn't personal. 141's household
--       switch and each person's switch apply. Quiet hours: 166's are 21.00
--       to 06.00; a reminder the owner turned on may ring for a routine
--       before 22.00 (D7 A). From 22.00 to 05.59 the sheet greys the switch.
--
--   D15 Tell us if it's not done / Kabari kami jika belum dikerjakan. If
--       a pet on it is still open 30 minutes after its time, every owner of
--       the household with notifications on gets one push, in their own
--       language:
--         Lights off · Mocha & Matcha        Matikan lampu · Mocha & Matcha
--         Not done yet (9:30 PM)             Belum dikerjakan (21.30)
--       Once per occurrence, never repeated; nothing if it was done or a
--       "couldn't do" was filed first. Owners have no quiet hours of their
--       own yet, so 166's apply, stretched to 22.30 for an alert about a
--       routine at 22.00 or earlier: the routine's time must be 05.30 to
--       22.00 (the sheet greys the switch otherwise).
--
-- Times are Asia/Jakarta (households have no timezone column yet). Built so
-- chores with a time could use the same job later; routines only for now.
--
-- NEW
--   master_schedules.remind_staff   boolean, default false (D7).
--   master_schedules.alert_owners   boolean, default false (D15).
--   routine_push_sent               one row per (routine row, day, time,
--        push) once it is sent, so nothing doubles across retries or an
--        overlapping run. Internal: no client role can read or write it.
--        Pruned after 7 days by the job itself.
--   routine_owner_title(kind, title, locale)  "Lights off" for an owner in
--        English, the saved (Indonesian) title otherwise.
--   push_names_label(names, locale)   "Mocha & Matcha", "A, B & C",
--        "A, B, C & 2 more" / "& 2 lagi".
--   queue_staff_reminder_push()  the reminder's sender: 141's phone choice
--        (household switch, linked phones with a subscription that notify
--        the person, never someone archived or an admin's roster row), but
--        the same text on a shared phone and no 5-minute rule.
--   notify_routines_due(p_now)   the job: both passes, once every 5 minutes.
--   cron job notify-routines-due   */5 * * * *.
--
-- NOT RE-CREATED
--   queue_staff_push (141). The plan proposed re-creating it with a quiet
--        start argument; a reminder also needs the same text on a shared
--        phone (141 shows "Untuk Sari" there), so it has its own small sender
--        instead, and 141's function, its triggers and its test stay as
--        they are, with no second overload.
--   export_household_data. Routines go out as to_jsonb(ms), so the two new
--        columns are in the export with no change (and no clash with 149,
--        which re-creates it). routine_push_sent is a delivery log of ids
--        and times, kept 7 days, and isn't exported.
--
-- Writes to master_schedules are admin-only since 144 (D13), so only an
-- admin can turn either switch on. Every new function revokes EXECUTE from
-- public, anon and authenticated and grants it to service_role only; none is
-- SECURITY DEFINER except queue_staff_reminder_push, which 141's helpers
-- need (they are SECURITY DEFINER themselves) and no client can call.
--
-- Privacy policy and legal.ts change in the same PR (both languages): staff
-- reminders at a routine's time when turned on, until 22.00; owners told
-- when a routine isn't done 30 minutes after its time. No new service, no
-- new kind of personal data.
--
-- Additive: two columns with defaults, one table, new functions, one cron
-- job. Old app builds never send the new columns, so their writes keep the
-- defaults (off).
-- ============================================================================

-- --- 1. The two switches -----------------------------------------------------------------
alter table public.master_schedules
  add column if not exists remind_staff boolean not null default false,
  add column if not exists alert_owners boolean not null default false;

comment on column public.master_schedules.remind_staff is
  'Phase 173 PR C (D7): push staff at the routine''s time if it isn''t done. Off by default. Rings for times 06.00-21.59 Jakarta.';
comment on column public.master_schedules.alert_owners is
  'Phase 173 PR C (D15): push every owner if it still isn''t done 30 minutes after its time. Off by default. For times 05.30-22.00 Jakarta.';

-- Only the rows with a switch on are ever looked at by the job.
create index if not exists master_schedules_push_switches_idx
  on public.master_schedules (entity_id) where remind_staff or alert_owners;

-- --- 2. What was sent ----------------------------------------------------------------------
create table if not exists public.routine_push_sent (
  schedule_id uuid not null references public.master_schedules (id) on delete cascade,
  occurs_on date not null,
  slot_time time not null,
  push text not null,
  household_id uuid not null references public.households (id) on delete cascade,
  sent_at timestamptz not null default now(),
  constraint routine_push_sent_push_check check (push in ('staff_reminder', 'owner_alert')),
  primary key (schedule_id, occurs_on, slot_time, push)
);
-- Every foreign key covered (134's rule); the primary key leads with schedule_id.
create index if not exists routine_push_sent_household_idx on public.routine_push_sent (household_id);
create index if not exists routine_push_sent_occurs_on_idx on public.routine_push_sent (occurs_on);

alter table public.routine_push_sent enable row level security;
revoke all on public.routine_push_sent from public, anon, authenticated;
grant select, insert, update, delete on public.routine_push_sent to service_role;

-- --- 3. Text helpers -----------------------------------------------------------------------
-- The routine's name as an owner reads it: a chip's English name for an owner
-- in English (the saved title is the chip's Indonesian one), the saved title
-- otherwise (Other, as typed; old rows without the app's prefixes).
create or replace function public.routine_owner_title(p_kind text, p_title text, p_locale text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_locale = 'en' and p_kind = 'walk' and p_title = 'Jalan-jalan' then 'Walk'
    when p_locale = 'en' and p_kind = 'lights' and p_title = 'Matikan lampu' then 'Lights off'
    when p_locale = 'en' and p_kind = 'play' and p_title = 'Ajak main' then 'Play'
    when p_locale = 'en' and p_kind = 'water' and p_title = 'Ganti air minum' then 'Fresh water'
    when p_locale = 'en' and p_kind = 'teeth' and p_title = 'Sikat gigi' then 'Brush teeth'
    else public.routine_display_title(p_title)
  end;
$$;

-- Pet names joined as the plan writes them, "Mocha & Matcha", in either
-- language; past three, "A, B, C & 2 more" / "A, B, C & 2 lagi".
create or replace function public.push_names_label(p_names text[], p_locale text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(cardinality(p_names), 0) = 0 then ''
    when cardinality(p_names) = 1 then p_names[1]
    when cardinality(p_names) <= 3
      then array_to_string(p_names[1:cardinality(p_names) - 1], ', ') || ' & ' || p_names[cardinality(p_names)]
    else array_to_string(p_names[1:3], ', ') || ' & ' || (cardinality(p_names) - 3)
         || case when p_locale = 'id' then ' lagi' else ' more' end
  end;
$$;

-- --- 4. The reminder's sender ----------------------------------------------------------------
-- One push to every linked phone with a subscription that notifies
-- p_staff_id (null: anyone on any phone's list). As 141's queue_staff_push,
-- except: the same title and body on a shared phone (a reminder isn't
-- personal, D7), no 5-minute rule (a reminder is once per routine and day by
-- itself), and no quiet-hours check (the job applies the reminder's own
-- window). Returns how many phones were queued.
create or replace function public.queue_staff_reminder_push(
  p_household_id uuid,
  p_staff_id uuid,
  p_title text,
  p_body text,
  p_url text,
  p_tag text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  phone record;
  sent integer := 0;
begin
  if p_household_id is null
     or not coalesce((select h.staff_push from public.households h where h.id = p_household_id), false) then
    return 0;
  end if;
  if p_staff_id is not null and not exists (
    -- Staff only: never an admin's roster row (106), never someone archived.
    select 1 from public.staff_profiles s
     where s.id = p_staff_id
       and s.household_id = p_household_id
       and s.user_id is null
       and s.archived_at is null
  ) then
    return 0;
  end if;

  for phone in
    select distinct p.device_user_id
      from public.staff_push_people p
      join public.device_sessions d on d.user_id = p.device_user_id and d.household_id = p_household_id
      join public.staff_profiles s
        on s.id = p.staff_id and s.household_id = p_household_id and s.archived_at is null
     where p.household_id = p_household_id
       and (p_staff_id is null or p.staff_id = p_staff_id)
       and exists (
         select 1 from public.push_subscriptions ps
          where ps.user_id = p.device_user_id and ps.household_id = p_household_id
       )
  loop
    if public.queue_push(p_household_id, 'staff', p_title, p_body, p_url, p_tag, phone.device_user_id, null) then
      sent := sent + 1;
    end if;
  end loop;
  return sent;
end;
$$;

-- --- 5. The job ------------------------------------------------------------------------------
-- Every 5 minutes. p_now is for tests; cron passes nothing.
--
-- What is open comes from routine_slots_open (144, the newest definition):
-- active routines of pets at home on their weekdays, a slot closed by a log
-- as Today closes it. A pet with a "couldn't do" for that slot isn't open.
-- Rows that share a time, title, note and person are one card on staff
-- phones (buildAgenda), so they are one push, naming the pets still open.
--
-- A slot is claimed in routine_push_sent before its push is queued, in the
-- same transaction (queue_push only queues a request with pg_net, which is
-- sent after commit), so a retry or an overlapping run finds it claimed and
-- sends nothing. A transaction-level advisory lock also makes an
-- overlapping run step aside.
--
-- Late runs: a reminder still goes up to 20 minutes after the routine's
-- time, an alert up to 20 minutes after its own time (30 minutes after the
-- routine's), so a short cron delay doesn't lose one and a long outage
-- doesn't send stale ones; never after the 22.00 run (reminders) or the
-- 22.30 run (alerts). Once per occurrence of the card: a pet reopened after
-- its push (a log undone) isn't pushed again.
create or replace function public.notify_routines_due(p_now timestamptz default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  at_jakarta timestamp := (coalesce(p_now, now()) at time zone 'Asia/Jakarta');
  today date := at_jakarta::date;
  g record;
  claimed uuid[];
  pets text[];
  target uuid;
  locale_body text;
  tag text;
  sent integer := 0;
begin
  if not pg_try_advisory_xact_lock(hashtext('public.notify_routines_due')) then
    return 0;
  end if;

  delete from public.routine_push_sent where occurs_on < today - 7;

  if not exists (
    select 1 from public.master_schedules ms
     where ms.is_active and (ms.remind_staff or ms.alert_owners)
  ) then
    return 0;
  end if;

  create temporary table if not exists routine_due (
    household_id uuid, schedule_id uuid, entity_id uuid, pet_name text, title text, slot_time time,
    kind text, note text, staff_id uuid, remind_staff boolean, alert_owners boolean
  ) on commit drop;
  truncate pg_temp.routine_due;

  insert into pg_temp.routine_due
  select r.household_id, r.schedule_id, r.entity_id, r.pet_name, r.title, r.slot_time,
         ms.kind, ms.note, ms.staff_id, ms.remind_staff, ms.alert_owners
    from public.routine_slots_open(today) r
    join public.master_schedules ms on ms.id = r.schedule_id
   where (ms.remind_staff or ms.alert_owners)
     and not exists (
       select 1 from public.task_exceptions x
        where x.schedule_id = r.schedule_id and x.entity_id = r.entity_id
          and x.occurs_on = today and x.slot_time = r.slot_time
     );

  -- Staff reminders (D7): at the routine's time, for a time 06.00 to 21.59.
  for g in
    select d.household_id, d.slot_time, d.title, d.note, d.staff_id, array_agg(d.schedule_id) as ids
      from pg_temp.routine_due d
     where d.remind_staff
       and d.slot_time >= time '06:00' and d.slot_time < time '22:00'
       and at_jakarta >= today + d.slot_time
       and at_jakarta < today + d.slot_time + interval '20 minutes'
       -- A late run never rings past the 22.00 run (one started a few
       -- seconds late still counts, for a time of 21.56-21.59).
       and at_jakarta < today + time '22:05'
     group by d.household_id, d.slot_time, d.title, d.note, d.staff_id
  loop
    begin
      with ins as (
        insert into public.routine_push_sent (schedule_id, occurs_on, slot_time, push, household_id)
        select unnest(g.ids), today, g.slot_time, 'staff_reminder', g.household_id
        on conflict do nothing
        returning schedule_id
      )
      select array_agg(schedule_id) into claimed from ins;
      if claimed is null then
        continue;
      end if;
      -- Once per occurrence of the card, not just per pet: a pet reopened
      -- after the push (its log undone) is marked, but not pushed again.
      if exists (
        select 1 from public.routine_push_sent s
          join public.master_schedules m on m.id = s.schedule_id
         where s.household_id = g.household_id
           and s.occurs_on = today and s.slot_time = g.slot_time and s.push = 'staff_reminder'
           and s.schedule_id <> all (claimed)
           and m.title = g.title
           and m.note is not distinct from g.note
           and m.staff_id is not distinct from g.staff_id
      ) then
        continue;
      end if;

      select array_agg(distinct d.pet_name order by d.pet_name) into pets
        from pg_temp.routine_due d
       where d.schedule_id = any (claimed) and d.slot_time = g.slot_time;

      -- The person it's for, after leave as 141 reads it for chores: the
      -- person covering on "reassign", everyone otherwise while they're
      -- away (a routine card shows to everyone anyway). Null: everyone.
      select a.assignee into target
        from public.staff_push_assignee(g.household_id, g.staff_id, today) a;

      tag := 'routine-' || today::text || '-' || to_char(g.slot_time, 'HH24MI') || '-'
             || left(md5(g.title || '|' || coalesce(g.note, '') || '|' || coalesce(g.staff_id::text, '')), 12);
      sent := sent + public.queue_staff_reminder_push(
        g.household_id,
        target,
        'Pengingat',
        public.push_time_label(g.slot_time, 'id') || ' · ' || public.routine_display_title(g.title)
          || ' · ' || public.push_names_label(pets, 'id'),
        case when target is null then '/staff' else '/staff?untuk=' || target::text end,
        tag
      );
    exception when others then
      raise warning 'Routine reminder not queued for household % at %: %', g.household_id, g.slot_time, sqlerrm;
    end;
  end loop;

  -- Owner alerts (D15): 30 minutes after the routine's time, for a time
  -- 05.30 to 22.00 (so 06.00 to 22.30 on the owner's phone).
  for g in
    select d.household_id, d.slot_time, d.title, d.kind, d.note, d.staff_id, array_agg(d.schedule_id) as ids
      from pg_temp.routine_due d
     where d.alert_owners
       and d.slot_time >= time '05:30' and d.slot_time <= time '22:00'
       and at_jakarta >= today + d.slot_time + interval '30 minutes'
       and at_jakarta < today + d.slot_time + interval '50 minutes'
       -- Never past the 22.30 run, whatever the delay.
       and at_jakarta < today + time '22:35'
     group by d.household_id, d.slot_time, d.title, d.kind, d.note, d.staff_id
  loop
    begin
      with ins as (
        insert into public.routine_push_sent (schedule_id, occurs_on, slot_time, push, household_id)
        select unnest(g.ids), today, g.slot_time, 'owner_alert', g.household_id
        on conflict do nothing
        returning schedule_id
      )
      select array_agg(schedule_id) into claimed from ins;
      if claimed is null then
        continue;
      end if;
      -- Once per occurrence of the card, not just per pet: a pet reopened
      -- after the push (its log undone) is marked, but not pushed again.
      if exists (
        select 1 from public.routine_push_sent s
          join public.master_schedules m on m.id = s.schedule_id
         where s.household_id = g.household_id
           and s.occurs_on = today and s.slot_time = g.slot_time and s.push = 'owner_alert'
           and s.schedule_id <> all (claimed)
           and m.title = g.title
           and m.note is not distinct from g.note
           and m.staff_id is not distinct from g.staff_id
      ) then
        continue;
      end if;

      select array_agg(distinct d.pet_name order by d.pet_name) into pets
        from pg_temp.routine_due d
       where d.schedule_id = any (claimed) and d.slot_time = g.slot_time;

      tag := 'routine-open-' || today::text || '-' || to_char(g.slot_time, 'HH24MI') || '-'
             || left(md5(g.title || '|' || coalesce(g.note, '') || '|' || coalesce(g.staff_id::text, '')), 12);
      if public.queue_owner_push(
        g.household_id,
        public.routine_owner_title(g.kind, g.title, 'en') || ' · ' || public.push_names_label(pets, 'en'),
        'Not done yet (' || public.push_time_label(g.slot_time, 'en') || ')',
        public.routine_owner_title(g.kind, g.title, 'id') || ' · ' || public.push_names_label(pets, 'id'),
        'Belum dikerjakan (' || public.push_time_label(g.slot_time, 'id') || ')',
        '/dashboard?module=agenda',
        tag,
        null
      ) then
        sent := sent + 1;
      end if;
    exception when others then
      raise warning 'Routine alert not queued for household % at %: %', g.household_id, g.slot_time, sqlerrm;
    end;
  end loop;

  return sent;
end;
$$;

-- --- 6. Grants -------------------------------------------------------------------------------
revoke all on function public.routine_owner_title(text, text, text) from public, anon, authenticated;
revoke all on function public.push_names_label(text[], text) from public, anon, authenticated;
revoke all on function public.queue_staff_reminder_push(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.notify_routines_due(timestamptz) from public, anon, authenticated;
grant execute on function public.routine_owner_title(text, text, text) to service_role;
grant execute on function public.push_names_label(text[], text) to service_role;
grant execute on function public.queue_staff_reminder_push(uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.notify_routines_due(timestamptz) to service_role;

-- --- 7. Every 5 minutes ----------------------------------------------------------------------
select cron.unschedule('notify-routines-due')
where exists (select 1 from cron.job where jobname = 'notify-routines-due');
select cron.schedule('notify-routines-due', '*/5 * * * *', $job$ select public.notify_routines_due(); $job$);
