-- ============================================================================
-- 116 — The 30-day clean-up rechecks the decision under a lock (Phase 148)
-- ============================================================================
-- Codex review, PR #5 (P2). prune_household_access_requests (113) picks its
-- rejected requests first and deletes the accounts afterwards. If an admin
-- approves one of those requests in between, decide_household_access only
-- updates the request row; nothing it does touches the account row that 113
-- locks, so the clean-up went on and deleted an account that had just been
-- approved. A rejection renewed in between (restarting its 30 days) was
-- ignored the same way.
--
-- THE FIX. Each request is locked (FOR UPDATE) and its status and decided_at
-- read again before anything is deleted, and the lock is held until the
-- account is gone. decide_household_access updates that same row, so the two
-- are serialised:
--   * a decision that commits first is seen by the recheck, and the account
--     is left alone;
--   * a decision that comes after waits for the clean-up, then finds no
--     request ("request_not_found"), which the approvals screen already
--     shows as an error, rather than approving a deleted account.
-- Lock order: request, then account. Nothing else locks both, so the two
-- locks cannot deadlock with another path.
--
-- Everything else is 113's function as it was: the account-row lock against
-- a membership, device session or admin row being added at the same moment,
-- and a failure keeping the request so the next night retries it.
--
-- Additive: one function replaced in place, same signature and grants.
-- ============================================================================

create or replace function public.prune_household_access_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target record;
  current_status text;
  current_decided timestamptz;
  removed integer := 0;
begin
  for target in
    select r.user_id
      from public.household_access_requests r
     where r.status = 'rejected'
       and r.decided_at < now() - interval '30 days'
  loop
    begin
      -- The request first, then a fresh look at it: a decision made since the
      -- loop's query, or one waiting on this lock, decides what happens next.
      select r.status, r.decided_at
        into current_status, current_decided
        from public.household_access_requests r
       where r.user_id = target.user_id
       for update;

      if not found
         or current_status <> 'rejected'
         or current_decided >= now() - interval '30 days'
      then
        continue;
      end if;

      perform 1 from auth.users u where u.id = target.user_id for update;

      if found
         and not exists (select 1 from public.household_members m where m.user_id = target.user_id)
         and not exists (select 1 from public.device_sessions d where d.user_id = target.user_id)
         and not exists (select 1 from public.platform_admins pa where pa.user_id = target.user_id)
      then
        -- Cascades to the request row, identities, sessions and push devices.
        delete from auth.users u where u.id = target.user_id;
      else
        -- Gone already, or kept because it is something else now: only the
        -- request goes.
        delete from public.household_access_requests r where r.user_id = target.user_id;
      end if;
      removed := removed + 1;
    exception when others then
      -- The block's changes roll back, the request with them: retried tomorrow.
      raise warning 'Rejected account % not deleted, will retry: %', target.user_id, sqlerrm;
    end;
  end loop;

  return removed;
end;
$$;

-- Replaced in place: create or replace keeps 113's grants, restated so this
-- file reads on its own.
revoke all on function public.prune_household_access_requests() from public, anon, authenticated;
grant execute on function public.prune_household_access_requests() to service_role;
