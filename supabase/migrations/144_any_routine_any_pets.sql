-- ============================================================================
-- 144 — Any routine, for any pets (Phase 173, PR A)
-- ============================================================================
-- docs/phase-173-pet-routines-plan.md (the plan's "147" was a placeholder;
-- from 10 November each migration takes the next free number above the
-- highest on main when it is built). Owner decisions (2026-11-11): A for
-- every decision, except D6 = a photo by default for every routine, and D14
-- = walks proven by three live-camera photos (gate, park, gate), server
-- times, no location.
--
-- NEW (all nullable or with a default: old app builds keep working)
--   master_schedules.kind             walk | lights | play | water | teeth |
--        other, or null (old rows keep their title rules).
--   master_schedules.routine_group_id one id for the rows made together for
--        several pets (one row per pet, D3). Null for every old row.
--   master_schedules.days_of_week     ISO weekdays (1 = Monday … 7 = Sunday),
--        read as the Jakarta date; null = every day (D11).
--   master_schedules.note             up to 120 characters, shown to staff.
--   master_schedules.staff_id         the person it is for, or null for
--        anyone (D10). Checked by a trigger: staff of the pet's household,
--        not archived. Archiving the person releases it (below).
--   master_schedules.proof            photo (default, D6) | tick | three
--        (D14: start, arrived, back). Every existing row stays 'photo'.
--   task_logs.received_at             when the save reached the database,
--        set by a trigger whatever the phone sends (D14 rule 3). task_logs
--        has no update policy (090), so it can't be changed later. Old rows
--        stay null.
--
-- CHANGED
--   master_schedules write policies (D13): only an admin of the pet's
--        household (caller_admin_household()) may insert, update or delete
--        a routine. 090's versions used get_user_household_ids(), which
--        every staff phone passes. Reading is unchanged (staff read
--        routines); staff phones still write task_logs.
--
-- RE-CREATED (each from its newest definition)
--   archive_staff_profile (119)   also clears master_schedules.staff_id for
--        that person, as 118 does for repeating chores. Keeps its own admin
--        check, revoke and grant.
--   routine_slots_open (139)      skips a day not in days_of_week, and counts
--        a proof = 'three' row as done only at its end photo (check_out), as
--        it does for vet visits. The vet rule now applies to old rows only
--        (kind is null), so a typed "Other" title can't trip it.
--   north_star_day (142)          a routine slot is due only on its weekdays,
--        as routine_slots_open now reads it; otherwise a Monday walk would
--        count as due, and done, on Sunday.
--   staff_workload (100)          skips 'arrived' as well as 'check_in', so a
--        three-photo walk counts once. Same grant.
--   export_household_data (142)   each log also carries received_at.
--
-- No new SECURITY DEFINER function. The one re-created (archive_staff_profile,
-- export_household_data) repeat their revoke from public, anon and their
-- grant to authenticated. The two new trigger functions are security
-- invoker with an empty search_path, and EXECUTE is revoked from every
-- client role (only their triggers call them).
--
-- Privacy policy and legal.ts change in the same PR: walk photos are taken
-- where the walk goes and may show a public place and the staff member;
-- Miamus records no location. No new service, no change in retention.
-- ============================================================================

-- --- 1. Routines: kind, group, days, note, person, proof ------------------------------
alter table public.master_schedules
  add column if not exists kind text,
  add column if not exists routine_group_id uuid,
  add column if not exists days_of_week smallint[],
  add column if not exists note text,
  add column if not exists staff_id uuid references public.staff_profiles (id) on delete set null,
  add column if not exists proof text not null default 'photo';

alter table public.master_schedules drop constraint if exists master_schedules_kind_check;
alter table public.master_schedules add constraint master_schedules_kind_check
  check (kind is null or kind in ('walk', 'lights', 'play', 'water', 'teeth', 'other'));
-- A CHECK can't hold a subquery, so no unnest: containment does the range.
alter table public.master_schedules drop constraint if exists master_schedules_days_of_week_check;
alter table public.master_schedules add constraint master_schedules_days_of_week_check
  check (days_of_week is null
         or (days_of_week <@ '{1,2,3,4,5,6,7}'::smallint[] and cardinality(days_of_week) > 0));
alter table public.master_schedules drop constraint if exists master_schedules_note_check;
alter table public.master_schedules add constraint master_schedules_note_check
  check (note is null or char_length(note) <= 120);
alter table public.master_schedules drop constraint if exists master_schedules_proof_check;
alter table public.master_schedules add constraint master_schedules_proof_check
  check (proof in ('photo', 'tick', 'three'));

