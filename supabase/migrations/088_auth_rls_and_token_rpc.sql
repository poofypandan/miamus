-- ============================================================================
-- Phase 86C — auth-backed RLS and the invite-token RPC
-- ============================================================================
-- Replaces the Phase 86B placeholders on household_members and staff_invites
-- with policies keyed to a real Supabase Auth identity, and gives the staff
-- magic link a way in that never exposes the tokens themselves.
--
-- SCOPE, PLAINLY: this locks the two SaaS tables. The operational tables
-- (task_entities, task_logs, inventory_*, …) are still readable and writable
-- by `anon`, because the staff PIN flow has no auth identity and locking them
-- now would take the whole staff view offline. Tenant separation for those
-- tables is still enforced in the app (the household_id filters from 86A),
-- not by the database. It becomes real the day staff devices carry a token.
-- ============================================================================

-- --- household_members ------------------------------------------------------
-- A row is yours or it is none of your business. No DELETE policy: leaving a
-- household is not a thing the app does yet, and a missing verb is one a
-- leaked key cannot use.
drop policy if exists "placeholder_all_household_members" on household_members;

drop policy if exists "members_select_own" on household_members;
create policy "members_select_own" on household_members
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "members_insert_own" on household_members;
create policy "members_insert_own" on household_members
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "members_update_own" on household_members;
create policy "members_update_own" on household_members
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- --- staff_invites ----------------------------------------------------------
-- `anon` gets nothing at all: the token IS the secret behind the WhatsApp
-- link, and a public SELECT would hand every token to anyone holding the key
-- that ships in the bundle. Staff redeem through use_staff_invite_token()
-- below instead, which returns a household and never the token list.
drop policy if exists "placeholder_all_staff_invites" on staff_invites;

drop policy if exists "invites_select_owner" on staff_invites;
create policy "invites_select_owner" on staff_invites
  for select to authenticated using (
    exists (
      select 1 from household_members m
      where m.household_id = staff_invites.household_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "invites_insert_owner" on staff_invites;
create policy "invites_insert_owner" on staff_invites
  for insert to authenticated with check (
    exists (
      select 1 from household_members m
      where m.household_id = staff_invites.household_id and m.user_id = auth.uid()
    )
  );

-- --- households -------------------------------------------------------------
-- 086 left only a read policy, which makes onboarding impossible: signing in
-- with Google and naming your residence is an INSERT. Restricted to stamping
-- yourself as the owner, so nobody can create a household in someone's name.
drop policy if exists "households_insert_own" on households;
create policy "households_insert_own" on households
  for insert to authenticated with check (owner_auth_id = auth.uid());

-- ============================================================================
-- use_staff_invite_token — the magic link's only door
-- ============================================================================
-- SECURITY DEFINER so it can read a table `anon` cannot: a staff phone has no
-- auth identity, and the whole point is to learn which household it belongs to
-- without being able to enumerate invites. It takes a token and answers with
-- one household id, or raises.
--
-- search_path is pinned: a definer function that resolves names through the
-- caller's search_path can be tricked into running a shadowed table.
--
-- The update is part of the same statement that selects the row, so two
-- phones redeeming the same token at the same instant can't both win.
-- ============================================================================
create or replace function use_staff_invite_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  resolved uuid;
begin
  update staff_invites
     set used_at = now()
   where token = p_token
     and expires_at > now()
     and used_at is null
  returning household_id into resolved;

  if resolved is null then
    -- Deliberately one message for "no such token", "expired" and "already
    -- used": a caller probing tokens learns only that this one is no good.
    raise exception 'invalid_or_expired_invite' using errcode = '22023';
  end if;

  return resolved;
end;
$$;

-- The anon role is exactly who calls this: a staff phone before it has any
-- identity at all.
grant execute on function use_staff_invite_token(text) to anon, authenticated;
