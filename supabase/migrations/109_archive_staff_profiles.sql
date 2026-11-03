-- ============================================================================
-- Phase 141 — archiving a person off the roster
-- ============================================================================
-- Until now a name added to People & PINs was permanent. Someone who leaves
-- the household stays on the sign-in screen, in every assignee dropdown and in
-- the workload strip forever, and the only way out was to leave them there.
--
-- WHY ARCHIVE RATHER THAN DELETE. Three columns point at this table —
-- task_logs.staff_id, household_tasks.assigned_to and .completed_by — all
-- `on delete set null` (migrations/071, /082). A hard delete would therefore
-- succeed and quietly strip the author off months of finished work: the photo
-- of Tuesday's mopping would still be there with nobody's name on it. The
-- record of who did what is the point of the attribution columns, so the row
-- stays and is marked instead. `archived_at` doubles as the date they left.
--
-- Reversible on purpose: restoring is one call, because "removed the wrong
-- person" is a likelier mistake than any it prevents.
-- ============================================================================

alter table staff_profiles add column if not exists archived_at timestamptz;

-- staff_profiles is granted column by column, not table-wide (migrations/096
-- keeps the bcrypt `pin` unreadable, /107 keeps it that way deliberately), so
-- a new column arrives with no SELECT on it at all. Without this grant the
-- roster read falls back to its pre-109 column set and every archived person
-- silently reappears — the failure mode is a feature that looks applied and
-- does nothing.
grant select (archived_at) on staff_profiles to authenticated;

comment on column staff_profiles.archived_at is
  'When this person was taken off the active roster. Null = active. Their past work keeps their name; see migrations/109.';

-- ============================================================================
-- caller_admin_household
-- ============================================================================
-- The household the caller ADMINISTERS, or null.
--
-- Deliberately not get_user_household_ids(): that one unions household_members
-- with device_sessions, so it answers "may this session see this household's
-- data?" — true for every staff phone. Taking a colleague off the roster is an
-- owner's act, so it has to be the narrower question, the same one
-- remove_household_member asks (migrations/094).
--
-- This matters more than it looks. Staff devices sign in with
-- supabase.auth.signInAnonymously() (lib/auth/device-session.ts), and an
-- anonymous Supabase session carries the `authenticated` role — not `anon`. A
-- function granted to `authenticated` and guarded only by
-- get_user_household_ids() is therefore callable from any staff phone in the
-- household.
-- ============================================================================
create or replace function caller_admin_household()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select hm.household_id from household_members hm
   where hm.user_id = auth.uid()
   limit 1;
$$;

revoke all on function caller_admin_household() from public, anon;
grant execute on function caller_admin_household() to authenticated;

-- ============================================================================
-- archive_staff_profile
-- ============================================================================
-- Security-definer, matching how household membership is managed
-- (migrations/094): the function re-checks the caller's household itself, so
-- the client is asking the database to decide rather than being trusted.
--
-- Does three things in one transaction, because any two of them without the
-- third leaves the household in a worse state than before:
--   1. marks the row archived;
--   2. revokes the PIN, so the phone in their hand stops working now rather
--      than whenever someone remembers — removing a person is a security act;
--   3. releases chores still assigned to them and not yet done, which would
--      otherwise sit in a feed nobody can see (occurrencesForStaff shows an
--      assigned chore only to its assignee) and quietly never get done.
--
-- Completed chores are deliberately NOT touched: they are the record.
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
  -- (remove_household_member); doing it here would strip them from the roster
  -- while leaving them signed in and able to use Manage.
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

  update household_tasks
     set assigned_to = null
   where household_id = v_row.household_id
     and assigned_to = p_staff_id
     and status = 'pending';

  return v_row;
end;
$$;

-- ============================================================================
-- restore_staff_profile
-- ============================================================================
-- They come back, or the wrong name was tapped. The PIN stays cleared: they
-- choose a new one on their next sign-in, which is the same path a brand-new
-- person takes and avoids silently reviving a credential that was revoked.
-- Chores released by the archive are not reassigned — that is a decision for
-- whoever is running the house, not for an undo.
-- ============================================================================
create or replace function restore_staff_profile(p_staff_id uuid)
returns staff_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row staff_profiles;
begin
  update staff_profiles
     set archived_at = null
   where id = p_staff_id
     and household_id = caller_admin_household()
  returning * into v_row;

  if not found then
    raise exception 'No such person in your household' using errcode = '42501';
  end if;

  return v_row;
end;
$$;

-- Granted to `authenticated`, which a staff phone's anonymous session also
-- holds — so the role grant alone decides nothing. What keeps staff out is
-- caller_admin_household() inside each function, which only a row in
-- household_members satisfies.
revoke all on function archive_staff_profile(uuid) from public, anon;
revoke all on function restore_staff_profile(uuid) from public, anon;
grant execute on function archive_staff_profile(uuid) to authenticated;
grant execute on function restore_staff_profile(uuid) to authenticated;