comment on column public.master_schedules.kind is
  'Phase 173: walk | lights | play | water | teeth | other. Null = old rules (category from the title).';
comment on column public.master_schedules.routine_group_id is
  'Phase 173: shared by the rows made together for several pets (one row per pet). Edited and removed together by the owner.';
comment on column public.master_schedules.days_of_week is
  'Phase 173: ISO weekdays (1 = Monday ... 7 = Sunday) of the Jakarta date. Null = every day.';
comment on column public.master_schedules.proof is
  'Phase 173: photo (default) | tick | three (start, arrived and end photos; done at the end photo).';

create index if not exists master_schedules_routine_group_id_idx
  on public.master_schedules (routine_group_id) where routine_group_id is not null;
create index if not exists master_schedules_staff_id_idx
  on public.master_schedules (staff_id) where staff_id is not null;

-- The person, if set, works in the pet's household and is still on the roster.
-- Security invoker: an admin reads their own roster and pets under RLS, so
-- another household's person is simply not found.
create or replace function public.check_master_schedule_staff()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.staff_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.staff_id is not distinct from old.staff_id
     and new.entity_id is not distinct from old.entity_id then
    return new;
  end if;
  if not exists (
    select 1
      from public.staff_profiles s
      join public.task_entities e on e.household_id = s.household_id
     where s.id = new.staff_id
       and e.id = new.entity_id
       and s.archived_at is null
  ) then
    raise exception 'routine_staff' using errcode = '42501',
      hint = 'The person must be on this household''s roster.';
  end if;
  return new;
end;
$$;
revoke all on function public.check_master_schedule_staff() from public, anon, authenticated;

drop trigger if exists master_schedules_check_staff on public.master_schedules;
create trigger master_schedules_check_staff
  before insert or update of staff_id, entity_id on public.master_schedules
  for each row execute function public.check_master_schedule_staff();

-- Phase 172 A3 saves "Jalan pagi" and "Jalan sore" as plain rows with no end
-- date, which the old rules file as meals. If any exist already, they are
-- walks. A no-op until 172 A3 ships.
update public.master_schedules
   set kind = 'walk'
 where kind is null
   and expires_at is null
   and title in ('Jalan pagi', 'Jalan sore');

-- --- 2. Server time on every log (D14 rule 3) ------------------------------------------
-- Added with no default first, so the rows already there stay null (a time
-- the server never saw), then the default for new rows.
alter table public.task_logs add column if not exists received_at timestamptz;
alter table public.task_logs alter column received_at set default now();
comment on column public.task_logs.received_at is
  'Phase 173: when the save reached the database (trigger; the phone can''t set it). completed_at stays the phone''s time.';

create or replace function public.stamp_task_log_received_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.received_at := now();
  return new;
end;
$$;
revoke all on function public.stamp_task_log_received_at() from public, anon, authenticated;

drop trigger if exists task_logs_stamp_received_at on public.task_logs;
create trigger task_logs_stamp_received_at
  before insert on public.task_logs
  for each row execute function public.stamp_task_log_received_at();

-- --- 3. Only admins write routines (D13) -----------------------------------------------
-- caller_admin_household() (109) is the household the caller administers:
-- household_members only, so a staff phone's anonymous session gets null.
-- Wrapped in a select so it runs once per statement, not once per row.
drop policy if exists "tenant_insert_master_schedules" on public.master_schedules;
drop policy if exists "tenant_update_master_schedules" on public.master_schedules;
drop policy if exists "tenant_delete_master_schedules" on public.master_schedules;
drop policy if exists "admin_insert_master_schedules" on public.master_schedules;
drop policy if exists "admin_update_master_schedules" on public.master_schedules;
drop policy if exists "admin_delete_master_schedules" on public.master_schedules;

create policy "admin_insert_master_schedules" on public.master_schedules
  for insert to authenticated with check (
    exists (select 1 from public.task_entities e
             where e.id = master_schedules.entity_id
               and e.household_id = (select public.caller_admin_household())));
create policy "admin_update_master_schedules" on public.master_schedules
  for update to authenticated using (
    exists (select 1 from public.task_entities e
             where e.id = master_schedules.entity_id
               and e.household_id = (select public.caller_admin_household())))
  with check (
    exists (select 1 from public.task_entities e
             where e.id = master_schedules.entity_id
               and e.household_id = (select public.caller_admin_household())));
