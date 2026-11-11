-- ============================================================================
-- 152 — Owner pushes for walk-in repairs, and the supervising summary
--       (Phase 174, PR B)
-- ============================================================================
-- docs/phase-174-repairs-walkin-plan.md; owner decisions (2026-11-11): A for
-- D1–D12. Built on 149 (repair_visits, repair_supervision) and 150 (the
-- newest push code). Nothing here depends on 151.
--
--   D4  A push to every owner when staff log a repair person arriving, and
--       one when the visit is finished (Selesai), each on by default and
--       switchable per owner, none 21.00–06.00 Jakarta, none while Repairs
--       is off (145). Composed here in each owner's language:
--         Repair person here                 Tukang datang
--         Pak Budi · Leaking tap · LT2 · Kamar Tamu 1 (Ari)
--         Repair finished                    Perbaikan selesai
--         Keran bocor · Pak Budi · Done · 2 photos: before and after
--       Tag repair-visit-<id>: the finish push replaces the arrival push on
--       the phone.
--   D10 The evening summary explains a task missed while someone was
--       supervising a repair: it stays in "Not done", with the stretch in
--       brackets, once per stretch:
--         Not done: Mop the terrace and Iron clothes (Ari was supervising
--         a repair: AC menetes, 10:00 AM–1:30 PM).
--         Belum: Pel teras dan Setrika baju (Ari mengawasi perbaikan:
--         AC menetes, 10.00–13.30).
--       The SQL twin of supervisionExplains (src/lib/repair-walkins.ts):
--       an open task with a time, due by now, inside the person's stretch
--       (from 15 minutes before it started until it ended, or now). A task
--       for one person: that person's stretch. A task for anyone (and a
--       routine with no person, or whose person is on leave): only when
--       every staff member on duty (not an admin, not removed, not on
--       leave) was supervising then. Never while Repairs is off.
--
-- NEW
--   user_preferences.repair_arrival_pushes / .repair_done_pushes
--        boolean, default true. my_repair_push_prefs() and
--        set_my_repair_push_prefs() read and write them, as 139's pair; never
--        for a staff phone's anonymous session. Separate functions, so 139's
--        my_notification_prefs keeps its return type and old app builds
--        keep working.
--   repair_visit_push_sent   one row per (walk-in, push) once it is claimed,
--        so a resend, an Undo and a second Selesai, or two owners editing,
--        never push twice. Internal: no client role reads or writes it. Goes
--        with its walk-in (cascade).
--   repair_push_prefs_of(user)          an owner's two switches (internal).
--   queue_repair_visit_push(...)        queue_owner_push (114) with the
--        owner's switch: one push per owner with a device, in their language.
--   notify_repair_visit()               the trigger, after insert or finish.
--   supervision_stretch_at / staff_on_leave_on / supervision_explains /
--   supervision_label                   the twin of supervisionExplains and
--        the bracket text (internal, service_role only).
--
-- RE-CREATED, from its newest definition (139; 145 and 150 left it alone)
--   notify_evening_summary   explained not-done items grouped by stretch.
--        Same signature, not SECURITY DEFINER, service_role only, same cron.
--
-- NOT RE-CREATED
--   export_household_data (149). The two switches are settings, not a new
--        kind of personal data; 151 (kitchen recipes, built in parallel) may
--        re-create the export, so 152 leaves it alone to never undo 151.
--        Add them to 'my_notifications' the next time the export changes.
--
-- SECURITY. my_repair_push_prefs / set_my_repair_push_prefs are SECURITY
-- DEFINER, act only on auth.uid()'s own row, refuse anonymous (staff phone)
-- sessions, revoke EXECUTE from public and anon and grant authenticated.
-- Every other function here revokes EXECUTE from public, anon and
-- authenticated (the trigger fires without it) and grants service_role.
-- Empty search_path everywhere.
--
-- Privacy policy: 149 already says owners are told when someone arrives and
-- when the work is finished; no new data, no new service. Additive: two
-- columns with defaults, one table, new functions, one trigger, one
-- re-created function.
-- ============================================================================

