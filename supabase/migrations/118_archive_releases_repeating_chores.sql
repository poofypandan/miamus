-- ============================================================================
-- 118 — Removing someone also releases their repeating chores (Phase 141)
-- ============================================================================
-- Codex review, PR #1 (P1). archive_staff_profile (109) releases the chores
-- a person still owes: `assigned_to = them and status = 'pending'`. A
-- repeating chore is one row, the template, whose status describes only its
-- FIRST day. Once that first day was done the template reads 'completed',
-- so 109 left it assigned to them — and every later day of the repeat is
-- generated from the template, assignee included (expandChores,
-- lib/chore-recurrence.ts). occurrencesForStaff then hides a chore assigned
-- to someone else from every remaining worker, so a daily or weekly chore
-- could stay with a person who no longer works there, and nobody would see
-- it.
--
-- THE FIX. Release a repeating template whatever its status (a cancelled
-- one is left alone: it generates nothing). One-off chores they finished
-- are not touched: they are the record.
--
-- KEEPING WHO DID THE FIRST DAY. On a completed template, the first day's
-- "who" is read as assigned_to, falling back to completed_by
-- (staff-completion-strip.tsx); "Done by" reads completed_by. Where
-- completed_by is empty, it takes the old assignee before assigned_to is
-- cleared, so that first day still shows the same name. (SET expressions
-- read the row's values from before the update.)
--
-- BACKFILL. The same release for everyone already removed, so repeats held
-- by people archived under 109 come back to the household.
--
-- Replaces archive_staff_profile in place (same signature and grants).
-- Everything else in it is 109's function as it was.
-- ============================================================================

create or replace function archive_staff_profile(p_staff_id uuid)
returns staff_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row staff_profiles;
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

  -- Unfinished chores, and every repeating chore they hold (see the header).
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

  return v_row;
end;
$$;

revoke all on function archive_staff_profile(uuid) from public, anon;
grant execute on function archive_staff_profile(uuid) to authenticated;

-- People removed before this migration.
update household_tasks t
   set assigned_to = null,
       completed_by = case
         when t.status = 'completed' then coalesce(t.completed_by, t.assigned_to)
         else t.completed_by
       end
  from staff_profiles s
 where s.id = t.assigned_to
   and s.household_id = t.household_id
   and s.archived_at is not null
   and (t.status = 'pending'
        or (t.status = 'completed' and t.recurrence in ('daily', 'weekly', 'monthly')));
