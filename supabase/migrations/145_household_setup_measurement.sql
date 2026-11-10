-- ============================================================================
-- 145 — Measurement first: setup counts and the north star (Phase 172, PR 0)
-- ============================================================================
-- docs/phase-172-first-ten-minutes-plan.md, section 6; owner decisions
-- (2026-11-10): A for D1–D15. D13 A: one row of numbers per household plus
-- what can be derived from data Miamus already stores. D14 A: measurement
-- ships first, so the "before" numbers exist before the new first run does.
-- Counts only, never content.
--
-- NEW
--   household_setup            one row per household: home type, path, who
--        ran setup, when it started and finished, active seconds, typed
--        fields, voice notes, unticked items, and how many rooms, chores,
--        routines, bills, staff and pets setup added. No names, no text.
--        Kept while the household exists; deleted with it (cascade).
--        Nothing writes it yet: the setup screens arrive in PR A2.
--   record_household_setup()   the only writer: a Google account that is a
--        member of that household (household_members; staff phones are not
--        members, so they are refused). Known keys only; numbers are added
--        to what is there (0 to 100,000 each), never negative.
--   kakak_requests.job         'quick' or 'setup' (default 'quick'), so S5
--        (Kakak repeat use) counts only quick use once free setup exists.
--   north_star_day(day)        internal: per household, the chore-days and
--        routine slots due that day and how many ended done or "couldn't".
--        The same rules as 139's evening summary (chore_days_open,
--        routine_slots_open), so S3 reads what Today showed.
--   north_star_report(weeks)   internal: S1–S5 per sign-up week (Monday,
--        Jakarta) and a summary. Counts, medians and shares only: no names,
--        emails or household ids. For the evening and Sunday reviews, which
--        run as the database owner (service_role may call it too).
--   platform_north_star(weeks) the same, for /dashboard/north-star:
--        platform admins only (is_platform_admin()); everyone else 42501.
--
-- RE-CREATED
--   export_household_data (141, its newest definition)   adds `setup`, the
--        household's own row of setup counts.
--
-- Privacy policy and legal.ts updated in the same PR (new kind of data:
-- usage counts). Additive only: one table, one column with a default, new
-- functions, one re-created function. Every SECURITY DEFINER function
-- revokes EXECUTE from public and anon; the internal ones from
-- authenticated too.
-- ============================================================================

-- --- 1. The setup row ----------------------------------------------------------------
create table if not exists public.household_setup (
  household_id uuid primary key references public.households (id) on delete cascade,
  home_type text check (home_type in ('garden', 'multi_floor', 'apartment', 'other')),
  path text check (path in ('template', 'kakak', 'manual', 'mixed')),
  -- Section 7's hook: a head staff member or Poofy Labs may run it later.
  run_by text not null default 'owner' check (run_by in ('owner', 'staff', 'concierge')),
  started_at timestamptz,
  finished_at timestamptz,
  active_seconds integer not null default 0 check (active_seconds between 0 and 100000),
  typed_fields integer not null default 0 check (typed_fields between 0 and 100000),
  voice_notes integer not null default 0 check (voice_notes between 0 and 100000),
  unticked integer not null default 0 check (unticked between 0 and 100000),
  rooms_added integer not null default 0 check (rooms_added between 0 and 100000),
  chores_added integer not null default 0 check (chores_added between 0 and 100000),
  routines_added integer not null default 0 check (routines_added between 0 and 100000),
  bills_added integer not null default 0 check (bills_added between 0 and 100000),
  staff_added integer not null default 0 check (staff_added between 0 and 100000),
  pets_added integer not null default 0 check (pets_added between 0 and 100000),
  updated_at timestamptz not null default now()
);

-- No client reads or writes it; record_household_setup() and the report do.
alter table public.household_setup enable row level security;
revoke all on public.household_setup from public, anon, authenticated;
grant select, insert, update, delete on public.household_setup to service_role;