-- --- 1. Each owner's two switches ----------------------------------------------------------
alter table public.user_preferences
  add column if not exists repair_arrival_pushes boolean not null default true,
  add column if not exists repair_done_pushes boolean not null default true;

-- An account with no row yet has the defaults (both on).
create or replace function public.repair_push_prefs_of(p_user uuid)
returns table (repair_arrival_pushes boolean, repair_done_pushes boolean)
language sql
stable
set search_path = ''
as $$
  select coalesce(p.repair_arrival_pushes, true), coalesce(p.repair_done_pushes, true)
    from (select p_user as uid) x
    left join public.user_preferences p on p.user_id = x.uid;
$$;

create or replace function public.my_repair_push_prefs()
returns table (repair_arrival_pushes boolean, repair_done_pushes boolean)
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
  return query select * from public.repair_push_prefs_of(uid);
end;
$$;

create or replace function public.set_my_repair_push_prefs(p_arrival boolean, p_done boolean)
returns table (repair_arrival_pushes boolean, repair_done_pushes boolean)
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
  if p_arrival is null or p_done is null then
    raise exception 'switches must be true or false' using errcode = '22023';
  end if;

  -- Keeps the language already chosen (as 139's set_my_notification_prefs).
  insert into public.user_preferences (user_id, locale, repair_arrival_pushes, repair_done_pushes, updated_at)
  values (uid, public.locale_of(uid), p_arrival, p_done, now())
  on conflict (user_id) do update
    set repair_arrival_pushes = excluded.repair_arrival_pushes,
        repair_done_pushes = excluded.repair_done_pushes,
        updated_at = excluded.updated_at;
  return query select * from public.repair_push_prefs_of(uid);
end;
$$;

revoke all on function public.repair_push_prefs_of(uuid) from public, anon, authenticated;
grant execute on function public.repair_push_prefs_of(uuid) to service_role;
revoke all on function public.my_repair_push_prefs() from public, anon;
revoke all on function public.set_my_repair_push_prefs(boolean, boolean) from public, anon;
grant execute on function public.my_repair_push_prefs() to authenticated;
grant execute on function public.set_my_repair_push_prefs(boolean, boolean) to authenticated;

-- --- 2. What was sent -------------------------------------------------------------------------
create table if not exists public.repair_visit_push_sent (
  visit_id uuid not null,
  household_id uuid not null references public.households (id) on delete cascade,
  push text not null,
  sent_at timestamptz not null default now(),
  constraint repair_visit_push_sent_push_check check (push in ('arrival', 'done')),
  constraint repair_visit_push_sent_visit_fkey foreign key (visit_id, household_id)
    references public.repair_visits (id, household_id) on delete cascade,
  primary key (visit_id, push)
);
-- Every foreign key covered (134's rule); the primary key leads with visit_id.
create index if not exists repair_visit_push_sent_household_idx on public.repair_visit_push_sent (household_id);

alter table public.repair_visit_push_sent enable row level security;
revoke all on public.repair_visit_push_sent from public, anon, authenticated;
grant select, insert, update, delete on public.repair_visit_push_sent to service_role;

-- --- 3. The sender ----------------------------------------------------------------------------
-- queue_owner_push (114) with each owner's switch for this push: one push per
-- owner of the household with a device, in their language, never the session
-- that made the change. True if any was queued.
create or replace function public.queue_repair_visit_push(
  p_household_id uuid,
  p_push text,
  p_title_en text,
  p_body_en text,
  p_title_id text,
  p_body_id text,
  p_url text,
  p_tag text,
  p_exclude_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_row record;
  queued boolean := false;
begin
  for owner_row in
    select distinct m.user_id
      from public.household_members m
     where m.household_id = p_household_id
       and (p_exclude_user_id is null or m.user_id <> p_exclude_user_id)
       and exists (
         select 1 from public.push_subscriptions s
          where s.household_id = p_household_id and s.user_id = m.user_id
       )
       and (
         select case when p_push = 'arrival' then pr.repair_arrival_pushes else pr.repair_done_pushes end
           from public.repair_push_prefs_of(m.user_id) pr
       )
  loop
    if public.locale_of(owner_row.user_id) = 'id' then
      queued := public.queue_push(
        p_household_id, 'owner', p_title_id, p_body_id, p_url, p_tag, owner_row.user_id, null
      ) or queued;
    else
      queued := public.queue_push(
        p_household_id, 'owner', p_title_en, p_body_en, p_url, p_tag, owner_row.user_id, null
      ) or queued;
    end if;
  end loop;
  return queued;
end;
$$;

revoke all on function public.queue_repair_visit_push(uuid, text, text, text, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.queue_repair_visit_push(uuid, text, text, text, text, text, text, text, uuid)
  to service_role;

-- --- 4. The trigger ---------------------------------------------------------------------------
-- After a walk-in is logged, and after its Selesai reaches the server.
-- Skipped, and nothing claimed:
--   - no session (service role, maintenance), as 130's urgent-repair push;
--   - Repairs switched off (145): the walk-in is saved, without a push;
--   - quiet hours, 21.00–06.00 Jakarta (141's staff_push_quiet): owners
--     have no quiet hours of their own yet, and a repair push is never
--     worth waking them for;
--   - an arrival saved without signal and sent more than 30 minutes after
--     the phone's time: the person may have left already, and the finish
--     push still comes (fewer pushes, "you only hear what didn't happen").
-- Claimed in repair_visit_push_sent before it is queued, in the same
-- transaction, so it goes once per walk-in and push: an Undo of Selesai and
-- a second Selesai, or a resend from the save queue, sends nothing new.
-- A push that fails never blocks the save.
create or replace function public.notify_repair_visit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  kind text;
  repair_title text;
  place text;
  staff_name text;
  worker text := nullif(btrim(new.worker_name), '');
  body text;
  done_en text;
  done_id text;
begin
  if tg_op = 'INSERT' then
    kind := 'arrival';
  elsif old.after_photo_url is null and new.after_photo_url is not null then
    kind := 'done';
  else
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;
  if kind = 'arrival' and new.arrived_phone_at is not null
     and new.arrived_phone_at < now() - interval '30 minutes' then
    return new;
  end if;

  begin
    if not public.household_feature_on(new.household_id, 'repairs') or public.staff_push_quiet(now()) then
      return new;
    end if;

    insert into public.repair_visit_push_sent (visit_id, household_id, push)
    values (new.id, new.household_id, kind)
    on conflict do nothing;
    if not found then
      return new;
    end if;

    select r.title, public.repair_place_label(r.location_id, r.spot)
      into repair_title, place
      from public.repairs r
     where r.id = new.repair_id and r.household_id = new.household_id;

    if kind = 'arrival' then
      if new.logged_by_staff is not null then
        select s.name into staff_name from public.staff_profiles s where s.id = new.logged_by_staff;
      end if;
      -- Names and titles are as typed, the same in both languages.
      body := concat_ws(' · ', worker, repair_title, place) || coalesce(' (' || staff_name || ')', '');
      perform public.queue_repair_visit_push(
        new.household_id, 'arrival',
        'Repair person here', body,
        'Tukang datang', body,
        '/dashboard?module=chores&chores=repairs', 'repair-visit-' || new.id::text,
        auth.uid()
      );
    else
      -- The chips as owners read them (ownerOutcomeLabel, src/lib/repair-walkins.ts).
      done_en := concat_ws(' · ', repair_title, worker,
        case new.outcome when 'fixed' then 'Done' when 'come_back' then 'Coming back' when 'check' then 'Please check' end,
        -- Both photos are required (149): one before, one after.
        '2 photos: before and after');
      done_id := concat_ws(' · ', repair_title, worker,
        case new.outcome when 'fixed' then 'Sudah beres' when 'come_back' then 'Akan datang lagi' when 'check' then 'Mohon dicek' end,
        '2 foto: sebelum dan sesudah');
      perform public.queue_repair_visit_push(
        new.household_id, 'done',
        'Repair finished', done_en,
        'Perbaikan selesai', done_id,
        '/dashboard?module=chores&chores=repairs', 'repair-visit-' || new.id::text,
        auth.uid()
      );
    end if;
  exception when others then
    raise warning 'Repair visit push not queued for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.notify_repair_visit() from public, anon, authenticated;
grant execute on function public.notify_repair_visit() to service_role;

drop trigger if exists notify_repair_visit on public.repair_visits;
create trigger notify_repair_visit
  after insert or update of after_photo_url on public.repair_visits
  for each row execute function public.notify_repair_visit();

-- --- 5. Supervising explains a missed task (D10) ---------------------------------------------
-- The person's stretch a moment falls inside: from 15 minutes before it
-- started until it ended, or p_now while it is open (stretchAt).
create or replace function public.supervision_stretch_at(p_household uuid, p_staff uuid, p_due timestamptz, p_now timestamptz)
returns uuid
language sql
stable
set search_path = ''
as $$
  select s.id
    from public.repair_supervision s
   where s.household_id = p_household
     and s.staff_id = p_staff
     and p_due >= s.started_at - interval '15 minutes'
     and p_due <= coalesce(s.ended_at, p_now)
   order by s.started_at
   limit 1;
$$;

-- On approved leave that day (leaveCovering, src/lib/leave.ts; 137's rule).
create or replace function public.staff_on_leave_on(p_staff uuid, p_day date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.leave_requests l
     where l.staff_id = p_staff
       and l.status in ('approved', 'ended_early')
       and p_day between l.start_date and l.end_date
       and (l.ended_on is null or p_day < l.ended_on)
  );
$$;

-- The stretch that explains a missed task, or null: supervisionExplains.
-- p_staff is who the task is for after leave (null: anyone). Someone no
-- longer on the roster counts as anyone, as staff progress reads it.
create or replace function public.supervision_explains(
  p_household uuid, p_staff uuid, p_day date, p_time time, p_now timestamptz
)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  due timestamptz;
  person record;
  found_id uuid;
  first_id uuid;
  people int := 0;
begin
  if p_time is null then
    return null;
  end if;
  due := (p_day + p_time) at time zone 'Asia/Jakarta';
  if due > p_now or not public.household_feature_on(p_household, 'repairs') then
    return null;
  end if;
  if not exists (select 1 from public.repair_supervision s where s.household_id = p_household) then
    return null;
  end if;

  if p_staff is not null and exists (
    select 1 from public.staff_profiles s
     where s.id = p_staff and s.household_id = p_household and s.archived_at is null
  ) then
    return public.supervision_stretch_at(p_household, p_staff, due, p_now);
  end if;

  -- Anyone: every staff member on duty that day was supervising then.
  for person in
    select s.id
      from public.staff_profiles s
     where s.household_id = p_household
       and s.user_id is null
       and s.archived_at is null
       and not public.staff_on_leave_on(s.id, p_day)
     order by s.created_at, s.id
  loop
    people := people + 1;
    found_id := public.supervision_stretch_at(p_household, person.id, due, p_now);
    if found_id is null then
      return null;
    end if;
    if first_id is null then
      first_id := found_id;
    end if;
  end loop;
  return case when people = 0 then null else first_id end;
end;
$$;

-- The bracket text: "Ari was supervising a repair: AC menetes, 10:00 AM–1:30 PM"
-- / "Ari mengawasi perbaikan: AC menetes, 10.00–13.30"; "since 10:00 AM" /
-- "sejak 10.00" while it is still open at p_now.
create or replace function public.supervision_label(p_stretch uuid, p_locale text, p_now timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_locale = 'id' then
      coalesce(sp.name, 'Staf') || ' mengawasi perbaikan' || coalesce(': ' || nullif(btrim(r.title), ''), '') || ', '
      || case when s.ended_at is null or s.ended_at > p_now
              then 'sejak ' || public.push_time_label((s.started_at at time zone 'Asia/Jakarta')::time, 'id')
              else public.push_time_label((s.started_at at time zone 'Asia/Jakarta')::time, 'id') || '–'
                   || public.push_time_label((s.ended_at at time zone 'Asia/Jakarta')::time, 'id') end
    else
      coalesce(sp.name, 'Staff')
      || case when s.ended_at is null or s.ended_at > p_now then ' is supervising a repair' else ' was supervising a repair' end
      || coalesce(': ' || nullif(btrim(r.title), ''), '') || ', '
      || case when s.ended_at is null or s.ended_at > p_now
              then 'since ' || public.push_time_label((s.started_at at time zone 'Asia/Jakarta')::time, 'en')
              else public.push_time_label((s.started_at at time zone 'Asia/Jakarta')::time, 'en') || '–'
                   || public.push_time_label((s.ended_at at time zone 'Asia/Jakarta')::time, 'en') end
  end
    from public.repair_supervision s
    join public.repair_visits v on v.id = s.visit_id and v.household_id = s.household_id
    join public.repairs r on r.id = v.repair_id and r.household_id = v.household_id
    left join public.staff_profiles sp on sp.id = s.staff_id
   where s.id = p_stretch;
$$;

revoke all on function public.supervision_stretch_at(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.staff_on_leave_on(uuid, date) from public, anon, authenticated;
revoke all on function public.supervision_explains(uuid, uuid, date, time, timestamptz) from public, anon, authenticated;
revoke all on function public.supervision_label(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.supervision_stretch_at(uuid, uuid, timestamptz, timestamptz) to service_role;
grant execute on function public.staff_on_leave_on(uuid, date) to service_role;
grant execute on function public.supervision_explains(uuid, uuid, date, time, timestamptz) to service_role;
grant execute on function public.supervision_label(uuid, text, timestamptz) to service_role;

-- --- 6. The evening summary, re-created from 139 ----------------------------------------------
-- As 139, plus: a not-done chore or routine slot that supervising explains
-- carries its stretch, and "Not done" lists the plain ones first, then each
-- stretch's tasks with the stretch in brackets, groups split by "; ".
-- Couldn't-do items are never explained (staff said why themselves).
-- Routines are for their person (master_schedules.staff_id, 144) unless that
-- person is on leave, as staff progress reads them; otherwise anyone.
create or replace function public.notify_evening_summary(p_now timestamptz default null)
returns int
language plpgsql
set search_path = ''
as $$
declare
  now_at timestamptz := coalesce(p_now, now());
  at_jakarta timestamp := (coalesce(p_now, now()) at time zone 'Asia/Jakarta');
  today date := at_jakarta::date;
  hour_now int := extract(hour from at_jakarta)::int;
  until_time time := at_jakarta::time;
  admin record;
  grp record;
  locale text;
  couldnt text[];
  not_done text[];
  not_done_parts text[];
  waiting text[];
  body text;
  sent int := 0;
begin
  create temporary table if not exists pg_temp.summary_items (
    household_id uuid, for_user uuid, part text, sort_time text, label_en text, label_id text,
    stretch uuid
  ) on commit drop;
  -- A session that ran 139's version first holds the table without the
  -- column (temporary tables live until commit).
  if not exists (
    select 1 from pg_catalog.pg_attribute a
     where a.attrelid = 'pg_temp.summary_items'::regclass and a.attname = 'stretch' and not a.attisdropped
  ) then
    alter table pg_temp.summary_items add column stretch uuid;
  end if;
  truncate pg_temp.summary_items;

  -- Chores: open today, couldn't-do ones whatever their time; the rest only
  -- once due (no time, or a time before now).
  insert into pg_temp.summary_items (household_id, for_user, part, sort_time, label_en, label_id, stretch)
  select c.household_id, am.user_id,
         case when x.id is not null then 'couldnt' else 'not_done' end,
         c.due_time,
         c.title || coalesce(' (' || public.exception_reason_label(x.reason, false, 'en') || ')', ''),
         c.title || coalesce(' (' || public.exception_reason_label(x.reason, false, 'id') || ')', ''),
         case when x.id is null and c.due_time ~ '^\d{2}:\d{2}'
              then public.supervision_explains(c.household_id, c.assignee, today, left(c.due_time, 5)::time, now_at) end
    from public.chore_days_open(today) c
    left join public.task_exceptions x on x.chore_id = c.chore_id and x.occurs_on = today
    left join public.staff_profiles p on p.id = c.assignee and p.household_id = c.household_id
    left join public.household_members am on am.household_id = c.household_id and am.user_id = p.user_id
   where x.id is not null or c.due_time is null or c.due_time <= to_char(until_time, 'HH24:MI');

  -- Routine slots, the same way. Every admin.
  insert into pg_temp.summary_items (household_id, for_user, part, sort_time, label_en, label_id, stretch)
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
                else ' ' || public.push_time_label(r.slot_time, 'id') end,
         case when x.id is null then public.supervision_explains(
           r.household_id,
           case when ms.staff_id is not null and not public.staff_on_leave_on(ms.staff_id, today) then ms.staff_id end,
           today, r.slot_time, now_at) end
    from public.routine_slots_open(today) r
    left join public.master_schedules ms on ms.id = r.schedule_id
    left join public.task_exceptions x
      on x.schedule_id = r.schedule_id and x.entity_id = r.entity_id
     and x.occurs_on = today and x.slot_time = r.slot_time
   where x.id is not null or r.slot_time <= until_time;

  -- Waiting for an admin: pending leave (not already over) and suggestions.
  insert into pg_temp.summary_items (household_id, for_user, part, sort_time, label_en, label_id)
  select l.household_id, null, 'waiting', null,
         coalesce(s.name, 'Staff') || '''s leave', 'cuti ' || coalesce(s.name, 'staf')
    from public.leave_requests l
    left join public.staff_profiles s on s.id = l.staff_id
   where l.status = 'pending' and l.end_date >= today;

  insert into pg_temp.summary_items (household_id, for_user, part, sort_time, label_en, label_id)
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
          filter (where i.part = 'not_done' and i.stretch is null),
        array_agg(case when locale = 'id' then i.label_id else i.label_en end order by i.label_en)
          filter (where i.part = 'waiting')
        into couldnt, not_done, waiting
        from pg_temp.summary_items i
       where i.household_id = admin.household_id and (i.for_user is null or i.for_user = admin.user_id);

      -- "Not done": the plain ones, then one group per stretch, earliest first.
      not_done_parts := case when not_done is not null
                             then array[public.chore_due_titles(not_done, locale)] else array[]::text[] end;
      for grp in
        select i.stretch,
               min(s.started_at) as started,
               array_agg(case when locale = 'id' then i.label_id else i.label_en end
                         order by i.sort_time nulls first, i.label_en) as titles
          from pg_temp.summary_items i
          left join public.repair_supervision s on s.id = i.stretch
         where i.household_id = admin.household_id and (i.for_user is null or i.for_user = admin.user_id)
           and i.part = 'not_done' and i.stretch is not null
         group by i.stretch
         order by 2
      loop
        not_done_parts := not_done_parts || (
          public.chore_due_titles(grp.titles, locale)
          || coalesce(' (' || public.supervision_label(grp.stretch, locale, now_at) || ')', '')
        );
      end loop;

      body := concat_ws(' ',
        case when couldnt is not null then
          case when locale = 'id' then 'Tidak bisa: ' else 'Couldn''t: ' end
          || public.chore_due_titles(couldnt, locale) || '.' end,
        case when cardinality(not_done_parts) > 0 then
          case when locale = 'id' then 'Belum: ' else 'Not done: ' end
          || array_to_string(not_done_parts, '; ') || '.' end,
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
-- The cron job (139, notify-evening-summary, 0 11-14 * * *) calls it by name
-- and stays as it is.
