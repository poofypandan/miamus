-- ============================================================================
-- 170 — A routine owes only the slots after it was made (owner, 13 Nov)
-- ============================================================================
-- A slot is owed only if the routine existed before the slot's time. On the
-- day a routine row is made, its slots earlier than its created_at (Asia/
-- Jakarta, to the minute) aren't open: a walk added at 22.37 for 15.00
-- starts tomorrow. The app's own rule is isSlotOwed() in
-- src/lib/scheduleEngine.ts (PR #139); this is the server's half, so the
-- pushes agree with what Today and the staff phone show.
--
-- CHANGED (each re-created from its newest definition, migrations/144, with
-- only the lines marked "170" added; same signature, language, volatility,
-- search_path, SECURITY INVOKER and grants)
--   routine_slots_open(date)  skips an unlogged slot earlier than the row's
--                             created_at on the day it was made. Logs are
--                             still matched to every slot first, as before,
--                             so nothing else moves. Its readers follow:
--                             notify_routines_due (150: the staff reminder
--                             and the owner alert), the evening summary
--                             (152) and north_star_day's open count (144).
--   north_star_day(date)      its due count leaves out the same slots, so a
--                             slot that isn't owed isn't counted as closed
--                             either (closed is due minus open).
--
-- A one-off or a generated visit is anchored at its day's midnight, so every
-- slot of it is still owed. A time moved the same day keeps the row's
-- created_at (there is no "times changed" column), so it is still owed.
--
-- No table, column or policy changes; nothing is stored differently.
-- Test: supabase/tests/170_routine_slot_owed_from_creation.sql (local only).

-- --- 1. Open routine slots: not before the routine was made (from 144) ------------------
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
           ms.interval_hours, ms.kind, ms.proof, e.household_id, e.name as pet_name,
           -- 170: the Jakarta day and minute the row was made.
           (ms.created_at at time zone 'Asia/Jakarta')::date as made_on,
           date_trunc('minute', ms.created_at at time zone 'Asia/Jakarta')::time as made_at
      from public.master_schedules ms
      join public.task_entities e on e.id = ms.entity_id
     where ms.is_active
       and (ms.created_at at time zone 'Asia/Jakarta')::date <= p_day
       and (ms.expires_at is null or ms.expires_at >= p_day)
       -- Some days only (Phase 173): p_day is already the Jakarta date.
       and (ms.days_of_week is null or extract(isodow from p_day)::smallint = any (ms.days_of_week))
       and e.status is distinct from 'admitted'
       and e.household_id is not null
       -- Archived pets keep their schedules but leave Today (isActivePet,
       -- src/lib/pets.ts), so they leave the summary too (Codex, PR #71).
       and coalesce(e.metadata ->> 'archived', 'false') <> 'true'
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
         -- A vet visit is open until it is closed: checked out or admitted,
         -- not just checked in (vetVisitState, src/lib/staff-agenda.ts;
         -- Codex, PR #71). Old rows only: a new routine's title is free text.
         and (s.kind is not null or s.title not like 'Vet: %' or l.sub_type in ('check_out', 'admitted'))
         -- A three-photo routine is done at its end photo (Phase 173, D14):
         -- the start and arrived photos leave it open.
         and (s.proof <> 'three' or l.sub_type = 'check_out')
       order by 1
    );

    if cardinality(slots) = 1 then
      if coalesce(cardinality(marks), 0) = 0
         -- 170: not owed if the row was made after it, that day.
         and not (s.made_on = p_day and slots[1] < s.made_at) then
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
        -- 170: not owed if the row was made after it, that day (its logs
        -- were still matched above, so the other slots read as before).
        if s.made_on = p_day and slot < s.made_at then
          continue;
        end if;
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

-- --- 2. North-star due slots: not before the routine was made (from 144) ----------------
create or replace function public.north_star_day(p_day date)
returns table (household_id uuid, due integer, closed integer)
language sql
stable
set search_path = ''
as $$
  with day_end as (
    select ((p_day + 1)::timestamp at time zone 'Asia/Jakarta') as at
  ),
  chore_due as (
    select t.id, t.household_id, t.due_date, t.status, t.assigned_to, t.completed_at
      from public.household_tasks t
     where t.parent_task_id is null
       and t.status <> 'cancelled'
       and public.chore_occurs_on(t, p_day)
    union all
    select t.id, t.household_id, t.due_date, t.status, t.assigned_to, t.completed_at
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
           case when r.id is not null then r.completed_at when p_day = d.due_date then d.completed_at end as completed_at,
           case when r.id is not null then r.assigned_to else d.assigned_to end as assignee
      from chore_due d
      left join lateral (
        select x.id, x.status, x.assigned_to, x.completed_at
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
             -- A finish with no time on record (old rows) counts as closed.
             where (c.status = 'completed' and (c.completed_at is null or c.completed_at < de.at))
                or exists (select 1 from public.task_exceptions e
                            where e.chore_id = c.id and e.occurs_on = p_day and e.created_at < de.at)
           )::int as closed
      from chore_days c
      cross join day_end de
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
       -- 170: a slot earlier than the row's making, that day, isn't due.
       and not ((ms.created_at at time zone 'Asia/Jakarta')::date = p_day
                and s.t < date_trunc('minute', ms.created_at at time zone 'Asia/Jakarta')::time)
       and (ms.expires_at is null or ms.expires_at >= p_day)
       and (ms.days_of_week is null or extract(isodow from p_day)::smallint = any (ms.days_of_week))
       and e.status is distinct from 'admitted'
       and e.household_id is not null
       and coalesce(e.metadata ->> 'archived', 'false') <> 'true'
     group by e.household_id
  ),
  slots_open as (
    select o.household_id, count(*)::int as open
      from public.routine_slots_open(p_day) o
      cross join day_end de
     where not exists (
       select 1 from public.task_exceptions e
        where e.schedule_id = o.schedule_id and e.entity_id = o.entity_id
          and e.occurs_on = p_day and e.slot_time = o.slot_time and e.created_at < de.at
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
