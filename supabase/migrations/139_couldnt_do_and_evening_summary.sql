-- ============================================================================
-- 139 — "Tidak bisa dikerjakan" and the evening summary (Phase 165)
-- ============================================================================
-- docs/phase-165-couldnt-do-and-evening-summary-plan.md; owner decisions
-- (2026-11-10): A for D1–D10. Staff say why a task couldn't be done; admins
-- see it in amber, get one evening push listing what is still open, and a
-- push when staff ask for leave, suggest a schedule change, or report that a
-- pet wouldn't take its medicine.
--
-- NEW
--   task_exceptions           one row per task-day (per pet and slot for a
--        routine) that someone said couldn't be done: the reason, an optional
--        note, photo and shopping item, who and when. Its own table (D1), so
--        household_tasks, task_logs, the staff chore guard (128/137) and the
--        photo rule (104/136) don't change, and an app on the old version
--        still shows the task as not done. Staff phones may read and file
--        them for their household, and withdraw one within 5 minutes
--        (Batalkan, D3); nobody updates one. Kept 90 days (D4).
--   task_exceptions_guard     what a row may say: a task of its own
--        household, a day it falls on (7 days back at most, never ahead), a
--        person of the household who isn't archived, a photo in the
--        household's folder. created_at is the server's clock.
--   user_preferences.evening_summary_hour / .staff_request_pushes
--        each admin's two switches (D6, D8). my_notification_prefs() and
--        set_my_notification_prefs() read and write them; never for a staff
--        phone's anonymous session.
--   notify_task_exception     "Hewan tidak mau minum obat" on a medicine
--        routine pushes every admin now (D5), like the sick report. No switch.
--   notify_leave_request / notify_routine_proposals
--        a pending leave request, and each schedule suggestion (one push per
--        suggestion, however many rows: a statement-level trigger), push the
--        admins who have "Staff requests" on (D8). Never the phone that sent it.
--   household_requests_push_on(household)
--        for the staff's WhatsApp panel: will any admin get that push?
--   chore_days_open / routine_slots_open / notify_evening_summary
--        the evening summary (D6, D7): each hour from 18.00 to 21.00 in
--        Jakarta, each admin whose hour it is gets one push listing what
--        couldn't be done, what isn't done and what waits for them, only if
--        something does. Chores follow 137's rules (leave, who it's for).
--   prune_old_task_exceptions + cron     rows older than 90 days go.
--
-- RE-CREATED, each from its latest definition with task_exceptions added:
--   task_photos_due_for_pruning (131)    a couldn't-do photo follows the
--        30-day rule for proof photos (D4).
--   forget_missing_task_photos (123)     clears its URL once the file is gone.
--   orphaned_household_photos (138)      never lists a file a row points at.
--   export_household_data (138)          includes them.
--
-- Privacy policy and legal.ts updated in the same PR (new personal data:
-- staff-written reasons, notes and photos; new notification types).
-- Additive: one table, two columns with defaults, new functions, four
-- re-created, three triggers, two cron jobs. Every SECURITY DEFINER function
-- revokes EXECUTE from public and anon and grants only what calls it.
-- ============================================================================

-- --- 1. The table --------------------------------------------------------------------
create table if not exists public.task_exceptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- The repeat or the one-off, never a written day: with occurs_on it is the
  -- app's occurrence key (templateId|date), written or not.
  chore_id uuid references public.household_tasks (id) on delete cascade,
  schedule_id uuid references public.master_schedules (id) on delete cascade,
  entity_id uuid references public.task_entities (id) on delete cascade,
  occurs_on date not null,
  slot_time time,
  reason text not null,
  note text,
  photo_url text,
  inventory_item_id uuid references public.inventory_items (id) on delete set null,
  staff_id uuid references public.staff_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint task_exceptions_reason_check
    check (reason in ('out_of_stock', 'pet_refused', 'done_by_other', 'other')),
  constraint task_exceptions_one_task check ((chore_id is null) <> (schedule_id is null)),
  -- A routine names its pet and its slot; a chore neither.
  constraint task_exceptions_routine_shape check (
    (schedule_id is null and entity_id is null and slot_time is null)
    or (schedule_id is not null and entity_id is not null and slot_time is not null)
  ),
  constraint task_exceptions_refused_is_routine check (reason <> 'pet_refused' or schedule_id is not null),
  constraint task_exceptions_note_length check (note is null or char_length(note) <= 280),
  constraint task_exceptions_other_has_note check (reason <> 'other' or char_length(btrim(coalesce(note, ''))) >= 3)
);

-- One per task-day; a second phone saying it too is refused (the first stands).
create unique index if not exists task_exceptions_chore_day_key
  on public.task_exceptions (chore_id, occurs_on) where chore_id is not null;
create unique index if not exists task_exceptions_slot_key
  on public.task_exceptions (schedule_id, entity_id, occurs_on, slot_time) where schedule_id is not null;
