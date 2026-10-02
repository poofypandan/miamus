-- ============================================================================
-- 100 — Staff workload, counted by who did the work (Phase 116)
-- ============================================================================
-- The owner's "Staff Workload" sheet: for a span of time, how many tasks
-- each staff member finished, split into pet routines and chores.
--
-- Counted by the COMPLETER, never the assignee:
--   - pet routines have no assignee at all — a routine belongs to the house,
--     and whoever logs it is task_logs.staff_id (migrations/071);
--   - a chore assigned to Ari but finished by Syam is Syam's work, so chores
--     count by household_tasks.completed_by (migrations/082), not assigned_to.
--
-- What counts as one pet task: one log of a pet routine for one dog — feeding
-- three dogs breakfast is three. A vet visit's check-in is not counted, only
-- the log that closes it (check_out / admitted), so a visit counts once.
-- Logs with no staff_id (from before staff had identities, or logged on the
-- owner's own phone) belong to nobody here; they come back as one row with a
-- null staff_id, so the sheet can say how much went unattributed rather
-- than quietly leaving it out.
--
-- Every staff profile in the household is returned, at zero if need be, so a
-- person who did nothing this week shows as 0 rather than not at all.
--
-- Owner-only. Staff phones are `authenticated` too and pass the tenant read
-- policies, so RLS alone would let one colleague total up another's week.
-- The function refuses any caller without a household_members row for the
-- household — the same owner test as 099's inventory guard. SECURITY INVOKER,
-- so the caller's own RLS applies to everything it reads on top of that.
--
-- Additive only: one function, one index. Nothing existing changes.
-- ============================================================================

create index if not exists task_logs_completed_at_idx on task_logs(completed_at);
create index if not exists household_tasks_completed_at_idx
  on household_tasks(household_id, completed_at)
  where status = 'completed';

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
       and coalesce(l.sub_type, 'complete') <> 'check_in'
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
    -- The unattributed row, only when there is something in it.
    select null::uuid, null::text
     where exists (select 1 from pets where who is null)
        or exists (select 1 from chores where who is null)
  )
  -- Cast to the declared result types: RETURN QUERY demands an exact match,
  -- and a varchar name column would otherwise fail at call time.
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
