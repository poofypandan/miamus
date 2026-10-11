-- ============================================================================
-- 108 — Leave ("Cuti") and what happens to a person's chores while away
-- (Phase 140)
-- ============================================================================
-- Someone asks for days off from Action Mode; an admin approves it and says
-- what becomes of that person's chores in the meantime:
--
--   reassign  every chore of theirs on those days goes to fallback_assignee_id
--   unassign  it goes back to "anyone", for whoever picks it up
--   pause     it is skipped for those days altogether
--
-- Nothing here rewrites a chore. Repeating chores are not generated ahead of
-- time — a repeat is one template row, and its days are worked out on the
-- device (lib/chore-recurrence.ts) — so the triage is applied at that same
-- point (lib/leave.ts), against the approved requests below. Leave ending, on
-- its date or early, therefore needs no clean-up: the next render simply
-- stops applying it.
--
-- WHO. `staff_id` is a roster row (staff_profiles), not an auth user: the
-- people on PIN phones have no account of their own, only the household's
-- device session — and since migrations/106 admins have a roster row too, so
-- one column covers everyone who can be assigned a chore.
--
-- That also bounds what RLS can promise. A staff phone is bound to a
-- household, not to a person, so the database cannot tell which person on it
-- is asking. Staff-side writes are therefore limited by *what* they can do —
-- file a pending request, end an approved one early — and every decision
-- (approve, reject, the fallback) is reserved to admins, who are real accounts.
-- ============================================================================

create table if not exists leave_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  -- Cascade: a person removed from the roster has no leave left to manage.
  staff_id uuid not null references staff_profiles(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'ended_early')),
  -- Required once approved (see the check below); null while pending.
  fallback_action text check (fallback_action in ('reassign', 'unassign', 'pause')),
  -- Set null rather than cascade: losing the cover person must not delete the
  -- leave. lib/leave.ts treats a reassign with no one to reassign to as
  -- unassign, so the chores still reach someone.
  fallback_assignee_id uuid references staff_profiles(id) on delete set null,
  -- The first day the person is back, when they return before end_date. Leave
  -- covers start_date up to (not including) this day.
  ended_on date,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),

  constraint leave_requests_dates check (end_date >= start_date),
  constraint leave_requests_decision check (
    status in ('pending', 'rejected')
    or (
      fallback_action is not null
      and (fallback_action <> 'reassign' or fallback_assignee_id is not null)
    )
  ),
  constraint leave_requests_no_self_cover check (fallback_assignee_id is distinct from staff_id)
);

create index if not exists leave_requests_household_end_idx on leave_requests(household_id, end_date);
create index if not exists leave_requests_staff_idx on leave_requests(staff_id);

-- Explicit, never assumed (migrations/107): without these the role check that
-- runs before RLS refuses everything on newer projects.
grant select, insert, update, delete on leave_requests to authenticated, service_role;

alter table leave_requests enable row level security;

-- Everyone in the house can see who is away: the cover person needs to know
-- why chores have appeared on their list, and Action Mode reads its own
-- pending or approved request back from here.
drop policy if exists "leave_select_household" on leave_requests;
create policy "leave_select_household" on leave_requests
  for select to authenticated
  using (household_id = any (get_user_household_ids()));

-- Anyone in the house may ask, for someone on its own roster — and only ask:
-- a request is born pending, undecided, with no fallback.
drop policy if exists "leave_insert_pending" on leave_requests;
create policy "leave_insert_pending" on leave_requests
  for insert to authenticated
  with check (
    household_id = any (get_user_household_ids())
    and status = 'pending'
    and fallback_action is null
    and fallback_assignee_id is null
    and ended_on is null
    and decided_by is null
    and decided_at is null
    and exists (
      select 1 from staff_profiles s
       where s.id = leave_requests.staff_id and s.household_id = leave_requests.household_id
    )
  );

-- Deciding is for admins: an account in household_members.
drop policy if exists "leave_update_admin" on leave_requests;
create policy "leave_update_admin" on leave_requests
  for update to authenticated
  using (exists (
    select 1 from household_members m
     where m.household_id = leave_requests.household_id and m.user_id = auth.uid()
  ))
  with check (
    exists (
      select 1 from household_members m
       where m.household_id = leave_requests.household_id and m.user_id = auth.uid()
    )
    and (
      fallback_assignee_id is null
      or exists (
        select 1 from staff_profiles s
         where s.id = leave_requests.fallback_assignee_id
           and s.household_id = leave_requests.household_id
      )
    )
  );

drop policy if exists "leave_delete_admin" on leave_requests;
create policy "leave_delete_admin" on leave_requests
  for delete to authenticated
  using (exists (
    select 1 from household_members m
     where m.household_id = leave_requests.household_id and m.user_id = auth.uid()
  ));

-- ----------------------------------------------------------------------------
-- end_leave_early — "I'm back early", from any device in the house
-- ----------------------------------------------------------------------------
-- The one change staff may make to an approved request, so it goes through
-- here rather than an UPDATE policy that would also let them approve one.
-- `p_today` comes from the phone: the household's day, not the server's UTC
-- one, which in Indonesia is still yesterday until 7am. Clamped to the
-- request, so it can only shorten the leave, never lengthen or erase it.
create or replace function end_leave_early(p_id uuid, p_today date)
returns leave_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated leave_requests;
begin
  update leave_requests
     set status = 'ended_early',
         ended_on = greatest(start_date, least(p_today, end_date + 1))
   where id = p_id
     and status = 'approved'
     and household_id = any (get_user_household_ids())
  returning * into updated;

  if updated.id is null then
    raise exception 'leave_not_active' using errcode = '22023';
  end if;
  return updated;
end;
$$;

revoke all on function end_leave_early(uuid, date) from public, anon;
grant execute on function end_leave_early(uuid, date) to authenticated;