create index if not exists task_exceptions_household_day_idx on public.task_exceptions (household_id, occurs_on);
-- Every foreign key covered (134's rule).
create index if not exists task_exceptions_entity_idx on public.task_exceptions (entity_id);
create index if not exists task_exceptions_item_idx on public.task_exceptions (inventory_item_id);
create index if not exists task_exceptions_staff_idx on public.task_exceptions (staff_id);
create index if not exists task_exceptions_created_idx on public.task_exceptions (created_at);

alter table public.task_exceptions enable row level security;
revoke all on public.task_exceptions from public, anon, authenticated;
grant select, insert, delete on public.task_exceptions to authenticated;
grant select, insert, update, delete on public.task_exceptions to service_role;

-- Everyone in the house reads them: another staff member needs to see why a
-- task is amber. Staff phones file them, so get_user_household_ids() is the
-- right check here (this is not an admin-only action).
drop policy if exists "household_select_task_exceptions" on public.task_exceptions;
create policy "household_select_task_exceptions" on public.task_exceptions
  for select to authenticated using (household_id = any (public.get_user_household_ids()));

drop policy if exists "household_insert_task_exceptions" on public.task_exceptions;
create policy "household_insert_task_exceptions" on public.task_exceptions
  for insert to authenticated with check (household_id = any (public.get_user_household_ids()));

-- Batalkan: within 5 minutes of saving, as routine_proposals and
-- inventory_alerts allow. After that it is the household's record.
drop policy if exists "household_withdraw_task_exceptions" on public.task_exceptions;
create policy "household_withdraw_task_exceptions" on public.task_exceptions
  for delete to authenticated using (
    household_id = any (public.get_user_household_ids())
    and created_at > now() - interval '5 minutes'
  );

-- --- 2. What a row may say ---------------------------------------------------------
create or replace function public.task_exceptions_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Jakarta')::date;
  chore public.household_tasks;
  day_row public.household_tasks;
  pet uuid;
  ref text[];
begin
  if new.occurs_on > today or new.occurs_on < today - 7 then
    raise exception 'task_exception_day' using errcode = '22023';
  end if;

  if new.chore_id is not null then
    select * into chore
      from public.household_tasks t
     where t.id = new.chore_id
       and t.household_id = new.household_id
       and t.parent_task_id is null
       and t.status <> 'cancelled';
    if not found then
      raise exception 'task_exception_task' using errcode = '42501';
    end if;
    -- That day's own row, if one is written: it governs the day.
    select * into day_row
      from public.household_tasks x
     where x.parent_task_id = chore.id and x.household_id = new.household_id and x.due_date = new.occurs_on
     order by x.created_at
     limit 1;
    if found then
      if day_row.status <> 'pending' then
        raise exception 'task_exception_not_open' using errcode = '23514';
      end if;
    elsif not public.chore_occurs_on(chore, new.occurs_on) then
      raise exception 'task_exception_day' using errcode = '22023';
    elsif chore.due_date = new.occurs_on and chore.status <> 'pending' then
      -- A chore's own first day (a one-off, or a repeat's first) is its row.
      raise exception 'task_exception_not_open' using errcode = '23514';
    end if;
  else
    -- The routine's pet is the schedule's; stamped, not trusted.
    select s.entity_id into pet
      from public.master_schedules s
      join public.task_entities e on e.id = s.entity_id
     where s.id = new.schedule_id and e.household_id = new.household_id;
    if pet is null then
      raise exception 'task_exception_task' using errcode = '42501';
    end if;
    new.entity_id := pet;
  end if;

  if new.staff_id is not null then
    if not exists (
      select 1 from public.staff_profiles s
       where s.id = new.staff_id and s.household_id = new.household_id and s.archived_at is null
    ) then
      raise exception 'task_exception_person' using errcode = '42501';
    end if;
  end if;

  if new.inventory_item_id is not null and not exists (
    select 1 from public.inventory_items i
     where i.id = new.inventory_item_id and i.household_id = new.household_id
  ) then
    raise exception 'task_exception_item' using errcode = '42501';
  end if;

  if new.photo_url is not null then
    ref := public.photo_object_ref(new.photo_url);
    if ref is null or ref[1] <> 'household-logs'
       or public.storage_object_household(ref[2]) is distinct from new.household_id then
      raise exception 'task_exception_photo' using errcode = '42501';
    end if;
  end if;

  new.note := nullif(btrim(new.note), '');
  new.created_at := now();
  return new;
end;
$$;

-- A trigger function: triggers fire without an EXECUTE grant (as 128).
revoke all on function public.task_exceptions_guard() from public, anon, authenticated;
grant execute on function public.task_exceptions_guard() to service_role;

drop trigger if exists task_exceptions_guard on public.task_exceptions;
create trigger task_exceptions_guard
  before insert on public.task_exceptions
  for each row execute function public.task_exceptions_guard();

-- --- 3. Each admin's two switches ----------------------------------------------------
-- Null hour = the evening summary is off. An account with no row yet has
-- the defaults (19.00, requests on), as the column defaults give a new row.
alter table public.user_preferences
  add column if not exists evening_summary_hour smallint default 19;
alter table public.user_preferences
  add column if not exists staff_request_pushes boolean not null default true;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_preferences_evening_summary_hour_check') then
    alter table public.user_preferences
      add constraint user_preferences_evening_summary_hour_check
      check (evening_summary_hour is null or evening_summary_hour in (18, 19, 20, 21));
  end if;
end;
$$;

-- What an admin's pushes are set to: (hour or null, requests on/off).
create or replace function public.notification_prefs_of(p_user uuid)
returns table (evening_summary_hour smallint, staff_request_pushes boolean)
language sql
stable
set search_path = ''
as $$
  select case when p.user_id is null then 19::smallint else p.evening_summary_hour end,
         coalesce(p.staff_request_pushes, true)
    from (select p_user as uid) x
    left join public.user_preferences p on p.user_id = x.uid;
$$;
revoke all on function public.notification_prefs_of(uuid) from public, anon, authenticated;
grant execute on function public.notification_prefs_of(uuid) to service_role;

create or replace function public.my_notification_prefs()
returns table (evening_summary_hour smallint, staff_request_pushes boolean)
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
  return query select * from public.notification_prefs_of(uid);
end;
$$;

create or replace function public.set_my_notification_prefs(p_hour smallint, p_requests boolean)
returns table (evening_summary_hour smallint, staff_request_pushes boolean)
language plpgsql
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
  if coalesce(anonymous, true) then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  if p_hour is not null and p_hour not in (18, 19, 20, 21) then
    raise exception 'hour must be 18, 19, 20 or 21' using errcode = '22023';
  end if;
  if p_requests is null then
    raise exception 'requests must be true or false' using errcode = '22023';
  end if;

  -- Keeps the language already chosen; one not chosen yet stays as
  -- locale_of reads it (English).
  insert into public.user_preferences (user_id, locale, evening_summary_hour, staff_request_pushes, updated_at)
  values (uid, public.locale_of(uid), p_hour, p_requests, now())
  on conflict (user_id) do update
    set evening_summary_hour = excluded.evening_summary_hour,
        staff_request_pushes = excluded.staff_request_pushes,
        updated_at = excluded.updated_at;
  return query select * from public.notification_prefs_of(uid);
end;
$$;

revoke all on function public.my_notification_prefs() from public, anon;
revoke all on function public.set_my_notification_prefs(smallint, boolean) from public, anon;
grant execute on function public.my_notification_prefs() to authenticated;
grant execute on function public.set_my_notification_prefs(smallint, boolean) to authenticated;