-- The writer. p_fields is an object of known keys:
--   home_type, path, run_by          one of their values (text)
--   started_at, finished_at          an ISO timestamp, from a day before the
--                                    household was made to 10 minutes ahead;
--                                    the first start and the last finish win
--   active_seconds, typed_fields, voice_notes, unticked, rooms_added,
--   chores_added, routines_added, bills_added, staff_added, pets_added
--                                    a whole number 0–100,000, ADDED to what
--                                    is stored (a screen sends its own share);
--                                    the total stops at 100,000
-- Anything else is refused, and so is the whole call.
create or replace function public.record_household_setup(p_household uuid, p_fields jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  made timestamptz;
  k text;
  v jsonb;
  n numeric;
  t timestamptz;
  v_home text;
  v_path text;
  v_run_by text;
  v_started timestamptz;
  v_finished timestamptz;
  c jsonb := '{}'::jsonb;
begin
  if uid is null or exists (select 1 from auth.users u where u.id = uid and coalesce(u.is_anonymous, false)) then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select h.created_at into made
    from public.households h
    join public.household_members m on m.household_id = h.id and m.user_id = uid
   where h.id = p_household;
  if made is null then
    raise exception 'members_only' using errcode = '42501';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'invalid_fields' using errcode = '22023';
  end if;

  for k, v in select * from jsonb_each(p_fields) loop
    if k in ('active_seconds', 'typed_fields', 'voice_notes', 'unticked', 'rooms_added', 'chores_added',
             'routines_added', 'bills_added', 'staff_added', 'pets_added') then
      if jsonb_typeof(v) <> 'number' then
        raise exception 'invalid_value: %', k using errcode = '22023';
      end if;
      n := v::text::numeric;
      if n <> trunc(n) or n < 0 or n > 100000 then
        raise exception 'invalid_value: %', k using errcode = '22023';
      end if;
      c := c || jsonb_build_object(k, n::int);
    elsif k in ('home_type', 'path', 'run_by') then
      if jsonb_typeof(v) <> 'string'
         or (k = 'home_type' and v #>> '{}' not in ('garden', 'multi_floor', 'apartment', 'other'))
         or (k = 'path' and v #>> '{}' not in ('template', 'kakak', 'manual', 'mixed'))
         or (k = 'run_by' and v #>> '{}' not in ('owner', 'staff', 'concierge')) then
        raise exception 'invalid_value: %', k using errcode = '22023';
      end if;
      if k = 'home_type' then v_home := v #>> '{}';
      elsif k = 'path' then v_path := v #>> '{}';
      else v_run_by := v #>> '{}';
      end if;
    elsif k in ('started_at', 'finished_at') then
      if jsonb_typeof(v) <> 'string' then
        raise exception 'invalid_value: %', k using errcode = '22023';
      end if;
      begin
        t := (v #>> '{}')::timestamptz;
      exception when others then
        raise exception 'invalid_value: %', k using errcode = '22023';
      end;
      if t < made - interval '1 day' or t > now() + interval '10 minutes' then
        raise exception 'invalid_value: %', k using errcode = '22023';
      end if;
      if k = 'started_at' then v_started := t; else v_finished := t; end if;
    else
      raise exception 'unknown_field: %', left(k, 40) using errcode = '22023';
    end if;
  end loop;

  insert into public.household_setup as s (
    household_id, home_type, path, run_by, started_at, finished_at,
    active_seconds, typed_fields, voice_notes, unticked, rooms_added, chores_added,
    routines_added, bills_added, staff_added, pets_added, updated_at
  ) values (
    p_household, v_home, v_path, coalesce(v_run_by, 'owner'), v_started, v_finished,
    coalesce((c ->> 'active_seconds')::int, 0), coalesce((c ->> 'typed_fields')::int, 0),
    coalesce((c ->> 'voice_notes')::int, 0), coalesce((c ->> 'unticked')::int, 0),
    coalesce((c ->> 'rooms_added')::int, 0), coalesce((c ->> 'chores_added')::int, 0),
    coalesce((c ->> 'routines_added')::int, 0), coalesce((c ->> 'bills_added')::int, 0),
    coalesce((c ->> 'staff_added')::int, 0), coalesce((c ->> 'pets_added')::int, 0), now()
  )
  on conflict (household_id) do update set
    home_type = coalesce(v_home, s.home_type),
    path = coalesce(v_path, s.path),
    run_by = coalesce(v_run_by, s.run_by),
    -- least() and greatest() skip nulls: the first start and the last finish.
    started_at = least(s.started_at, v_started),
    finished_at = greatest(s.finished_at, v_finished),
    active_seconds = least(s.active_seconds + coalesce((c ->> 'active_seconds')::int, 0), 100000),
    typed_fields = least(s.typed_fields + coalesce((c ->> 'typed_fields')::int, 0), 100000),
    voice_notes = least(s.voice_notes + coalesce((c ->> 'voice_notes')::int, 0), 100000),
    unticked = least(s.unticked + coalesce((c ->> 'unticked')::int, 0), 100000),
    rooms_added = least(s.rooms_added + coalesce((c ->> 'rooms_added')::int, 0), 100000),
    chores_added = least(s.chores_added + coalesce((c ->> 'chores_added')::int, 0), 100000),
    routines_added = least(s.routines_added + coalesce((c ->> 'routines_added')::int, 0), 100000),
    bills_added = least(s.bills_added + coalesce((c ->> 'bills_added')::int, 0), 100000),
    staff_added = least(s.staff_added + coalesce((c ->> 'staff_added')::int, 0), 100000),
    pets_added = least(s.pets_added + coalesce((c ->> 'pets_added')::int, 0), 100000),
    updated_at = now();
end;
$$;
revoke all on function public.record_household_setup(uuid, jsonb) from public, anon;
grant execute on function public.record_household_setup(uuid, jsonb) to authenticated;

-- --- 2. Kakak: quick use or setup ----------------------------------------------------
-- Every request so far is a quick one; free setup (PR B) writes 'setup'.
alter table public.kakak_requests add column if not exists job text not null default 'quick';
alter table public.kakak_requests drop constraint if exists kakak_requests_job_check;
alter table public.kakak_requests add constraint kakak_requests_job_check check (job in ('quick', 'setup'));

-- --- 3. What was due on a day, and what was closed ------------------------------------
-- Per household: chore-days and routine slots due on p_day, and how many
-- ended done or marked "couldn't" (139). Chores follow chore_days_open's rules
-- (a written day governs its own status and person; leave that pauses a
-- person's chores takes them off the day); routines follow
-- routine_slots_open's (which schedules count, which slots a log closes).
-- Read for days that have ended.
create or replace function public.north_star_day(p_day date)
returns table (household_id uuid, due integer, closed integer)
language sql
stable
set search_path = ''
as $$
  with chore_due as (
    select t.id, t.household_id, t.due_date, t.status, t.assigned_to
      from public.household_tasks t
     where t.parent_task_id is null
       and t.status <> 'cancelled'
       and public.chore_occurs_on(t, p_day)
    union all
    select t.id, t.household_id, t.due_date, t.status, t.assigned_to
      from public.household_tasks x
      join public.household_tasks t
        on t.id = x.parent_task_id and t.household_id = x.household_id and t.parent_task_id is null
     where t.status <> 'cancelled'
       and x.due_date = p_day
       and not public.chore_occurs_on(t, p_day)
  ),
  chore_days as (
    select d.household_id, d.id,
           coalesce(r.status, case when p_day = d.due_date then d.status else 'pending' end) as status,
           case when r.id is not null then r.assigned_to else d.assigned_to end as assignee
      from chore_due d
      left join lateral (
        select x.id, x.status, x.assigned_to
          from public.household_tasks x
         where x.parent_task_id = d.id and x.due_date = p_day
         order by x.created_at
         limit 1
      ) r on true
  ),
  chores as (
    select c.household_id,
           count(*)::int as due,
           count(*) filter (
             where c.status = 'completed'
                or exists (select 1 from public.task_exceptions e
                            where e.chore_id = c.id and e.occurs_on = p_day)
           )::int as closed
      from chore_days c
      left join lateral (
        select l.id, l.fallback_action
          from public.leave_requests l
         where c.assignee is not null
           and l.staff_id = c.assignee
           and l.household_id = c.household_id
           and l.status in ('approved', 'ended_early')
           and p_day between l.start_date and l.end_date
           and (l.ended_on is null or p_day < l.ended_on)
         order by l.created_at
         limit 1
      ) lv on true
     where c.status <> 'cancelled'
       and (lv.id is null or coalesce(lv.fallback_action, 'unassign') <> 'pause')
     group by c.household_id
  ),
  slots_due as (
    select e.household_id, count(*)::int as due
      from public.master_schedules ms
      join public.task_entities e on e.id = ms.entity_id
      cross join lateral (
        select f.t
          from unnest(case when ms.frequency_type = 'fixed_time' then ms.fixed_times end) as f(t)
        union all
        select g::time
          from generate_series(
                 case when ms.frequency_type = 'interval' then p_day + ms.start_time end,
                 case when ms.frequency_type = 'interval' then p_day + ms.end_time end,
                 make_interval(hours => case when ms.interval_hours > 0 then ms.interval_hours end)
               ) as g
      ) s
     where ms.is_active
       and (ms.created_at at time zone 'Asia/Jakarta')::date <= p_day
       and (ms.expires_at is null or ms.expires_at >= p_day)
       and e.status is distinct from 'admitted'
       and e.household_id is not null
       and coalesce(e.metadata ->> 'archived', 'false') <> 'true'
     group by e.household_id
  ),
  slots_open as (
    select o.household_id, count(*)::int as open
      from public.routine_slots_open(p_day) o
     where not exists (
       select 1 from public.task_exceptions e
        where e.schedule_id = o.schedule_id and e.entity_id = o.entity_id
          and e.occurs_on = p_day and e.slot_time = o.slot_time
     )
     group by o.household_id
  )
  select coalesce(c.household_id, sd.household_id),
         coalesce(c.due, 0) + coalesce(sd.due, 0),
         coalesce(c.closed, 0) + greatest(coalesce(sd.due, 0) - coalesce(so.open, 0), 0)
    from chores c
    full join slots_due sd on sd.household_id = c.household_id
    left join slots_open so on so.household_id = coalesce(c.household_id, sd.household_id);
$$;
revoke all on function public.north_star_day(date) from public, anon, authenticated;
grant execute on function public.north_star_day(date) to service_role;

-- --- 4. The north star, per sign-up week ----------------------------------------------
-- p_weeks (1–26, default 8) weeks back from this one, Monday to Sunday in
-- Jakarta, newest first. Per week, for the households made that week:
--   households
--   first_finish_minutes   median minutes from the household's creation to
--                          the first chore or routine a staff member (not an
--                          admin) finished
--   same_day / same_day_of how many had that first finish on the day they
--                          were made, of those made before today (S1)
--   signup_minutes         median minutes from asking for access to the
--                          household existing (the approval wait)
--   setup_households       how many have a household_setup row (from PR A2)
--   setup_minutes          median active setup minutes (S1, owner time)
--   typed_fields           median typed fields during setup (S2)
--   paths                  how many took each setup path
--   hand_items_14d / _of   median rooms, chores, staff, pets and routines
--                          added in the first 14 days beyond what setup added
--                          (each is at least one typed field: S2's "before"),
--                          of households at least 14 days old
--   s4_active / s4_of      week 4 (days 21–27): at least 3 tasks finished by
--                          staff per staff member on the roster, of
--                          households at least 28 days old
--   s5_repeat / s5_of      3+ quick Kakak requests in week 3 (days 14–20), of
--                          households that tried Kakak by then (21+ days old)
-- and, for the calendar week itself across every household:
--   s3_due / s3_closed     chore-days and routine slots due on ended days,
--                          and how many ended done or "couldn't" (S3)
-- `summary` is the same over the whole window, with S3 for the last 7 ended
-- days. No names, emails or household ids anywhere.
create or replace function public.north_star_report(p_weeks integer default 8)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  n_weeks int := least(greatest(coalesce(p_weeks, 8), 1), 26);
  today date := (now() at time zone 'Asia/Jakarta')::date;
  this_week date;
  first_week date;
  result jsonb;
begin
  this_week := today - (extract(isodow from today)::int - 1);
  first_week := this_week - (n_weeks - 1) * 7;

  with hh as (
    select h.id, h.created_at, h.owner_auth_id,
           (h.created_at at time zone 'Asia/Jakarta')::date as day
      from public.households h
     where (h.created_at at time zone 'Asia/Jakarta')::date >= first_week
  ),
  -- Finished by staff: a staff member's roster row has no Google account.
  staff_done as (
    select t.household_id, t.completed_at as at
      from public.household_tasks t
      join hh on hh.id = t.household_id
      join public.staff_profiles s on s.id = t.completed_by and s.user_id is null
     where t.status = 'completed' and t.completed_at > hh.created_at
    union all
    select e.household_id, l.completed_at
      from public.task_logs l
      join public.task_entities e on e.id = l.entity_id
      join hh on hh.id = e.household_id
      join public.staff_profiles s on s.id = l.staff_id and s.user_id is null
     where l.sub_type = 'complete' and l.completed_at > hh.created_at
  ),
  per_hh as (
    select hh.id, hh.created_at, hh.day,
           hh.day - (extract(isodow from hh.day)::int - 1) as week,
           (select min(d.at) from staff_done d where d.household_id = hh.id) as first_at,
           (select extract(epoch from hh.created_at - r.requested_at) / 60.0
              from public.household_access_requests r
             where r.user_id = hh.owner_auth_id and r.requested_at <= hh.created_at) as signup_min,
           su.household_id is not null as has_setup,
           su.active_seconds, su.typed_fields, su.path,
           case when now() >= hh.created_at + interval '14 days' then greatest(0,
               (select count(*) from public.household_tasks t
                 where t.household_id = hh.id and t.parent_task_id is null
                   and t.created_at < hh.created_at + interval '14 days')
             + (select count(*) from public.household_locations r
                 where r.household_id = hh.id and r.created_at < hh.created_at + interval '14 days')
             + (select count(*) from public.staff_profiles s
                 where s.household_id = hh.id and s.user_id is null
                   and s.created_at < hh.created_at + interval '14 days')
             + (select count(*) from public.task_entities e
                 where e.household_id = hh.id and e.created_at < hh.created_at + interval '14 days')
             + (select count(*) from public.master_schedules ms
                  join public.task_entities e on e.id = ms.entity_id
                 where e.household_id = hh.id and ms.created_at < hh.created_at + interval '14 days')
             - coalesce(su.rooms_added + su.chores_added + su.routines_added + su.bills_added
                        + su.staff_added + su.pets_added, 0))
           end as hand_items,
           case when now() >= hh.created_at + interval '28 days' then (
             with roster as (
               select count(*) as n from public.staff_profiles s
                where s.household_id = hh.id and s.user_id is null
                  and s.created_at < hh.created_at + interval '28 days'
                  and (s.archived_at is null or s.archived_at >= hh.created_at + interval '21 days')
             ), done as (
               select count(*) as n from staff_done d
                where d.household_id = hh.id
                  and d.at >= hh.created_at + interval '21 days'
                  and d.at < hh.created_at + interval '28 days'
             )
             select roster.n > 0 and done.n >= 3 * roster.n from roster, done
           ) end as s4_active,
           case when now() >= hh.created_at + interval '21 days'
                 and exists (select 1 from public.kakak_requests q
                              where q.household_id = hh.id and q.job = 'quick' and q.user_id is not null
                                and q.created_at < hh.created_at + interval '21 days')
             then (select count(*) >= 3 from public.kakak_requests q
                    where q.household_id = hh.id and q.job = 'quick' and q.user_id is not null
                      and q.created_at >= hh.created_at + interval '14 days'
                      and q.created_at < hh.created_at + interval '21 days')
           end as s5_repeat
      from hh
      left join public.household_setup su on su.household_id = hh.id
  ),
  days as (
    select g::date as d
      from generate_series(least(first_week, today - 7), today - 1, interval '1 day') as g
  ),
  day_totals as (
    select days.d, coalesce(sum(n.due), 0)::int as due, coalesce(sum(n.closed), 0)::int as closed
      from days
      left join lateral public.north_star_day(days.d) n on true
     group by days.d
  ),
  weeks as (
    select (first_week + i * 7) as week from generate_series(0, n_weeks - 1) as i
  ),
  week_rows as (
    select w.week,
           jsonb_build_object(
             'week_start', w.week,
             'households', count(p.id),
             'first_finish_minutes', round((percentile_cont(0.5) within group (
                 order by extract(epoch from p.first_at - p.created_at) / 60.0)
                 filter (where p.first_at is not null))::numeric, 1),
             'same_day', count(p.id) filter (
                 where p.first_at is not null and (p.first_at at time zone 'Asia/Jakarta')::date = p.day),
             'same_day_of', count(p.id) filter (where p.day < today),
             'signup_minutes', round((percentile_cont(0.5) within group (order by p.signup_min)
                 filter (where p.signup_min is not null))::numeric, 1),
             'setup_households', count(p.id) filter (where p.has_setup),
             'setup_minutes', round((percentile_cont(0.5) within group (order by p.active_seconds / 60.0)
                 filter (where p.has_setup))::numeric, 1),
             'typed_fields', round((percentile_cont(0.5) within group (order by p.typed_fields)
                 filter (where p.has_setup))::numeric, 1),
             'paths', jsonb_build_object(
                 'template', count(p.id) filter (where p.path = 'template'),
                 'kakak', count(p.id) filter (where p.path = 'kakak'),
                 'manual', count(p.id) filter (where p.path = 'manual'),
                 'mixed', count(p.id) filter (where p.path = 'mixed')),
             'hand_items_14d', round((percentile_cont(0.5) within group (order by p.hand_items)
                 filter (where p.hand_items is not null))::numeric, 1),
             'hand_items_14d_of', count(p.id) filter (where p.hand_items is not null),
             's4_active', count(p.id) filter (where p.s4_active),
             's4_of', count(p.id) filter (where p.s4_active is not null),
             's5_repeat', count(p.id) filter (where p.s5_repeat),
             's5_of', count(p.id) filter (where p.s5_repeat is not null),
             's3_due', (select coalesce(sum(t.due), 0) from day_totals t
                         where t.d >= w.week and t.d < w.week + 7),
             's3_closed', (select coalesce(sum(t.closed), 0) from day_totals t
                            where t.d >= w.week and t.d < w.week + 7)
           ) as row
      from weeks w
      left join per_hh p on p.week = w.week
     group by w.week
  )
  select jsonb_build_object(
    'as_of', today,
    'weeks_requested', n_weeks,
    'targets', jsonb_build_object(
      's1_setup_minutes', 10, 's2_typed_fields', 10, 's3_share', 0.9, 's4_share', 0.7, 's5_share', 0.5),
    'weeks', (select jsonb_agg(wr.row order by wr.week desc) from week_rows wr),
    'summary', (
      select jsonb_build_object(
        'households', count(p.id),
        'first_finish_minutes', round((percentile_cont(0.5) within group (
            order by extract(epoch from p.first_at - p.created_at) / 60.0)
            filter (where p.first_at is not null))::numeric, 1),
        'same_day', count(p.id) filter (
            where p.first_at is not null and (p.first_at at time zone 'Asia/Jakarta')::date = p.day),
        'same_day_of', count(p.id) filter (where p.day < today),
        'signup_minutes', round((percentile_cont(0.5) within group (order by p.signup_min)
            filter (where p.signup_min is not null))::numeric, 1),
        'setup_households', count(p.id) filter (where p.has_setup),
        'setup_minutes', round((percentile_cont(0.5) within group (order by p.active_seconds / 60.0)
            filter (where p.has_setup))::numeric, 1),
        'typed_fields', round((percentile_cont(0.5) within group (order by p.typed_fields)
            filter (where p.has_setup))::numeric, 1),
        'hand_items_14d', round((percentile_cont(0.5) within group (order by p.hand_items)
            filter (where p.hand_items is not null))::numeric, 1),
        'hand_items_14d_of', count(p.id) filter (where p.hand_items is not null),
        's3_due', (select coalesce(sum(t.due), 0) from day_totals t where t.d >= today - 7),
        's3_closed', (select coalesce(sum(t.closed), 0) from day_totals t where t.d >= today - 7),
        's4_active', count(p.id) filter (where p.s4_active),
        's4_of', count(p.id) filter (where p.s4_active is not null),
        's5_repeat', count(p.id) filter (where p.s5_repeat),
        's5_of', count(p.id) filter (where p.s5_repeat is not null)
      )
      from per_hh p
    )
  ) into result;

  return result;
end;
$$;
revoke all on function public.north_star_report(integer) from public, anon, authenticated;
grant execute on function public.north_star_report(integer) to service_role;

-- For /dashboard/north-star. Runs the report as its owner, for platform
-- admins only: a staff phone, an owner of a household and anon get 42501.
create or replace function public.platform_north_star(p_weeks integer default 8)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'platform_admins_only' using errcode = '42501';
  end if;
  return public.north_star_report(p_weeks);
end;
$$;
revoke all on function public.platform_north_star(integer) from public, anon;
grant execute on function public.platform_north_star(integer) to authenticated;

-- --- 5. The export (141's definition, plus the setup counts) --------------------------
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
    -- Numbered as Household → Linked staff phones lists them (last sign-in
    -- first), so "HP 1" here is "Phone 1" on screen (migrations/141).
    'linked_phones', coalesce((
      select jsonb_agg(jsonb_build_object('phone', 'HP ' || ph.n, 'linked_at', ph.created_at,
                                          'last_seen_at', ph.last_seen_at)
                       order by ph.n)
      from (
        select d.created_at, d.last_seen_at,
               row_number() over (order by d.last_seen_at desc, d.created_at) as n
          from public.device_sessions d where d.household_id = hh
      ) ph
    ), '[]'::jsonb),
    -- Who gets notifications on which linked phone (migrations/141): the
    -- phone as linked_phones above numbers it, never an endpoint.
    'staff_notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'phone', 'HP ' || ph.n, 'staff', s.name, 'since', p.created_at
      ) order by ph.n, p.created_at)
      from public.staff_push_people p
      join (
        select d.user_id, row_number() over (order by d.last_seen_at desc, d.created_at) as n
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
    -- Setting up the household, as numbers only (migrations/145); null until
    -- the setup screens record it.
    'setup', (
      select to_jsonb(su) - 'household_id'
      from public.household_setup su where su.household_id = hh
    ),
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