create policy "admin_delete_master_schedules" on public.master_schedules
  for delete to authenticated using (
    exists (select 1 from public.task_entities e
             where e.id = master_schedules.entity_id
               and e.household_id = (select public.caller_admin_household())));

-- --- 4. Archiving a person releases their routines (from 119) --------------------------
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

  delete from device_sessions d
   where d.household_id = v_row.household_id
     and d.user_id = any (v_phones);
  delete from push_subscriptions s
   where s.household_id = v_row.household_id
     and s.user_id = any (v_phones);

  return v_row;
end;
$$;

revoke all on function archive_staff_profile(uuid) from public, anon;
grant execute on function archive_staff_profile(uuid) to authenticated;

-- Anyone already archived (none can hold a routine yet: a no-op today).
update public.master_schedules ms
   set staff_id = null
  from public.staff_profiles s
 where s.id = ms.staff_id
   and s.archived_at is not null;

-- --- 5. Open routine slots: weekdays and three-photo routines (from 139) ---------------
-- As buildAgenda (scheduleEngine.ts) reads them: active schedules of pets not
-- archived or at the clinic, on their weekdays, fixed times or interval
-- slots ("weekly" isn't expanded, as in the app). A single-slot schedule is
-- done by any log that day; a vet visit (old rows) only once closed; a
-- three-photo routine only at its end photo. A multi-slot one matches each
-- slot, earliest first, to the nearest unclaimed log within half its
-- interval (3 hours for fixed times), exactly as buildAgenda does.
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
           ms.interval_hours, ms.kind, ms.proof, e.household_id, e.name as pet_name
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

-- --- 6. Staff workload counts a three-photo walk once (from 100) -----------------------
create or replace function staff_workload(
  p_household_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  staff_id uuid,
  name text,
  total_completed integer,
  pets_completed integer,
  chores_completed integer
)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1 from household_members m
     where m.user_id = auth.uid() and m.household_id = p_household_id
  ) then
    raise exception 'workload_owner_only' using errcode = '42501';
  end if;

  return query
  with pets as (
    select l.staff_id as who, count(*)::integer as n
      from task_logs l
      join task_entities e on e.id = l.entity_id
     where e.household_id = p_household_id
       and l.module = 'pet'
       and l.completed_at >= p_from
       and l.completed_at < p_to
       -- A vet visit counts once (its close), and so does a three-photo
       -- walk (its end photo; Phase 173).
       and coalesce(l.sub_type, 'complete') not in ('check_in', 'arrived')
     group by l.staff_id
  ),
  chores as (
    select t.completed_by as who, count(*)::integer as n
      from household_tasks t
     where t.household_id = p_household_id
       and t.status = 'completed'
       and t.completed_at >= p_from
       and t.completed_at < p_to
     group by t.completed_by
  ),
  people as (
    select s.id, s.name from staff_profiles s where s.household_id = p_household_id
    union all
    select null::uuid, null::text
     where exists (select 1 from pets where who is null)
        or exists (select 1 from chores where who is null)
  )
  select p.id::uuid,
         p.name::text,
         (coalesce(pt.n, 0) + coalesce(ch.n, 0))::integer,
         coalesce(pt.n, 0)::integer,
         coalesce(ch.n, 0)::integer
    from people p
    left join pets pt on pt.who is not distinct from p.id
    left join chores ch on ch.who is not distinct from p.id
   order by 3 desc, p.name nulls last;
end;
$$;

grant execute on function staff_workload(uuid, timestamptz, timestamptz) to authenticated;

-- --- 7. North-star due slots follow the weekdays (from 142) ----------------------------
-- As 142, plus one line in slots_due: a routine slot is due only on its
-- weekdays, as routine_slots_open reads it (otherwise a Monday walk would be
-- due, and counted done, on Sunday).
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

-- --- 8. The household export carries received_at (from 142) ----------------------------
-- As 142, with received_at on each log (Phase 173: when the save reached the
-- database).
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
        'completed_at', l.completed_at, 'received_at', l.received_at, 'staff', s.name,
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
    -- Setting up the household, as numbers only (migrations/142); null until
    -- the setup screens record it.
    'setup', (
      select to_jsonb(su) - 'household_id'
      from public.household_setup su where su.household_id = hh
    ),
    -- Each ended day's due and closed task counts (migrations/142).
    'task_day_counts', coalesce((
      select jsonb_agg(jsonb_build_object('day', nd.day, 'due', nd.due, 'closed', nd.closed) order by nd.day)
      from public.north_star_days nd where nd.household_id = hh
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
