-- ============================================================================
-- 136 — An admin may finish their own chore without photos (Phase 163, D3 A)
-- ============================================================================
-- "My tasks" on Today (docs/phase-163-my-tasks-plan.md) lets an admin tick off
-- a chore given to them without leaving the owner app. Migration 104 refuses
-- any change to 'completed' without both a before and an after photo, for
-- everyone. That rule exists for staff work, where the photos are the proof
-- an owner reviews; for an owner's own chore there is nobody to prove it to.
--
-- WHAT CHANGES. Becoming completed with NO photos at all is allowed when all
-- of these hold (the plan's four conditions):
--   1. the caller is signed in and has a household_members row for the
--      chore's household (an admin; never get_user_household_ids(), which
--      every staff phone passes);
--   2. new.completed_by is the caller's own roster row (staff_profiles with
--      user_id = auth.uid(), same household; migrations/106);
--   3. the chore is the caller's or nobody's: new.assigned_to is null or that
--      row, and on an update old.assigned_to is too. Who records a completion
--      doesn't say whose chore it is (Codex, PR #56); checking the old value
--      means a staff chore can't be reassigned and finished photo-free in one
--      write;
--   4. both photos are null.
--
-- WHAT DOESN'T. Staff phones, the service role, and an admin finishing anyone
-- else's chore still need both photos. One photo alone is still refused
-- ("both, or none"). History is still untouched: only the transition to
-- completed is checked, as in 104.
--
-- The function now reads household_members and staff_profiles, so it is
-- security definer with an empty search_path. A trigger function: nothing
-- calls it directly, and triggers fire without an EXECUTE grant (as for
-- household_tasks_owner_guard, migrations/128), so EXECUTE is revoked from
-- everyone the API can act as.
--
-- Additive: the same trigger, a new function body that only allows more, and
-- only for admins. Safe to apply before the app that uses it.
-- ============================================================================

create or replace function public.require_chore_proof_photos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  my_row uuid;
begin
  if new.status = 'completed'
     and (tg_op = 'INSERT' or old.status is distinct from 'completed')
     and (new.before_photo_url is null or new.after_photo_url is null)
  then
    -- Both, or none: the photo-free path is only for no photos at all.
    if new.before_photo_url is null and new.after_photo_url is null and caller is not null
       and exists (
         select 1 from public.household_members m
          where m.user_id = caller and m.household_id = new.household_id
       )
    then
      select s.id into my_row
        from public.staff_profiles s
       where s.user_id = caller and s.household_id = new.household_id;

      if my_row is not null
         and new.completed_by = my_row
         and (new.assigned_to is null or new.assigned_to = my_row)
         and (tg_op = 'INSERT' or old.assigned_to is null or old.assigned_to = my_row)
      then
        return new;
      end if;
    end if;

    raise exception 'A chore is completed with both a before and an after photo'
      using errcode = '23514',
            hint = 'Reload the app: this version may predate before/after photos.';
  end if;
  return new;
end;
$$;

revoke all on function public.require_chore_proof_photos() from public, anon, authenticated;
grant execute on function public.require_chore_proof_photos() to service_role;

-- The trigger itself is unchanged (migrations/104); re-created so this file
-- stands on its own on a database where 104's trigger was dropped by hand.
drop trigger if exists household_tasks_require_proof_photos on public.household_tasks;
create trigger household_tasks_require_proof_photos
  before insert or update of status on public.household_tasks
  for each row execute function public.require_chore_proof_photos();
