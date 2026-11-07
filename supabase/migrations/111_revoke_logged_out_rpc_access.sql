-- Phase 143: close the logged-out door on RPCs only signed-in callers use.
-- Applied to Miamus Staging and Miamus (production) on 2026-11-05 as
-- `phase_143_revoke_logged_out_rpc_access` (production version 20261105140223).
--
-- Supabase grants EXECUTE on new public functions to PUBLIC (and so to anon).
-- These predate the habit of revoking it (cf. phases 141/142). Each already
-- refuses a null auth.uid(), so nothing was reachable; this makes the grants
-- say what the code already assumes.
--
-- Staff phones are NOT affected: they call signInAnonymously() first, and an
-- anonymous session carries the `authenticated` role, which keeps its grant.
-- Every RLS policy is `to authenticated`, so `anon` never evaluates
-- get_user_household_ids() inside a policy either.

revoke all on function public.get_user_household_ids() from public, anon;
revoke all on function public.list_household_members() from public, anon;
revoke all on function public.redeem_staff_invite(text) from public, anon;
revoke all on function public.remove_household_member(uuid) from public, anon;
revoke all on function public.use_owner_invite_token(text) from public, anon;
revoke all on function public.set_staff_pin(uuid, text) from public, anon;
revoke all on function public.verify_staff_pin(uuid, text) from public, anon;

grant execute on function public.get_user_household_ids() to authenticated, service_role;
grant execute on function public.list_household_members() to authenticated, service_role;
grant execute on function public.redeem_staff_invite(text) to authenticated, service_role;
grant execute on function public.remove_household_member(uuid) to authenticated, service_role;
grant execute on function public.use_owner_invite_token(text) to authenticated, service_role;
grant execute on function public.set_staff_pin(uuid, text) to authenticated, service_role;
grant execute on function public.verify_staff_pin(uuid, text) to authenticated, service_role;

-- A trigger function: nothing calls it directly, and triggers fire without an
-- EXECUTE grant (create_member_profile and notify_sick_report already run that
-- way for signed-in users). So no API role needs it.
revoke all on function public.inventory_items_owner_guard() from public, anon, authenticated;
grant execute on function public.inventory_items_owner_guard() to service_role;
