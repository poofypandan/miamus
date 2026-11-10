-- ============================================================================
-- 141 — Notifications on staff phones (Phase 166)
-- ============================================================================
-- docs/phase-166-staff-notifications-plan.md; owner decisions (2026-11-10):
-- A for D1–D11. Staff phones get a push for four things only, and only when
-- an admin acts: a new task for them today, a task moved to them (or its time
-- changed today, or leave cover), the admin's answer to their leave request
-- or schedule suggestion, and a repair they reported being fixed or not
-- needed. Never 21.00–06.00 in Jakarta, never reminders, never about another
-- day. The plan reserved 140; 140 became rooms inside rooms, so this is 141.
--
-- NEW
--   staff_push_people          one row per (phone, person) who turned
--        notifications on there. Keyed on the phone's session
--        (device_sessions.user_id), not the endpoint, so a renewed
--        subscription keeps it; it goes with the phone (unlink, archive, the
--        7-day prune) or the household. Read and written only by the
--        functions below.
--   households.staff_push      the owner's switch (D8), on by default.
--   my_phone_push_people()     a staff phone: who it notifies, whether it is
--        shared, and whether the household's switch is on.
--   set_my_push_person()       a staff phone adds or removes a person (D6):
--        adding needs this phone's latest PIN sign-in to be that person, or
--        their PIN (verify_staff_pin's limits). Removing needs nothing.
--   staff_push_overview()      admins: the switch, who has notifications on,
--        and which names each linked phone notifies. caller_admin_household(),
--        never get_user_household_ids() (staff phones pass that).
--   set_household_staff_push() admins: the switch.
--   staff_will_be_notified()   admins: which of these people a push would
--        reach right now (the "Sari will get a notification" toast).
--   staff_push_quiet / staff_push_phone_household / staff_push_by_admin /
--   phone_is_shared / staff_push_assignee / staff_push_chore_today /
--   queue_staff_push / queue_staff_task_push     internal.
--   notify_staff_tasks_added / notify_staff_tasks_changed (household_tasks,
--        once per statement: one push per person per save) /
--   notify_staff_leave_answered / notify_staff_proposals_answered (one push
--        per suggestion, once none of its rows is pending) /
--   notify_staff_repair_closed      the triggers.
--
-- RE-CREATED
--   export_household_data (139, its newest definition)   adds
--        household.staff_push and staff_notifications (phone number as the
--        list numbers them, names, since when; never an endpoint).
--
-- send-push, push_dispatch_plan, queue_push and sw.js are unchanged:
-- queue_push(..., p_user_id) already targets one phone, and
-- push_dispatch_plan('staff') already drops a phone that isn't linked.
--
-- Privacy policy and legal.ts updated in the same PR (new personal data:
-- staff phones' push details and which people each phone notifies).
-- Additive only: one table, one column with a default, new functions, five
-- triggers, one re-created function. Old app builds never call the new
-- functions, and the triggers only add pushes. Every SECURITY DEFINER
-- function revokes EXECUTE from public and anon; the internal ones and the
-- triggers from authenticated too.
-- ============================================================================

-- --- 1. Who each phone notifies -------------------------------------------------------
create table if not exists public.staff_push_people (
  device_user_id uuid not null references public.device_sessions (user_id) on delete cascade,
  staff_id uuid not null references public.staff_profiles (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- For the 5-minute rule on task pushes (spam guard 4).
  last_task_push_at timestamptz,
  primary key (device_user_id, staff_id)
);

-- Every foreign key covered (134's rule).
create index if not exists staff_push_people_staff_idx on public.staff_push_people (staff_id);
create index if not exists staff_push_people_household_idx on public.staff_push_people (household_id);

alter table public.staff_push_people enable row level security;
revoke all on public.staff_push_people from public, anon, authenticated;
grant select, insert, update, delete on public.staff_push_people to service_role;

-- --- 2. The owner's switch (D8) -------------------------------------------------------
alter table public.households
  add column if not exists staff_push boolean not null default true;

-- --- 3. Internal helpers --------------------------------------------------------------
-- Quiet hours, 21.00–06.00 in Jakarta (D4), like 124 and 137.
create or replace function public.staff_push_quiet(p_now timestamptz default now())
returns boolean
language sql
stable
set search_path = ''
as $$
  select extract(hour from (coalesce(p_now, now()) at time zone 'Asia/Jakarta')) >= 21
      or extract(hour from (coalesce(p_now, now()) at time zone 'Asia/Jakarta')) < 6;
$$;

-- The caller's household, refused unless the caller is a linked staff phone:
-- a device_sessions row, and never a household_members account (an admin in
-- staff view is themselves, and gets owner pushes).
create or replace function public.staff_push_phone_household()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  household uuid;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if exists (select 1 from public.household_members m where m.user_id = uid) then
    raise exception 'staff_phones_only' using errcode = '42501';
  end if;
  select d.household_id into household from public.device_sessions d where d.user_id = uid;
  if household is null then
    raise exception 'staff_phones_only' using errcode = '42501';
  end if;
  return household;
end;
$$;

-- Whether the change being made is an admin's: the session is a
-- household_members account of that household. Cron, migrations and staff
-- phones are not, so they never push staff.
create or replace function public.staff_push_by_admin(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.household_members m
     where m.user_id = auth.uid() and m.household_id = p_household_id
  );
$$;

-- A phone counts as shared (D5) when two or more people have notifications
-- on there, or two or more people signed in on it with a PIN in the last 30
-- days (staff_sign_in_attempts, kept 30 days).
create or replace function public.phone_is_shared(p_device_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.staff_push_people p
       join public.staff_profiles s on s.id = p.staff_id and s.archived_at is null
      where p.device_user_id = p_device_user_id) >= 2
    or
    (select count(distinct a.staff_id) from public.staff_sign_in_attempts a
      where a.user_id = p_device_user_id
        and a.kind = 'pin'
        and a.success
        and a.staff_id is not null
        and a.created_at > now() - interval '30 days') >= 2;
$$;

-- Who a chore on p_day is for once leave is applied, as Today does
-- (applyLeaveTriage, src/lib/leave.ts; 137's reminder): "pause" takes the day
-- off the agenda (push = false), "reassign" hands it to the cover person,
-- "unassign" makes it anyone's (assignee null).
create or replace function public.staff_push_assignee(p_household_id uuid, p_assignee uuid, p_day date)
returns table (push boolean, assignee uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select
    lv.id is null or coalesce(lv.fallback_action, 'unassign') <> 'pause',
    case
      when lv.id is null then p_assignee
      when coalesce(lv.fallback_action, 'unassign') = 'reassign' and lv.fallback_assignee_id is not null
        then lv.fallback_assignee_id
      else null
    end
  from (select 1) as one
  left join lateral (
    select l.id, l.fallback_action, l.fallback_assignee_id
      from public.leave_requests l
     where p_assignee is not null
       and l.staff_id = p_assignee
       and l.household_id = p_household_id
       and l.status in ('approved', 'ended_early')
       and p_day between l.start_date and l.end_date
       and (l.ended_on is null or p_day < l.ended_on)
     order by l.created_at
     limit 1
  ) lv on true;
$$;

-- Whether a chore row is still to do on p_day, as expandChores reads it: a
-- one-off or a written day is that day's own row; a repeat falls on the day,
-- isn't cancelled, its first day isn't done, and no written row governs it.
create or replace function public.staff_push_chore_today(p_task public.household_tasks, p_day date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_task.parent_task_id is not null or coalesce(p_task.recurrence, 'none') = 'none'
      then p_task.due_date = p_day and p_task.status = 'pending'
    else public.chore_occurs_on(p_task, p_day)
         and p_task.status <> 'cancelled'
         and (p_day <> p_task.due_date or p_task.status = 'pending')
         and not exists (
           select 1 from public.household_tasks x
            where x.parent_task_id = p_task.id and x.due_date = p_day
         )
  end;
$$;

-- One push to every linked phone with a subscription that notifies
-- p_staff_id (null: anyone on any phone's list, for a task for everyone).
-- Returns how many phones were queued: 0 when the switch is off or it's
-- quiet hours. A shared phone gets "Untuk Sari" and p_shared_body, never the
-- details (D5); a task for everyone keeps its own title there. Task pushes
-- buzz a person on a phone at most once every 5 minutes (spam guard 4).
create or replace function public.queue_staff_push(
  p_household_id uuid,
  p_staff_id uuid,
  p_title text,
  p_body text,
  p_shared_body text,
  p_url text,
  p_tag text,
  p_is_task boolean
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  phone record;
  person_name text;
  shared boolean;
  sent integer := 0;
begin
  if p_household_id is null
     or not coalesce((select h.staff_push from public.households h where h.id = p_household_id), false)
     or public.staff_push_quiet(now()) then
    return 0;
  end if;
  if p_staff_id is not null then
    -- Staff only: never an admin's roster row (106), never someone archived.
    select s.name into person_name
      from public.staff_profiles s
     where s.id = p_staff_id
       and s.household_id = p_household_id
       and s.user_id is null
       and s.archived_at is null;
    if person_name is null then
      return 0;
    end if;
  end if;

  for phone in
    select p.device_user_id, max(p.last_task_push_at) as last_push
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
     group by p.device_user_id
  loop
    if p_is_task and phone.last_push is not null and phone.last_push > now() - interval '5 minutes' then
      continue;
    end if;
    shared := public.phone_is_shared(phone.device_user_id);
    if public.queue_push(
      p_household_id,
      'staff',
      case when shared and p_staff_id is not null then 'Untuk ' || person_name else p_title end,
      case when shared then p_shared_body else p_body end,
      p_url,
      p_tag,
      phone.device_user_id,
      null
    ) then
      sent := sent + 1;
      if p_is_task then
        update public.staff_push_people p
           set last_task_push_at = now()
         where p.device_user_id = phone.device_user_id
           and (p_staff_id is null or p.staff_id = p_staff_id);
      end if;
    end if;
  end loop;
  return sent;
end;
$$;

-- A task push for one person (or everyone, p_staff_id null), in Indonesian:
--   new    Tugas baru / Tugas baru untuk semua
--   moved  Tugas untuk Anda
--   time   Jam tugas diubah
-- p_ids are this save's chores. A new-task push also lists that person's
-- other open chores for today added in the last 30 minutes, so the newest
-- push on the lock screen covers the ones before it (spam guard 3). One
-- chore shows its time: "Siram tanaman · 15.00".
create or replace function public.queue_staff_task_push(
  p_household_id uuid,
  p_staff_id uuid,
  p_ids uuid[],
  p_kind text,
  p_day date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  titles text[];
  one_time text;
  total integer;
  body text;
  title text;
  shared_body text;
  label text;
begin
  with listed as (
    select t.id, t.title, t.due_time, 0 as rank, t.created_at
      from public.household_tasks t
     where t.id = any (p_ids)
    union all
    select t.id, t.title, t.due_time, 1, t.created_at
      from public.household_tasks t
     where p_kind = 'new'
       and t.household_id = p_household_id
       and not (t.id = any (p_ids))
       and t.parent_task_id is null
       and t.assigned_to is not distinct from p_staff_id
       and t.created_at > now() - interval '30 minutes'
       and public.staff_push_chore_today(t, p_day)
  )
  select array_agg(l.title order by l.rank, l.due_time nulls first, l.created_at desc, l.title),
         count(*),
         min(l.due_time)
    into titles, total, one_time
    from listed l;

  if coalesce(total, 0) = 0 then
    return 0;
  end if;

  label := case
    when total = 1 and nullif(btrim(coalesce(one_time, '')), '') is not null
      then public.push_time_label(one_time::time, 'id')
    else null
  end;

  if p_kind = 'time' then
    title := 'Jam tugas diubah';
    body := case
      when total = 1 then titles[1] || ': ' || coalesce('sekarang ' || label, 'sekarang tanpa jam')
      else public.chore_due_titles(titles, 'id') || ': jamnya diubah'
    end;
    shared_body := 'Ada perubahan tugas hari ini.';
  elsif p_kind = 'moved' then
    title := 'Tugas untuk Anda';
    body := case
      when total = 1 then titles[1] || ' · hari ini' || coalesce(' ' || label, '')
      else public.chore_due_titles(titles, 'id')
    end;
    shared_body := 'Ada tugas baru hari ini.';
  else
    title := case when p_staff_id is null then 'Tugas baru untuk semua' else 'Tugas baru' end;
    body := case
      when total = 1 then titles[1] || coalesce(' · ' || label, '')
      else public.chore_due_titles(titles, 'id')
    end;
    shared_body := case when p_staff_id is null then 'Buka Miamus untuk melihat.' else 'Ada tugas baru hari ini.' end;
  end if;

  return public.queue_staff_push(
    p_household_id,
    p_staff_id,
    title,
    body,
    shared_body,
    case when p_staff_id is null then '/staff' else '/staff?untuk=' || p_staff_id::text end,
    'tugas-' || coalesce(p_staff_id::text, 'semua') || '-' || p_day::text,
    true
  );
end;
$$;

revoke all on function public.staff_push_quiet(timestamptz) from public, anon, authenticated;
revoke all on function public.staff_push_phone_household() from public, anon, authenticated;
revoke all on function public.staff_push_by_admin(uuid) from public, anon, authenticated;
revoke all on function public.phone_is_shared(uuid) from public, anon, authenticated;
revoke all on function public.staff_push_assignee(uuid, uuid, date) from public, anon, authenticated;
revoke all on function public.staff_push_chore_today(public.household_tasks, date) from public, anon, authenticated;
revoke all on function public.queue_staff_push(uuid, uuid, text, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.queue_staff_task_push(uuid, uuid, uuid[], text, date) from public, anon, authenticated;
grant execute on function public.staff_push_quiet(timestamptz) to service_role;
grant execute on function public.staff_push_phone_household() to service_role;
grant execute on function public.staff_push_by_admin(uuid) to service_role;
grant execute on function public.phone_is_shared(uuid) to service_role;
grant execute on function public.staff_push_assignee(uuid, uuid, date) to service_role;
grant execute on function public.staff_push_chore_today(public.household_tasks, date) to service_role;
grant execute on function public.queue_staff_push(uuid, uuid, text, text, text, text, text, boolean) to service_role;
grant execute on function public.queue_staff_task_push(uuid, uuid, uuid[], text, date) to service_role;

-- --- 4. What a staff phone calls ------------------------------------------------------
-- This phone's list: who it notifies, whether it counts as shared (the card's
-- extra line), and whether the household's switch is on.
create or replace function public.my_phone_push_people()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  household uuid := public.staff_push_phone_household();
begin
  return jsonb_build_object(
    'people', coalesce((
      select jsonb_agg(jsonb_build_object('staff_id', p.staff_id, 'name', s.name) order by p.created_at)
        from public.staff_push_people p
        join public.staff_profiles s on s.id = p.staff_id and s.archived_at is null
       where p.device_user_id = uid and p.household_id = household
    ), '[]'::jsonb),
    'shared', public.phone_is_shared(uid),
    'household_on', coalesce((select h.staff_push from public.households h where h.id = household), false)
  );
end;
$$;

-- Adds or removes a person on this phone's list (D6). Adding: this phone's
-- latest successful PIN sign-in (30 days) is that person, or p_pin passes the
-- same check the PIN screen uses (5 tries, then 15 minutes). Answers, never
-- raises, for the PIN cases, so a wrong PIN's recorded attempt survives:
--   {"status":"ok"} | {"status":"pin_required"} | check_staff_pin's answers.
-- Removing never asks: it can only make the phone quieter.
create or replace function public.set_my_push_person(p_staff_id uuid, p_on boolean, p_pin text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  household uuid := public.staff_push_phone_household();
  last_person uuid;
  result jsonb;
begin
  if not coalesce(p_on, false) then
    delete from public.staff_push_people p where p.device_user_id = uid and p.staff_id = p_staff_id;
    return jsonb_build_object('status', 'ok');
  end if;

  if not exists (
    select 1 from public.staff_profiles s
     where s.id = p_staff_id
       and s.household_id = household
       and s.user_id is null
       and s.archived_at is null
  ) then
    raise exception 'not_on_roster' using errcode = '22023';
  end if;

  select a.staff_id into last_person
    from public.staff_sign_in_attempts a
   where a.user_id = uid
     and a.household_id = household
     and a.kind = 'pin'
     and a.success
     and a.created_at > now() - interval '30 days'
   order by a.created_at desc, a.id desc
   limit 1;

  if last_person is distinct from p_staff_id then
    if p_pin is null then
      return jsonb_build_object('status', 'pin_required');
    end if;
    result := public.check_staff_pin(p_staff_id, p_pin);
    if result->>'status' is distinct from 'ok' then
      return result;
    end if;
  end if;

  insert into public.staff_push_people (device_user_id, staff_id, household_id)
  values (uid, p_staff_id, household)
  on conflict (device_user_id, staff_id) do update set household_id = excluded.household_id;
  return jsonb_build_object('status', 'ok');
end;
$$;

revoke all on function public.my_phone_push_people() from public, anon;
revoke all on function public.set_my_push_person(uuid, boolean, text) from public, anon;
grant execute on function public.my_phone_push_people() to authenticated;
grant execute on function public.set_my_push_person(uuid, boolean, text) to authenticated;

-- --- 5. What an admin calls -----------------------------------------------------------
-- The switch, and who is reachable: per person, how many linked phones with a
-- subscription notify them; per linked phone (device_sessions.id, as
-- list_linked_phones returns it), whose notifications it gives. Admin only.
create or replace function public.staff_push_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  household uuid := public.caller_admin_household();
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if household is null then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'enabled', coalesce((select h.staff_push from public.households h where h.id = household), false),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object('staff_id', x.staff_id, 'phones_on', x.phones))
        from (
          select p.staff_id, count(distinct p.device_user_id)::int as phones
            from public.staff_push_people p
            join public.device_sessions d on d.user_id = p.device_user_id and d.household_id = household
            join public.staff_profiles s on s.id = p.staff_id and s.archived_at is null
           where p.household_id = household
             and exists (
               select 1 from public.push_subscriptions ps
                where ps.user_id = p.device_user_id and ps.household_id = household
             )
           group by p.staff_id
        ) x
    ), '[]'::jsonb),
    'phones', coalesce((
      select jsonb_agg(jsonb_build_object('device_session_id', y.id, 'names', to_jsonb(y.names)))
        from (
          select d.id, array_agg(s.name order by p.created_at) as names
            from public.device_sessions d
            join public.staff_push_people p on p.device_user_id = d.user_id and p.household_id = household
            join public.staff_profiles s on s.id = p.staff_id and s.archived_at is null
           where d.household_id = household
             and exists (
               select 1 from public.push_subscriptions ps
                where ps.user_id = d.user_id and ps.household_id = household
             )
           group by d.id
        ) y
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.set_household_staff_push(p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  household uuid := public.caller_admin_household();
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if household is null then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  update public.households h set staff_push = coalesce(p_on, true) where h.id = household;
  return coalesce(p_on, true);
end;
$$;

-- Which of these people a push would reach now: the switch is on, it isn't
-- quiet hours, and a linked phone with a subscription notifies them. Admin
-- only. (The 5-minute rule isn't applied: this is asked right after the save
-- whose push just set it.)
create or replace function public.staff_will_be_notified(p_staff_ids uuid[])
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  household uuid := public.caller_admin_household();
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if household is null then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  if not coalesce((select h.staff_push from public.households h where h.id = household), false)
     or public.staff_push_quiet(now()) then
    return '{}'::uuid[];
  end if;
  return coalesce((
    select array_agg(distinct p.staff_id)
      from public.staff_push_people p
      join public.device_sessions d on d.user_id = p.device_user_id and d.household_id = household
      join public.staff_profiles s
        on s.id = p.staff_id and s.household_id = household and s.user_id is null and s.archived_at is null
     where p.household_id = household
       and p.staff_id = any (p_staff_ids)
       and exists (
         select 1 from public.push_subscriptions ps
          where ps.user_id = p.device_user_id and ps.household_id = household
       )
  ), '{}'::uuid[]);
end;
$$;

revoke all on function public.staff_push_overview() from public, anon;
revoke all on function public.set_household_staff_push(boolean) from public, anon;
revoke all on function public.staff_will_be_notified(uuid[]) from public, anon;
grant execute on function public.staff_push_overview() to authenticated;
grant execute on function public.set_household_staff_push(boolean) to authenticated;
grant execute on function public.staff_will_be_notified(uuid[]) to authenticated;

-- --- 6. The triggers ------------------------------------------------------------------
-- A failure never costs the record: each push is wrapped and only warns.

-- New chores for today, once per statement: adding a chore to three rooms at
-- once gives Sari one push listing all three. Only rows an admin adds, only
-- one-offs and repeats (a written day of a repeat is a copy of a chore that
-- already showed: skipping or finishing a day writes one), only when today
-- is one of their days. Grouped by who it's for after leave; null is
-- everyone ("Semua Petugas", D3).
create or replace function public.notify_staff_tasks_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Jakarta')::date;
  grp record;
begin
  if auth.uid() is null
     or not exists (select 1 from public.household_members m where m.user_id = auth.uid()) then
    return null;
  end if;
  for grp in
    select a.household_id, c.assignee, array_agg(a.id) as ids
      from added a
     cross join lateral public.staff_push_assignee(a.household_id, a.assigned_to, today) c
     where a.parent_task_id is null
       and c.push
       and public.staff_push_by_admin(a.household_id)
       and public.staff_push_chore_today(a, today)
     group by a.household_id, c.assignee
  loop
    begin
      perform public.queue_staff_task_push(grp.household_id, grp.assignee, grp.ids, 'new', today);
    exception when others then
      raise warning 'Staff task push not queued for household %: %', grp.household_id, sqlerrm;
    end;
  end loop;
  return null;
end;
$$;

-- Changes to chores, once per statement:
--   moved  assigned_to changed to someone on a chore for today, or a chore
--          moved onto today (its date or repeat changed);
--   time   due_time changed on someone's chore for today.
-- Moved onto today with nobody assigned is a new task for everyone. A
-- status change alone (finishing, "Saya kerjakan", Mark not done) never
-- counts, and staff phones never pass the admin check anyway.
create or replace function public.notify_staff_tasks_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Jakarta')::date;
  grp record;
begin
  if auth.uid() is null
     or not exists (select 1 from public.household_members m where m.user_id = auth.uid()) then
    return null;
  end if;
  for grp in
    with rows as (
      select n.id, n.household_id, n.assigned_to,
             o.assigned_to as old_assigned,
             n.due_time is distinct from o.due_time as time_changed,
             (n.due_date, n.recurrence, n.recurrence_interval, n.recurrence_until)
               is distinct from (o.due_date, o.recurrence, o.recurrence_interval, o.recurrence_until)
               as dates_changed,
             public.staff_push_chore_today(o, today) as was_today
        from after_rows n
        join before_rows o on o.id = n.id
       where public.staff_push_by_admin(n.household_id)
         and public.staff_push_chore_today(n, today)
    ),
    kinds as (
      select r.id, r.household_id, r.assigned_to,
             case
               when r.dates_changed and not r.was_today then
                 case when r.assigned_to is null then 'new' else 'moved' end
               when r.assigned_to is not null and r.assigned_to is distinct from r.old_assigned then 'moved'
               when r.assigned_to is not null and r.was_today and r.time_changed then 'time'
             end as kind
        from rows r
    )
    select k.household_id, c.assignee, k.kind, array_agg(k.id) as ids
      from kinds k
     cross join lateral public.staff_push_assignee(k.household_id, k.assigned_to, today) c
     where k.kind is not null
       and c.push
       -- Leave can make someone's chore everyone's; only a new one pushes everyone.
       and (c.assignee is not null or k.kind = 'new')
     group by k.household_id, c.assignee, k.kind
  loop
    begin
      perform public.queue_staff_task_push(grp.household_id, grp.assignee, grp.ids, grp.kind, today);
    exception when others then
      raise warning 'Staff task push not queued for household %: %', grp.household_id, sqlerrm;
    end;
  end loop;
  return null;
end;
$$;

-- Leave answered: pending → approved or rejected, by an admin. The person
-- who asked hears the answer; on "reassign", the person covering hears it
-- too. "Tidak disetujui", not "ditolak", for a person's leave (glossary).
create or replace function public.notify_staff_leave_answered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  dates text;
  staff_name text;
  approved boolean := new.status = 'approved';
begin
  if old.status is distinct from 'pending' or new.status not in ('approved', 'rejected') then
    return new;
  end if;
  if not public.staff_push_by_admin(new.household_id) then
    return new;
  end if;
  begin
    dates := public.push_date_range_label(new.start_date, new.end_date, 'id');
    perform public.queue_staff_push(
      new.household_id,
      new.staff_id,
      case when approved then 'Cuti disetujui' else 'Cuti tidak disetujui' end,
      case when approved then dates || '.' else dates || '. Buka Miamus untuk melihat.' end,
      'Admin sudah menjawab permintaan Anda.',
      '/staff?untuk=' || new.staff_id::text,
      'cuti-' || new.id::text,
      false
    );
    if approved and new.fallback_action = 'reassign' and new.fallback_assignee_id is not null then
      select s.name into staff_name from public.staff_profiles s where s.id = new.staff_id;
      perform public.queue_staff_push(
        new.household_id,
        new.fallback_assignee_id,
        'Tugas tambahan',
        coalesce(staff_name, 'Staf') || ' cuti ' || dates || '. Tugasnya untuk Anda.',
        'Ada tugas tambahan untuk Anda.',
        '/staff?untuk=' || new.fallback_assignee_id::text,
        'cuti-ganti-' || new.id::text,
        false
      );
    end if;
  exception when others then
    raise warning 'Staff leave push not queued for request %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

-- Schedule suggestion answered: one push per suggestion (batch_id), sent by
-- the statement that answers its last pending row, so approving a batch at
-- once or row by row both give one push, with the whole suggestion's counts.
-- Rows with no staff_id (older than 071) are skipped.
create or replace function public.notify_staff_proposals_answered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  suggestion record;
  title text;
  body text;
begin
  if auth.uid() is null
     or not exists (select 1 from public.household_members m where m.user_id = auth.uid()) then
    return null;
  end if;
  for suggestion in
    with answered as (
      select distinct e.household_id, n.staff_id, n.batch_id, n.id
        from after_rows n
        join before_rows o on o.id = n.id
        join public.task_entities e on e.id = n.pet_id
       where o.status = 'pending'
         and n.status <> 'pending'
         and n.staff_id is not null
    ),
    batches as (
      select distinct a.household_id, a.staff_id, a.batch_id,
             coalesce(a.batch_id, a.id::text) as batch_key,
             case when a.batch_id is null then a.id end as lone_id
        from answered a
       where public.staff_push_by_admin(a.household_id)
    )
    select b.household_id, b.staff_id, b.batch_key,
           count(*) filter (where p.status = 'approved') as approved,
           count(*) filter (where p.status = 'rejected') as rejected,
           count(*) filter (where p.status = 'pending') as pending,
           count(distinct p.pet_id) as pets,
           min(e.name) as pet_name
      from batches b
      join public.routine_proposals p
        on (b.lone_id is not null and p.id = b.lone_id)
        or (b.lone_id is null and p.batch_id = b.batch_id and p.staff_id = b.staff_id)
      join public.task_entities e on e.id = p.pet_id and e.household_id = b.household_id
     group by b.household_id, b.staff_id, b.batch_key
  loop
    if suggestion.pending > 0 then
      continue;
    end if;
    begin
      if suggestion.rejected = 0 then
        title := 'Usulan jadwal disetujui';
      elsif suggestion.approved = 0 then
        title := 'Usulan jadwal ditolak';
      else
        title := 'Usulan jadwal dijawab';
      end if;
      if suggestion.approved > 0 and suggestion.rejected > 0 then
        body := suggestion.approved || ' disetujui, ' || suggestion.rejected || ' ditolak.';
      else
        body := case
          when suggestion.approved + suggestion.rejected = 1 then 'Usulan'
          else (suggestion.approved + suggestion.rejected) || ' usulan'
        end || case when suggestion.pets = 1 then ' untuk ' || suggestion.pet_name else '' end || '.';
      end if;
      perform public.queue_staff_push(
        suggestion.household_id,
        suggestion.staff_id,
        title,
        body,
        'Admin sudah menjawab permintaan Anda.',
        '/staff?untuk=' || suggestion.staff_id::text,
        'usulan-' || suggestion.batch_key,
        false
      );
    exception when others then
      raise warning 'Staff suggestion push not queued for batch %: %', suggestion.batch_key, sqlerrm;
    end;
  end loop;
  return null;
end;
$$;

-- A repair a staff member reported, dealt with by an admin: reported → fixed
-- or dismissed, or open → fixed. Never the dismiss reason.
create or replace function public.notify_staff_repair_closed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reported_by_staff is null
     or not (
       (old.status = 'reported' and new.status in ('fixed', 'dismissed'))
       or (old.status = 'open' and new.status = 'fixed')
     ) then
    return new;
  end if;
  if not public.staff_push_by_admin(new.household_id) then
    return new;
  end if;
  begin
    perform public.queue_staff_push(
      new.household_id,
      new.reported_by_staff,
      case when new.status = 'fixed' then 'Sudah diperbaiki' else 'Laporan sudah dicek' end,
      case when new.status = 'fixed' then new.title else new.title || ': tidak perlu diperbaiki.' end,
      'Ada kabar tentang laporan Anda.',
      '/staff?untuk=' || new.reported_by_staff::text,
      'perbaikan-' || new.id::text,
      false
    );
  exception when others then
    raise warning 'Staff repair push not queued for repair %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.notify_staff_tasks_added() from public, anon, authenticated;
revoke all on function public.notify_staff_tasks_changed() from public, anon, authenticated;
revoke all on function public.notify_staff_leave_answered() from public, anon, authenticated;
revoke all on function public.notify_staff_proposals_answered() from public, anon, authenticated;
revoke all on function public.notify_staff_repair_closed() from public, anon, authenticated;
grant execute on function public.notify_staff_tasks_added() to service_role;
grant execute on function public.notify_staff_tasks_changed() to service_role;
grant execute on function public.notify_staff_leave_answered() to service_role;
grant execute on function public.notify_staff_proposals_answered() to service_role;
grant execute on function public.notify_staff_repair_closed() to service_role;

drop trigger if exists household_tasks_notify_staff_added on public.household_tasks;
create trigger household_tasks_notify_staff_added
  after insert on public.household_tasks
  referencing new table as added
  for each statement execute function public.notify_staff_tasks_added();

drop trigger if exists household_tasks_notify_staff_changed on public.household_tasks;
create trigger household_tasks_notify_staff_changed
  after update on public.household_tasks
  referencing old table as before_rows new table as after_rows
  for each statement execute function public.notify_staff_tasks_changed();

drop trigger if exists leave_requests_notify_staff on public.leave_requests;
create trigger leave_requests_notify_staff
  after update of status on public.leave_requests
  for each row execute function public.notify_staff_leave_answered();

drop trigger if exists routine_proposals_notify_staff on public.routine_proposals;
create trigger routine_proposals_notify_staff
  after update on public.routine_proposals
  referencing old table as before_rows new table as after_rows
  for each statement execute function public.notify_staff_proposals_answered();

drop trigger if exists repairs_notify_staff_closed on public.repairs;
create trigger repairs_notify_staff_closed
  after update of status on public.repairs
  for each row execute function public.notify_staff_repair_closed();

-- --- 7. The export (139's definition, plus staff notifications) -----------------------
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
      select jsonb_build_object('id', h.id, 'name', h.name, 'created_at', h.created_at,
                                -- Notifications to staff phones on or off (migrations/141).
                                'staff_push', h.staff_push)
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
    -- Who gets notifications on which linked phone (migrations/141): the
    -- phone as linked_phones above numbers it, never an endpoint.
    'staff_notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'phone', 'HP ' || ph.n, 'staff', s.name, 'since', p.created_at
      ) order by ph.n, p.created_at)
      from public.staff_push_people p
      join (
        select d.user_id, row_number() over (order by d.created_at) as n
          from public.device_sessions d where d.household_id = hh
      ) ph on ph.user_id = p.device_user_id
      join public.staff_profiles s on s.id = p.staff_id
      where p.household_id = hh
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
