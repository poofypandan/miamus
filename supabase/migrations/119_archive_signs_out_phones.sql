-- ============================================================================
-- 119 — Removing someone signs their phone out, and stops work in their name
-- ============================================================================
-- Codex review, PR #1 (P1). Archiving (109) clears the PIN, which stops the
-- NEXT sign-in. It did nothing about a phone already signed in as them:
--
--   * the phone keeps their staff id in localStorage, and StaffLoginGate
--     restores it without asking for the PIN again;
--   * the phone's device_sessions row still links it to the household, so
--     get_user_household_ids() (089) and the policies on it (090) still let
--     it read and write — and record new work under the removed person.
--
-- A device_sessions row is a PHONE, not a person: a shared kitchen phone
-- serves several staff. So archiving cannot simply revoke "their" session;
-- there isn't one. Three layers instead:
--
--   1. Here: phones whose most recent successful PIN sign-in was this person
--      (staff_sign_in_attempts, 115) are unlinked, the same way
--      remove_linked_phone does it. A shared phone they used last is unlinked
--      too; the next person links it again with the house code. Removing a
--      person is a security act (109), so that is the right side to err on.
--      Phones they never signed in on with a PIN since 115 are not found this
--      way; the owner removes those under "Linked staff phones", and the
--      remove dialog says so.
--   2. Here: work can no longer be recorded under a removed person by a
--      phone (task_logs.staff_id, household_tasks.assigned_to/completed_by).
--      Only writes made directly by a phone are checked: definer functions
--      and migrations decide for themselves (118 deliberately writes a removed
--      person's name onto a first day they already did).
--   3. In the app: a phone whose remembered person has been removed forgets
--      them and goes back to "who is on duty?" (staff-login-gate.tsx).
--
-- archive_staff_profile is replaced in place (same signature and grants);
-- everything else in it is 118's function.
-- ============================================================================

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

  -- The phones they were last signed in on (see the header, layer 1).
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

-- --- No new work in a removed person's name (layer 2) -----------------------
-- SECURITY INVOKER on purpose: current_user is then the caller's role.
-- A phone or an owner's browser writing through the Data API is
-- `authenticated`; inside a definer function or a migration it is the
-- function's owner, and the check steps aside. The roster lookup runs with
-- the caller's own rights, which include their household's staff_profiles
-- and its archived_at column (109).
create or replace function public.is_archived_staff(p_staff_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_staff_id is not null and exists (
    select 1 from public.staff_profiles s
     where s.id = p_staff_id and s.archived_at is not null
  );
$$;

create or replace function public.refuse_archived_staff_on_logs()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if (tg_op = 'INSERT' or new.staff_id is distinct from old.staff_id)
     and public.is_archived_staff(new.staff_id) then
    raise exception 'staff_archived' using errcode = '42501',
      hint = 'This person was removed from the household; work is no longer recorded in their name.';
  end if;
  return new;
end;
$$;

create or replace function public.refuse_archived_staff_on_chores()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if ((tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to)
        and public.is_archived_staff(new.assigned_to))
     or ((tg_op = 'INSERT' or new.completed_by is distinct from old.completed_by)
        and public.is_archived_staff(new.completed_by)) then
    raise exception 'staff_archived' using errcode = '42501',
      hint = 'This person was removed from the household; work is no longer recorded in their name.';
  end if;
  return new;
end;
$$;

drop trigger if exists task_logs_refuse_archived_staff on public.task_logs;
create trigger task_logs_refuse_archived_staff
  before insert or update of staff_id on public.task_logs
  for each row execute function public.refuse_archived_staff_on_logs();

drop trigger if exists household_tasks_refuse_archived_staff on public.household_tasks;
create trigger household_tasks_refuse_archived_staff
  before insert or update of assigned_to, completed_by on public.household_tasks
  for each row execute function public.refuse_archived_staff_on_chores();

-- Trigger functions run as the caller and are never called directly.
revoke all on function public.is_archived_staff(uuid) from public, anon;
grant execute on function public.is_archived_staff(uuid) to authenticated, service_role;
revoke all on function public.refuse_archived_staff_on_logs() from public, anon, authenticated;
revoke all on function public.refuse_archived_staff_on_chores() from public, anon, authenticated;