-- --- 4. Small text helpers ------------------------------------------------------------
-- A time as each language writes it: 6:00 PM / 18.00 (docs/indonesian-glossary.md).
create or replace function public.push_time_label(p_time time, p_locale text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_time is null then null
              when p_locale = 'id' then to_char(p_time, 'HH24.MI')
              else ltrim(to_char(p_time, 'HH12:MI AM'), '0') end;
$$;

-- "12–14 Nov", "30 Nov – 2 Dec"; Indonesian months: "30 Nov – 2 Des".
create or replace function public.push_date_range_label(p_start date, p_end date, p_locale text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  months_id constant text[] := array['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  months_en constant text[] := array['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  m_start text;
  m_end text;
begin
  if p_locale = 'id' then
    m_start := months_id[extract(month from p_start)::int];
    m_end := months_id[extract(month from p_end)::int];
  else
    m_start := months_en[extract(month from p_start)::int];
    m_end := months_en[extract(month from p_end)::int];
  end if;
  if p_start = p_end then
    return extract(day from p_start)::int || ' ' || m_start;
  end if;
  if date_trunc('month', p_start) = date_trunc('month', p_end) then
    return extract(day from p_start)::int || '–' || extract(day from p_end)::int || ' ' || m_end;
  end if;
  return extract(day from p_start)::int || ' ' || m_start || ' – ' || extract(day from p_end)::int || ' ' || m_end;
end;
$$;

-- A routine's title without the app's prefixes (schedule-categories.ts).
create or replace function public.routine_display_title(p_title text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(coalesce(p_title, ''), '^(Medication|Grooming|Vet): ', '');
$$;

revoke all on function public.push_time_label(time, text) from public, anon, authenticated;
revoke all on function public.push_date_range_label(date, date, text) from public, anon, authenticated;
revoke all on function public.routine_display_title(text) from public, anon, authenticated;
grant execute on function public.push_time_label(time, text) to service_role;
grant execute on function public.push_date_range_label(date, date, text) to service_role;
grant execute on function public.routine_display_title(text) to service_role;

-- --- 5. Pushes when something arrives -------------------------------------------------
-- "Hewan tidak mau minum obat" on a medicine routine: every admin, now (D5),
-- like the sick report (103/132); no switch. Older than a day is skipped
-- (a report that sat in the offline queue overnight still alerts; a restore
-- doesn't). Never the phone that filed it. A failure never costs the row.
create or replace function public.notify_task_exception()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  routine_title text;
  pet_name text;
  staff_name text;
  medicine text;
begin
  if new.reason <> 'pet_refused' or new.schedule_id is null then
    return new;
  end if;
  if new.occurs_on < (now() at time zone 'Asia/Jakarta')::date - 1 then
    return new;
  end if;

  begin
    select s.title, e.name into routine_title, pet_name
      from public.master_schedules s
      join public.task_entities e on e.id = new.entity_id
     where s.id = new.schedule_id;
    if routine_title is null or routine_title not like 'Medication: %' then
      return new;
    end if;
    medicine := public.routine_display_title(routine_title);
    if new.staff_id is not null then
      select s.name into staff_name from public.staff_profiles s where s.id = new.staff_id;
    end if;

    perform public.queue_owner_push(
      new.household_id,
      'Medicine not taken',
      coalesce(pet_name, 'A pet') || ' wouldn''t take ' || medicine
        || ' (' || public.push_time_label(new.slot_time, 'en') || ').'
        || coalesce(' Reported by ' || staff_name || '.', ''),
      'Obat tidak diminum',
      coalesce(pet_name, 'Hewan') || ' tidak mau minum obat ' || medicine
        || ' (' || public.push_time_label(new.slot_time, 'id') || ').'
        || coalesce(' Dilaporkan ' || staff_name || '.', ''),
      '/dashboard?module=agenda',
      'refused-' || new.id::text,
      auth.uid()
    );
  exception when others then
    raise warning 'Medicine push not queued for exception %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.notify_task_exception() from public, anon, authenticated;
grant execute on function public.notify_task_exception() to service_role;

drop trigger if exists task_exceptions_notify on public.task_exceptions;
create trigger task_exceptions_notify
  after insert on public.task_exceptions
  for each row execute function public.notify_task_exception();

-- One push to each admin of a household who has a device there and "Staff
-- requests" on, in that admin's language, except the caller. True if any
-- was queued.
create or replace function public.queue_staff_request_push(
  p_household_id uuid,
  p_title_en text, p_body_en text,
  p_title_id text, p_body_id text,
  p_url text, p_tag text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin record;
  queued boolean := false;
  caller uuid := auth.uid();
begin
  for admin in
    select distinct m.user_id
      from public.household_members m
     where m.household_id = p_household_id
       and (caller is null or m.user_id <> caller)
       and (select pr.staff_request_pushes from public.notification_prefs_of(m.user_id) pr)
       and exists (
         select 1 from public.push_subscriptions s
          where s.household_id = p_household_id and s.user_id = m.user_id
       )
  loop
    if public.locale_of(admin.user_id) = 'id' then
      queued := public.queue_push(p_household_id, 'owner', p_title_id, p_body_id, p_url, p_tag, admin.user_id, null) or queued;
    else
      queued := public.queue_push(p_household_id, 'owner', p_title_en, p_body_en, p_url, p_tag, admin.user_id, null) or queued;
    end if;
  end loop;
  return queued;
end;
$$;
revoke all on function public.queue_staff_request_push(uuid, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.queue_staff_request_push(uuid, text, text, text, text, text, text) to service_role;

create or replace function public.notify_leave_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  staff_name text;
begin
  if new.status <> 'pending' then
    return new;
  end if;
  begin
    select s.name into staff_name from public.staff_profiles s where s.id = new.staff_id;
    perform public.queue_staff_request_push(
      new.household_id,
      'Leave request',
      coalesce(staff_name, 'Someone') || ' asked for '
        || public.push_date_range_label(new.start_date, new.end_date, 'en') || ' off.',
      'Permintaan cuti',
      coalesce(staff_name, 'Staf') || ' minta cuti '
        || public.push_date_range_label(new.start_date, new.end_date, 'id') || '.',
      '/dashboard/leave/' || new.id::text,
      'leave-' || new.id::text
    );
  exception when others then
    raise warning 'Leave push not queued for request %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function public.notify_leave_request() from public, anon, authenticated;
grant execute on function public.notify_leave_request() to service_role;

drop trigger if exists leave_requests_notify on public.leave_requests;
create trigger leave_requests_notify
  after insert on public.leave_requests
  for each row execute function public.notify_leave_request();

-- One push per suggestion: the app files a suggestion's rows (one per dose)
-- in one insert, tied by batch_id, so the statement sees them all at once.
create or replace function public.notify_routine_proposals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  suggestion record;
begin
  for suggestion in
    select e.household_id, a.staff_id, coalesce(a.batch_id, a.id::text) as batch, count(*) as n
      from added a
      join public.task_entities e on e.id = a.pet_id
     where a.status = 'pending'
     group by e.household_id, a.staff_id, coalesce(a.batch_id, a.id::text)
  loop
    begin
      perform public.queue_staff_request_push(
        suggestion.household_id,
        'Schedule suggestion',
        coalesce((select s.name from public.staff_profiles s where s.id = suggestion.staff_id), 'Someone')
          || case when suggestion.n = 1 then ' suggested a schedule change.'
                  else ' suggested ' || suggestion.n || ' schedule changes.' end,
        'Usulan jadwal',
        coalesce((select s.name from public.staff_profiles s where s.id = suggestion.staff_id), 'Staf')
          || case when suggestion.n = 1 then ' mengusulkan perubahan jadwal.'
                  else ' mengusulkan ' || suggestion.n || ' perubahan jadwal.' end,
        '/dashboard?module=agenda',
        'proposal-' || suggestion.batch
      );
    exception when others then
      raise warning 'Suggestion push not queued for batch %: %', suggestion.batch, sqlerrm;
    end;
  end loop;
  return null;
end;
$$;
revoke all on function public.notify_routine_proposals() from public, anon, authenticated;
grant execute on function public.notify_routine_proposals() to service_role;

drop trigger if exists routine_proposals_notify on public.routine_proposals;
create trigger routine_proposals_notify
  after insert on public.routine_proposals
  referencing new table as added
  for each statement execute function public.notify_routine_proposals();

-- For the staff's WhatsApp panel (D8): will an admin of this household get
-- the push? Staff phones ask it, so membership is get_user_household_ids();
-- it answers yes or no and nothing else.
create or replace function public.household_requests_push_on(p_household_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (p_household_id = any (public.get_user_household_ids())) then
    return false;
  end if;
  return exists (
    select 1
      from public.household_members m
     where m.household_id = p_household_id
       and m.user_id <> auth.uid()
       and (select pr.staff_request_pushes from public.notification_prefs_of(m.user_id) pr)
       and exists (
         select 1 from public.push_subscriptions s
          where s.household_id = p_household_id and s.user_id = m.user_id
       )
  );
end;
$$;
revoke all on function public.household_requests_push_on(uuid) from public, anon;
grant execute on function public.household_requests_push_on(uuid) to authenticated;

-- --- 6. What is still open on a day ---------------------------------------------------
-- Chore-days still to do on p_day, as Today reads them (expandChores and
-- applyLeaveTriage): the same rules as 137's reminder, for every chore.
-- `assignee` is who it is for after leave (null: anyone). due_time is the
-- column's "HH:MM" text.
create or replace function public.chore_days_open(p_day date)
returns table (household_id uuid, chore_id uuid, title text, due_time text, assignee uuid)
language sql
stable
set search_path = ''
as $$
  with due as (
    select t.id, t.household_id, t.title, t.due_time, t.due_date, t.status, t.assigned_to
      from public.household_tasks t
     where t.parent_task_id is null
       and t.status <> 'cancelled'
       and public.chore_occurs_on(t, p_day)
    union all
    -- A written day off the repeat's pattern still shows and is owed (137).
    select t.id, t.household_id, x.title, x.due_time, t.due_date, t.status, t.assigned_to
      from public.household_tasks x
      join public.household_tasks t
        on t.id = x.parent_task_id and t.household_id = x.household_id and t.parent_task_id is null
     where t.status <> 'cancelled'
       and x.due_date = p_day
       and not public.chore_occurs_on(t, p_day)
  ),
  open_days as (
    -- A written day governs its own title, time and who it's for, as
    -- expandChores reads it: an owner may have moved today's to 21:00
    -- (Codex, PR #71).
    select d.household_id, d.id,
           case when r.id is not null then r.title else d.title end as title,
           case when r.id is not null then r.due_time else d.due_time end as due_time,
           case when r.id is not null then r.assigned_to else d.assigned_to end as assignee
      from due d
      left join lateral (
        select x.id, x.status, x.assigned_to, x.title, x.due_time
          from public.household_tasks x
         where x.parent_task_id = d.id and x.due_date = p_day
         order by x.created_at
         limit 1
      ) r on true
     where coalesce(r.status, case when p_day = d.due_date then d.status else 'pending' end) = 'pending'
  )
  select o.household_id, o.id, o.title, o.due_time,
         case
           when lv.id is null then o.assignee
           when coalesce(lv.fallback_action, 'unassign') = 'reassign' and lv.fallback_assignee_id is not null
             then lv.fallback_assignee_id
           else null
         end
    from open_days o
    left join lateral (
      select l.id, l.fallback_action, l.fallback_assignee_id
        from public.leave_requests l
       where o.assignee is not null
         and l.staff_id = o.assignee
         and l.household_id = o.household_id
         and l.status in ('approved', 'ended_early')
         and p_day between l.start_date and l.end_date
         and (l.ended_on is null or p_day < l.ended_on)
       order by l.created_at
       limit 1
    ) lv on true
   where lv.id is null or coalesce(lv.fallback_action, 'unassign') <> 'pause';
$$;
revoke all on function public.chore_days_open(date) from public, anon, authenticated;
grant execute on function public.chore_days_open(date) to service_role;

-- Routine slots still to do on p_day, as buildAgenda (scheduleEngine.ts)
-- reads them: active schedules of pets not at the clinic, fixed times or
-- interval slots ("weekly" isn't expanded, as in the app). A single-slot
-- schedule — every one the app creates — is done by any log that day. A
-- multi-slot one matches each slot, earliest first, to the nearest unclaimed
-- log within half its interval (3 hours for fixed times), exactly as
-- buildAgenda does (Codex, PR #71): counting logs would mark the wrong slot.
create or replace function public.routine_slots_open(p_day date)
returns table (household_id uuid, schedule_id uuid, entity_id uuid, pet_name text, title text, slot_time time)
language plpgsql
stable
set search_path = ''
as $$
declare
  s record;
  slots time[];
  marks int[];
  claimed boolean[];
  win numeric;
  slot time;
  slot_min int;
  best int;
  best_diff numeric;
  diff numeric;
  i int;
begin
  for s in
    select ms.id, ms.entity_id, ms.title, ms.frequency_type, ms.fixed_times, ms.start_time, ms.end_time,
           ms.interval_hours, e.household_id, e.name as pet_name
      from public.master_schedules ms
      join public.task_entities e on e.id = ms.entity_id
     where ms.is_active
       and (ms.created_at at time zone 'Asia/Jakarta')::date <= p_day
       and (ms.expires_at is null or ms.expires_at >= p_day)
       and e.status is distinct from 'admitted'
       and e.household_id is not null
  loop
    if s.frequency_type = 'fixed_time' then
      slots := array(select t from unnest(s.fixed_times) as t order by t);
    elsif s.frequency_type = 'interval' and s.start_time is not null and s.end_time is not null
          and coalesce(s.interval_hours, 0) > 0 then
      slots := array(
        select g::time
          from generate_series(p_day + s.start_time, p_day + s.end_time, make_interval(hours => s.interval_hours)) as g
         order by 1
      );
    else
      continue;
    end if;
    if coalesce(cardinality(slots), 0) = 0 then
      continue;
    end if;

    -- That day's logs for this pet, as minutes of the Jakarta day, earliest first.
    marks := array(
      select (extract(hour from (l.completed_at at time zone 'Asia/Jakarta')) * 60
              + extract(minute from (l.completed_at at time zone 'Asia/Jakarta')))::int as m
        from public.task_logs l
       where l.schedule_id = s.id
         and l.entity_id = s.entity_id
         and (l.completed_at at time zone 'Asia/Jakarta')::date = p_day
       order by 1
    );

    if cardinality(slots) = 1 then
      if coalesce(cardinality(marks), 0) = 0 then
        household_id := s.household_id; schedule_id := s.id; entity_id := s.entity_id;
        pet_name := s.pet_name; title := s.title; slot_time := slots[1];
        return next;
      end if;
      continue;
    end if;

    win := case when s.frequency_type = 'interval' and coalesce(s.interval_hours, 0) > 0
                then s.interval_hours * 60 / 2.0 else 180 end;
    claimed := array_fill(false, array[greatest(coalesce(cardinality(marks), 0), 1)]);
    foreach slot in array slots loop
      slot_min := extract(hour from slot)::int * 60 + extract(minute from slot)::int;
      best := null;
      best_diff := null;
      for i in 1 .. coalesce(cardinality(marks), 0) loop
        if not claimed[i] then
          diff := abs(marks[i] - slot_min);
          if diff <= win and (best_diff is null or diff < best_diff) then
            best := i;
            best_diff := diff;
          end if;
        end if;
      end loop;
      if best is null then
        household_id := s.household_id; schedule_id := s.id; entity_id := s.entity_id;
        pet_name := s.pet_name; title := s.title; slot_time := slot;
        return next;
      else
        claimed[best] := true;
      end if;
    end loop;
  end loop;
end;
$$;
revoke all on function public.routine_slots_open(date) from public, anon, authenticated;
grant execute on function public.routine_slots_open(date) to service_role;

-- --- 7. The evening summary -----------------------------------------------------------
-- Owner-facing reason labels, as the app shows them. Null for no reason.
create or replace function public.exception_reason_label(p_reason text, p_refused_medicine boolean, p_locale text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_reason
    when 'out_of_stock' then case when p_locale = 'id' then 'barang habis' else 'out of stock' end
    when 'pet_refused' then case
      when p_refused_medicine then case when p_locale = 'id' then 'tidak mau minum obat' else 'wouldn''t take medicine' end
      else case when p_locale = 'id' then 'tidak mau makan' else 'wouldn''t eat' end end
    when 'done_by_other' then case when p_locale = 'id' then 'sudah dikerjakan orang lain' else 'done by someone else' end
    when 'other' then case when p_locale = 'id' then 'lainnya' else 'other' end
  end;
$$;
revoke all on function public.exception_reason_label(text, boolean, text) from public, anon, authenticated;
grant execute on function public.exception_reason_label(text, boolean, text) to service_role;

-- Each hour from 18.00 to 21.00 in Jakarta: every admin whose summary hour it
-- is, with a device in the household, gets one push if anything couldn't be
-- done, isn't done (chores due by now, routine slots up to now) or waits for
-- them. Nothing open, no push. Staff notes are never in it. Routing as 137:
-- an admin's own chore to that admin, everything else to every admin.
-- Returns how many pushes were queued. p_now is for tests.
create or replace function public.notify_evening_summary(p_now timestamptz default null)
returns int
language plpgsql
set search_path = ''
as $$
declare
  at_jakarta timestamp := (coalesce(p_now, now()) at time zone 'Asia/Jakarta');
  today date := at_jakarta::date;
  hour_now int := extract(hour from at_jakarta)::int;
  until_time time := at_jakarta::time;
  admin record;
  item record;
  locale text;
  couldnt text[];
  not_done text[];
  waiting text[];
  body text;
  sent int := 0;
begin
  create temporary table if not exists pg_temp.summary_items (
    household_id uuid, for_user uuid, part text, sort_time text, label_en text, label_id text
  ) on commit drop;
  truncate pg_temp.summary_items;

  -- Chores: open today, couldn't-do ones whatever their time; the rest only
  -- once due (no time, or a time before now).
  insert into pg_temp.summary_items
  select c.household_id, am.user_id,
         case when x.id is not null then 'couldnt' else 'not_done' end,
         c.due_time,
         c.title || coalesce(' (' || public.exception_reason_label(x.reason, false, 'en') || ')', ''),
         c.title || coalesce(' (' || public.exception_reason_label(x.reason, false, 'id') || ')', '')
    from public.chore_days_open(today) c
    left join public.task_exceptions x on x.chore_id = c.chore_id and x.occurs_on = today
    left join public.staff_profiles p on p.id = c.assignee and p.household_id = c.household_id
    left join public.household_members am on am.household_id = c.household_id and am.user_id = p.user_id
   where x.id is not null or c.due_time is null or c.due_time <= to_char(until_time, 'HH24:MI');

  -- Routine slots, the same way. Every admin.
  insert into pg_temp.summary_items
  select r.household_id, null,
         case when x.id is not null then 'couldnt' else 'not_done' end,
         to_char(r.slot_time, 'HH24:MI'),
         r.pet_name || ': ' || public.routine_display_title(r.title)
           || case when x.id is not null
                then ' (' || public.exception_reason_label(x.reason, r.title like 'Medication: %', 'en') || ')'
                else ' ' || public.push_time_label(r.slot_time, 'en') end,
         r.pet_name || ': ' || public.routine_display_title(r.title)
           || case when x.id is not null
                then ' (' || public.exception_reason_label(x.reason, r.title like 'Medication: %', 'id') || ')'
                else ' ' || public.push_time_label(r.slot_time, 'id') end
    from public.routine_slots_open(today) r
    left join public.task_exceptions x
      on x.schedule_id = r.schedule_id and x.entity_id = r.entity_id
     and x.occurs_on = today and x.slot_time = r.slot_time
   where x.id is not null or r.slot_time <= until_time;

  -- Waiting for an admin: pending leave (not already over) and suggestions.
  insert into pg_temp.summary_items
  select l.household_id, null, 'waiting', null,
         coalesce(s.name, 'Staff') || '''s leave', 'cuti ' || coalesce(s.name, 'staf')
    from public.leave_requests l
    left join public.staff_profiles s on s.id = l.staff_id
   where l.status = 'pending' and l.end_date >= today;

  insert into pg_temp.summary_items
  select e.household_id, null, 'waiting', null,
         case when count(distinct coalesce(p.batch_id, p.id::text)) = 1 then '1 schedule suggestion'
              else count(distinct coalesce(p.batch_id, p.id::text)) || ' schedule suggestions' end,
         count(distinct coalesce(p.batch_id, p.id::text)) || ' usulan jadwal'
    from public.routine_proposals p
    join public.task_entities e on e.id = p.pet_id
   where p.status = 'pending'
   group by e.household_id;

  for admin in
    select distinct m.household_id, m.user_id
      from public.household_members m
     where (select pr.evening_summary_hour from public.notification_prefs_of(m.user_id) pr) = hour_now
       and exists (
         select 1 from public.push_subscriptions s
          where s.household_id = m.household_id and s.user_id = m.user_id
       )
       and exists (
         select 1 from pg_temp.summary_items i
          where i.household_id = m.household_id and (i.for_user is null or i.for_user = m.user_id)
       )
  loop
    begin
      locale := public.locale_of(admin.user_id);
      select
        array_agg(case when locale = 'id' then i.label_id else i.label_en end order by i.sort_time nulls first, i.label_en)
          filter (where i.part = 'couldnt'),
        array_agg(case when locale = 'id' then i.label_id else i.label_en end order by i.sort_time nulls first, i.label_en)
          filter (where i.part = 'not_done'),
        array_agg(case when locale = 'id' then i.label_id else i.label_en end order by i.label_en)
          filter (where i.part = 'waiting')
        into couldnt, not_done, waiting
        from pg_temp.summary_items i
       where i.household_id = admin.household_id and (i.for_user is null or i.for_user = admin.user_id);

      body := concat_ws(' ',
        case when couldnt is not null then
          case when locale = 'id' then 'Tidak bisa: ' else 'Couldn''t: ' end
          || public.chore_due_titles(couldnt, locale) || '.' end,
        case when not_done is not null then
          case when locale = 'id' then 'Belum: ' else 'Not done: ' end
          || public.chore_due_titles(not_done, locale) || '.' end,
        case when waiting is not null then
          case when locale = 'id' then 'Menunggu Anda: ' else 'Waiting for you: ' end
          || public.chore_due_titles(waiting, locale) || '.' end
      );

      if public.queue_push(
        admin.household_id, 'owner',
        case when locale = 'id' then 'Belum selesai hari ini' else 'Not done today' end,
        body,
        '/dashboard?module=agenda&summary=' || today::text,
        'evening-' || today::text,
        admin.user_id, null
      ) then
        sent := sent + 1;
      end if;
    exception when others then
      raise warning 'Evening summary not queued for user % in household %: %',
        admin.user_id, admin.household_id, sqlerrm;
    end;
  end loop;
  return sent;
end;
$$;

revoke all on function public.notify_evening_summary(timestamptz) from public, anon, authenticated;
grant execute on function public.notify_evening_summary(timestamptz) to service_role;

-- 11:00–14:00 UTC is 18.00–21.00 in Jakarta: one run an hour, each sending to
-- the admins who picked that hour.
select cron.unschedule('notify-evening-summary')
where exists (select 1 from cron.job where jobname = 'notify-evening-summary');
select cron.schedule('notify-evening-summary', '0 11-14 * * *', $job$ select public.notify_evening_summary(); $job$);

-- --- 8. Kept 90 days (D4) --------------------------------------------------------------
create or replace function public.prune_old_task_exceptions()
returns int
language plpgsql
set search_path = ''
as $$
declare
  removed int;
begin
  delete from public.task_exceptions where created_at < now() - interval '90 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function public.prune_old_task_exceptions() from public, anon, authenticated;
grant execute on function public.prune_old_task_exceptions() to service_role;

-- 19:55 UTC (02:55 in Jakarta), beside the other nightly prunes.
select cron.unschedule('prune-old-task-exceptions')
where exists (select 1 from cron.job where jobname = 'prune-old-task-exceptions');
select cron.schedule('prune-old-task-exceptions', '55 19 * * *', $job$ select public.prune_old_task_exceptions(); $job$);

-- --- 9. Photos: the 30-day rule (131's function, plus couldn't-do photos) -------------
create or replace function public.task_photos_due_for_pruning(p_secret text, p_limit integer DEFAULT 100)
 RETURNS TABLE(name text, size bigint, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  cutoff timestamptz := public.task_photo_retention_cutoff();
  food_cutoff timestamptz := public.food_photo_keep_cutoff();
  repair_cutoff timestamptz := public.repair_keep_cutoff();
begin
  perform public.assert_task_photo_retention_secret(p_secret);

  return query
  with refs as (
    select public.photo_object_ref(l.photo_url) as r, l.completed_at < cutoff as expired
    from public.task_logs l
    where l.photo_url is not null
    union all
    -- A repair visit (migrations/130) keeps its photos while its repair is
    -- open, and for two years after it closes; a visit whose repair was
    -- deleted (repair_id set null) follows the 30-day rule again.
    select public.photo_object_ref(u),
           case when t.repair_id is not null then coalesce(rp.closed_at < repair_cutoff, false)
                else coalesce(t.completed_at < cutoff, false) end
    from public.household_tasks t
    left join public.repairs rp on rp.id = t.repair_id
    cross join lateral unnest(array[t.photo_url, t.before_photo_url, t.after_photo_url]) as u
    where u is not null
    union all
    -- A repair's own photo (the problem): the same two years after closing.
    select public.photo_object_ref(rp.photo_url), coalesce(rp.closed_at < repair_cutoff, false)
    from public.repairs rp
    where rp.photo_url is not null
    union all
    -- A note's photo (migrations/131): kept as long as its repair.
    select public.photo_object_ref(n.photo_url), coalesce(rp.closed_at < repair_cutoff, false)
    from public.repair_notes n
    join public.repairs rp on rp.id = n.repair_id
    where n.photo_url is not null
    union all
    -- A couldn't-do photo (migrations/139): 30 days, like proof photos.
    select public.photo_object_ref(x.photo_url), x.created_at < cutoff
    from public.task_exceptions x
    where x.photo_url is not null
  ),
  due as (
    select r[2] as object_name
    from refs
    where r is not null and r[1] = 'household-logs'
    group by r[2]
    having bool_and(expired)
  ),
  permanent as (
    select public.photo_object_ref(p.url) as r
    from (
      select m.document_photo_url as url from public.medical_records m
      union all
      select i.photo_url from public.inventory_items i
      union all
      select a.photo_url from public.inventory_audit_logs a
      union all
      select v #>> '{}'
      from public.task_entities e,
           jsonb_path_query(e.metadata, 'strict $.** ? (@.type() == "string")') as v
    ) p
    where p.url is not null
  ),
  -- Food still listed, or finished less than a day ago (Undo), keeps its
  -- photo whichever branch would otherwise take it (Codex review, PR #10).
  food_kept as (
    select (public.photo_object_ref(f.photo_url))[2] as object_name
    from public.food_items f
    where f.photo_url is not null
      and (f.finished_at is null or f.finished_at >= food_cutoff)
  ),
  task_due as (
    select o.name, (o.metadata->>'size')::bigint as size, o.created_at
    from due d
    join storage.objects o on o.bucket_id = 'household-logs' and o.name = d.object_name
    where not exists (
      select 1 from permanent pm
      where pm.r is not null and pm.r[1] = 'household-logs' and pm.r[2] = d.object_name
    )
      and not exists (select 1 from food_kept k where k.object_name = d.object_name)
  ),
  -- Anything else that still needs the object protects it too (Codex review,
  -- PR #10): the folder is a convention, a reference is a fact. Permanent
  -- references, and task photos still inside their window.
  still_needed as (
    select pm.r[2] as object_name from permanent pm
    where pm.r is not null and pm.r[1] = 'household-logs'
    union all
    select rf.r[2] from refs rf
    where rf.r is not null and rf.r[1] = 'household-logs' and not rf.expired
  ),
  food_due as (
    select o.name, (o.metadata->>'size')::bigint as size, o.created_at
    from storage.objects o
    where o.bucket_id = 'household-logs'
      and o.name ~ '^[0-9a-f-]{36}/food/'
      and o.created_at < food_cutoff
      and not exists (select 1 from food_kept k where k.object_name = o.name)
      and not exists (select 1 from still_needed sn where sn.object_name = o.name)
      -- Never twice in one answer: task_due may already list it.
      and not exists (select 1 from task_due td where td.name = o.name)
  ),
  -- Photos under <household>/repairs/ that no repair points at any more —
  -- a repair deleted while the Storage delete failed, or an abandoned
  -- report's upload — once over a day old, like food's.
  repairs_due as (
    select o.name, (o.metadata->>'size')::bigint as size, o.created_at
    from storage.objects o
    where o.bucket_id = 'household-logs'
      and o.name ~ '^[0-9a-f-]{36}/repairs/'
      and o.created_at < food_cutoff
      and not exists (
        select 1 from public.repairs rp
         where (public.photo_object_ref(rp.photo_url))[1] = 'household-logs'
           and (public.photo_object_ref(rp.photo_url))[2] = o.name
      )
      and not exists (select 1 from still_needed sn where sn.object_name = o.name)
      and not exists (select 1 from task_due td where td.name = o.name)
      and not exists (select 1 from food_due fd where fd.name = o.name)
  )
  select x.name, x.size, x.created_at
  from (select * from task_due union all select * from food_due union all select * from repairs_due) x
  order by x.created_at
  limit greatest(p_limit, 0);
end;
$$;
revoke all on function public.task_photos_due_for_pruning(text, int) from public, anon, authenticated;
grant execute on function public.task_photos_due_for_pruning(text, int) to service_role;

-- 123's function, plus clearing a couldn't-do photo whose file is gone.
create or replace function public.forget_missing_task_photos(p_secret text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  cutoff timestamptz := public.task_photo_retention_cutoff();
  food_cutoff timestamptz := public.food_photo_keep_cutoff();
  logs_cleared int;
  tasks_cleared int;
  food_cleared int;
  exceptions_cleared int;
begin
  perform public.assert_task_photo_retention_secret(p_secret);

  update public.task_logs l
  set photo_url = null
  where l.completed_at < cutoff
    and (public.photo_object_ref(l.photo_url))[1] = 'household-logs'
    and not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'household-logs'
        and o.name = (public.photo_object_ref(l.photo_url))[2]
    );
  get diagnostics logs_cleared = row_count;

  -- One pass per column would be three scans; this nulls whichever of the
  -- three point at a missing object and leaves the rest as they are.
  update public.household_tasks t
  set photo_url = case when public.photo_object_ref(t.photo_url) is not null
                        and not exists (select 1 from storage.objects o where o.bucket_id = 'household-logs'
                                        and o.name = (public.photo_object_ref(t.photo_url))[2])
                       then null else t.photo_url end,
      before_photo_url = case when public.photo_object_ref(t.before_photo_url) is not null
                        and not exists (select 1 from storage.objects o where o.bucket_id = 'household-logs'
                                        and o.name = (public.photo_object_ref(t.before_photo_url))[2])
                       then null else t.before_photo_url end,
      after_photo_url = case when public.photo_object_ref(t.after_photo_url) is not null
                        and not exists (select 1 from storage.objects o where o.bucket_id = 'household-logs'
                                        and o.name = (public.photo_object_ref(t.after_photo_url))[2])
                       then null else t.after_photo_url end
  where t.completed_at < cutoff
    and exists (
      select 1
      from unnest(array[t.photo_url, t.before_photo_url, t.after_photo_url]) u
      where (public.photo_object_ref(u))[1] = 'household-logs'
        and not exists (select 1 from storage.objects o where o.bucket_id = 'household-logs'
                        and o.name = (public.photo_object_ref(u))[2])
    );
  get diagnostics tasks_cleared = row_count;

  -- Finished food whose photo is gone. Listed food is never touched, even if
  -- its object went missing some other way.
  update public.food_items f
  set photo_url = null
  where f.finished_at < food_cutoff
    and (public.photo_object_ref(f.photo_url))[1] = 'household-logs'
    and not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'household-logs'
        and o.name = (public.photo_object_ref(f.photo_url))[2]
    );
  get diagnostics food_cleared = row_count;

  -- Couldn't-do photos past their 30 days whose file is gone (migrations/139).
  update public.task_exceptions x
  set photo_url = null
  where x.created_at < cutoff
    and (public.photo_object_ref(x.photo_url))[1] = 'household-logs'
    and not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'household-logs'
        and o.name = (public.photo_object_ref(x.photo_url))[2]
    );
  get diagnostics exceptions_cleared = row_count;

  return logs_cleared + tasks_cleared + food_cleared + exceptions_cleared;
end;
$$;
revoke all on function public.forget_missing_task_photos(text) from public, anon, authenticated;
grant execute on function public.forget_missing_task_photos(text) to service_role;

-- --- 10. Orphaned photos: never one a couldn't-do row points at (138's function) ------
create or replace function public.orphaned_household_photos(p_secret text, p_limit integer DEFAULT 100)
 RETURNS TABLE(bucket_id text, name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
begin
  perform public.assert_task_photo_retention_secret(p_secret);

  return query
  with candidates as (
    select o.bucket_id, o.name, o.created_at
    from storage.objects o
    where o.bucket_id in ('household-logs', 'inventory_audits', 'owner-receipts')
      and case
            when public.storage_object_household(o.name) is not null then
              not exists (select 1 from public.households h
                           where h.id = public.storage_object_household(o.name))
            -- The oldest uploads have no household folder; the storage
            -- policies (migration 092) give them to this household.
            else
              not exists (select 1 from public.households h
                           where h.id = '975f0914-4d0d-43ad-8dee-a967d9bd10cd')
          end
  ),
  -- Insurance: a file any remaining row still points at is never listed.
  live_refs as (
    select public.photo_object_ref(u) as r
    from (
      select l.photo_url as u from public.task_logs l
      union all
      select unnest(array[t.photo_url, t.before_photo_url, t.after_photo_url]) from public.household_tasks t
      union all
      select m.document_photo_url from public.medical_records m
      union all
      select i.photo_url from public.inventory_items i
      union all
      select a.photo_url from public.inventory_audit_logs a
      union all
      select f.photo_url from public.food_items f
      union all
      select rp.photo_url from public.repairs rp
      union all
      select n.photo_url from public.repair_notes n
      union all
      select c.receipt_url from public.repair_costs c
      union all
      select bp.receipt_url from public.bill_payments bp
      union all
      select x.photo_url from public.task_exceptions x
      union all
      select v #>> '{}'
      from public.task_entities e,
           jsonb_path_query(e.metadata, 'strict $.** ? (@.type() == "string")') as v
    ) x
    where x.u is not null
  )
  select c.bucket_id, c.name
  from candidates c
  where not exists (
    select 1 from live_refs lr
     where lr.r is not null and lr.r[1] = c.bucket_id and lr.r[2] = c.name
  )
  order by c.created_at
  limit greatest(p_limit, 0);
end;
$$;
revoke all on function public.orphaned_household_photos(text, int) from public, anon, authenticated;
grant execute on function public.orphaned_household_photos(text, int) to service_role;

-- --- 11. The export includes them (138's function, plus 'couldnt_do') ------------------
create or replace function public.export_household_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  uid uuid := auth.uid();
  hh uuid := public.caller_admin_household();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if hh is null then
    raise exception 'admins_only' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'format', 'miamus-household-export/1',
    'exported_at', now(),
    'household', (
      select jsonb_build_object('id', h.id, 'name', h.name, 'created_at', h.created_at)
      from public.households h where h.id = hh
    ),
    'admins', coalesce((
      select jsonb_agg(jsonb_build_object(
        'email', u.email, 'role', m.role, 'joined_at', m.created_at,
        'founder', h.owner_auth_id is not distinct from m.user_id
      ) order by m.created_at)
      from public.household_members m
      join auth.users u on u.id = m.user_id
      join public.households h on h.id = m.household_id
      where m.household_id = hh
    ), '[]'::jsonb),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'created_at', s.created_at,
        'archived_at', s.archived_at, 'has_pin', s.has_pin,
        -- Admins get a profile too, so chores can be assigned to them (106).
        'is_admin', s.user_id is not null
      ) order by s.created_at)
      from public.staff_profiles s where s.household_id = hh
    ), '[]'::jsonb),
    'pets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'type', e.entity_type, 'name', e.name, 'icon', e.icon,
        'status', e.status, 'details', e.metadata, 'created_at', e.created_at
      ) order by e.created_at)
      from public.task_entities e where e.household_id = hh
    ), '[]'::jsonb),
    'routines', coalesce((
      select jsonb_agg(to_jsonb(ms) order by ms.created_at)
      from public.master_schedules ms
      join public.task_entities e on e.id = ms.entity_id
      where e.household_id = hh
    ), '[]'::jsonb),
    'logs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'pet_id', l.entity_id, 'routine_id', l.schedule_id,
        'module', l.module, 'kind', l.sub_type, 'notes', l.notes,
        'completed_at', l.completed_at, 'staff', s.name,
        'photo', (public.photo_object_ref(l.photo_url))[1] || '/' || (public.photo_object_ref(l.photo_url))[2]
      ) order by l.completed_at)
      from public.task_logs l
      join public.task_entities e on e.id = l.entity_id
      left join public.staff_profiles s on s.id = l.staff_id
      where e.household_id = hh
    ), '[]'::jsonb),
    -- Tasks someone said couldn't be done (migrations/139).
    'couldnt_do', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'chore_id', x.chore_id, 'routine_id', x.schedule_id, 'pet_id', x.entity_id,
        'task', coalesce(t.title, ms.title), 'day', x.occurs_on, 'slot', x.slot_time,
        'reason', x.reason, 'note', x.note, 'shopping_item_id', x.inventory_item_id,
        'staff', s.name, 'at', x.created_at,
        'photo', (public.photo_object_ref(x.photo_url))[1] || '/' || (public.photo_object_ref(x.photo_url))[2]
      ) order by x.created_at)
      from public.task_exceptions x
      left join public.household_tasks t on t.id = x.chore_id
      left join public.master_schedules ms on ms.id = x.schedule_id
      left join public.staff_profiles s on s.id = x.staff_id
      where x.household_id = hh
    ), '[]'::jsonb),
    'health_records', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at)
      from public.medical_records r
      join public.task_entities e on e.id = r.entity_id
      where e.household_id = hh
    ), '[]'::jsonb),
    'routine_suggestions', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.created_at)
      from public.routine_proposals p
      join public.task_entities e on e.id = p.pet_id
      where e.household_id = hh
    ), '[]'::jsonb),
    'chores', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.created_at)
      from public.household_tasks t where t.household_id = hh
    ), '[]'::jsonb),
    'rooms', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at)
      from public.household_locations r where r.household_id = hh
    ), '[]'::jsonb),
    'supplies', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.created_at)
      from public.inventory_items i where i.household_id = hh
    ), '[]'::jsonb),
    'stock_counts', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at)
      from public.inventory_audit_logs a
      join public.inventory_items i on i.id = a.item_id
      where i.household_id = hh
    ), '[]'::jsonb),
    'shopping_list', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at)
      from public.inventory_alerts a where a.household_id = hh
    ), '[]'::jsonb),
    'repairs', coalesce((
      select jsonb_agg(to_jsonb(rp) order by rp.created_at)
      from public.repairs rp where rp.household_id = hh
    ), '[]'::jsonb),
    'repair_costs', coalesce((
      select jsonb_agg(to_jsonb(rc) order by rc.repair_id)
      from public.repair_costs rc where rc.household_id = hh
    ), '[]'::jsonb),
    'bill_payments', coalesce((
      select jsonb_agg(to_jsonb(bp) order by bp.paid_at)
      from public.bill_payments bp where bp.household_id = hh
    ), '[]'::jsonb),
    'repair_notes', coalesce((
      select jsonb_agg(to_jsonb(rn) order by rn.created_at)
      from public.repair_notes rn where rn.household_id = hh
    ), '[]'::jsonb),
    'food', coalesce((
      select jsonb_agg(to_jsonb(f) order by f.created_at)
      from public.food_items f where f.household_id = hh
    ), '[]'::jsonb),
    'leave', coalesce((
      select jsonb_agg(to_jsonb(lr) order by lr.created_at)
      from public.leave_requests lr where lr.household_id = hh
    ), '[]'::jsonb),
    'feedback', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', fb.id, 'category', fb.category, 'message', fb.message,
        'page', fb.page, 'app_version', fb.app_version, 'sent_at', fb.created_at,
        'staff', s.name, 'from_admin', fb.staff_id is null
      ) order by fb.created_at)
      from public.feedback fb
      left join public.staff_profiles s on s.id = fb.staff_id
      where fb.household_id = hh
    ), '[]'::jsonb),
    'linked_phones', coalesce((
      select jsonb_agg(jsonb_build_object('linked_at', d.created_at, 'last_seen_at', d.last_seen_at)
                       order by d.created_at)
      from public.device_sessions d where d.household_id = hh
    ), '[]'::jsonb),
    'staff_sign_in_attempts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'at', a.created_at, 'kind', a.kind, 'success', a.success, 'staff', s.name
      ) order by a.created_at)
      from public.staff_sign_in_attempts a
      left join public.staff_profiles s on s.id = a.staff_id
      where a.household_id = hh
    ), '[]'::jsonb),
    'my_language', (select p.locale from public.user_preferences p where p.user_id = uid),
    'my_notifications', (
      select jsonb_build_object('evening_summary_hour', pr.evening_summary_hour,
                                'staff_requests', pr.staff_request_pushes)
      from public.notification_prefs_of(uid) pr
    )
  );
end;
$$;
revoke all on function public.export_household_data() from public, anon;
grant execute on function public.export_household_data() to authenticated;
