-- ============================================================================
-- 181 — Kakak may record add_staff and remove_staff (staff onboarding, step 5)
-- ============================================================================
-- docs/private/staff-onboarding-plan.md, section 6. Kakak's two new tools,
-- add_staff (a new staff member, or one who left coming back) and
-- remove_staff (someone who no longer works here), are named in
-- kakak_requests.tools like every other tool. Without this, recording a call
-- that used one would raise bad_tools: the owner's card would still work,
-- but that call's tokens and cost would never be written. Numbered 181:
-- 180 to 182 are reserved for staff onboarding (manager, 20 Nov).
--
-- Additive only. The list also names plan_dish, which 174 (the "Can we cook
-- it?" stack, not merged yet) adds, so whichever of 174 and 181 is applied
-- last, every tool both stacks use is accepted. Every name 171 accepted is
-- still accepted. The cards themselves need nothing new: they save through
-- the owner's own paths (apply_household_setup, 147; archive_staff_profile
-- with give_to, 180).
--
-- REPLACED
--   kakak_requests_tools_check  the same rule (at most 20 names, all known)
--        with plan_dish, add_staff and remove_staff added. Dropped and added
--        again; existing rows hold only known names, so they pass.
--
-- RE-CREATED (from its newest definition, 171, as 174 re-creates it)
--   kakak_record  unchanged except the p_tools list. Still SECURITY DEFINER
--        with search_path = public, pg_temp; EXECUTE revoked from public and
--        anon, granted to authenticated, as 126, 155, 171 and 174 did. Its
--        guard is a household_members row for the request's household, so a
--        staff phone (authenticated, anonymous) is refused.
--
-- NOT CHANGED
--   kakak_begin, kakak_set_result, the tables' RLS and grants, retention,
--   staff_profiles.
--
-- Test: supabase/tests/181_kakak_staff_tools.sql (local only).

-- --- 1. The tools column ------------------------------------------------------------
alter table public.kakak_requests drop constraint if exists kakak_requests_tools_check;
alter table public.kakak_requests add constraint kakak_requests_tools_check check (
  cardinality(tools) <= 20
  and tools <@ array['create_chore', 'add_to_shopping_list', 'add_pet_routine', 'add_food', 'put_away_ingredient', 'set_staff_areas', 'plan_dish', 'add_staff', 'remove_staff', 'ask_question']::text[]
);

-- --- 2. kakak_record ----------------------------------------------------------------
-- After the call: fills in the pending row once, within 5 minutes of
-- kakak_begin. The cost is clamped to the most one call can cost.
create or replace function public.kakak_record(
  p_request uuid, p_model text, p_outcome text, p_tools text[],
  p_input_tokens int, p_cache_read_tokens int, p_cache_write_tokens int, p_output_tokens int,
  p_cost_micro_usd bigint, p_latency_ms int)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.kakak_requests%rowtype;
  v_max bigint;
begin
  select * into v_row from public.kakak_requests r where r.id = p_request for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.household_members m
                  where m.user_id = auth.uid() and m.household_id = v_row.household_id) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if v_row.outcome <> 'pending' then
    raise exception 'already_recorded' using errcode = '55000';
  end if;
  if v_row.created_at < now() - interval '5 minutes' then
    raise exception 'too_late' using errcode = '55000';
  end if;

  if p_outcome is null or p_outcome not in ('question', 'suggestion', 'message', 'error') then
    raise exception 'bad_outcome' using errcode = '22023';
  end if;
  if p_model is not null and (length(p_model) > 64 or p_model !~ '^[A-Za-z0-9._:-]+$') then
    raise exception 'bad_model' using errcode = '22023';
  end if;
  if p_tools is not null and (cardinality(p_tools) > 20 or array_position(p_tools, null) is not null
      or not p_tools <@ array['create_chore', 'add_to_shopping_list', 'add_pet_routine', 'add_food', 'put_away_ingredient', 'set_staff_areas', 'plan_dish', 'add_staff', 'remove_staff', 'ask_question']::text[]) then
    raise exception 'bad_tools' using errcode = '22023';
  end if;
  if p_input_tokens < 0 or p_cache_read_tokens < 0 or p_cache_write_tokens < 0
     or p_output_tokens < 0 or p_cost_micro_usd < 0 or p_latency_ms < 0 then
    raise exception 'negative_value' using errcode = '22023';
  end if;

  select c.max_call_cost_micro_usd into v_max from public.kakak_config c where c.id;

  update public.kakak_requests
     set model = p_model,
         outcome = p_outcome,
         tools = coalesce(p_tools, '{}'),
         input_tokens = p_input_tokens,
         cache_read_tokens = p_cache_read_tokens,
         cache_write_tokens = p_cache_write_tokens,
         output_tokens = p_output_tokens,
         cost_micro_usd = least(p_cost_micro_usd, coalesce(v_max, 0)),
         latency_ms = p_latency_ms
   where id = p_request;
end;
$$;

-- --- 3. Grants (as 126, 155, 171 and 174) --------------------------------------------------------------
revoke all on function public.kakak_record(uuid, text, text, text[], int, int, int, int, bigint, int) from public, anon;
grant execute on function public.kakak_record(uuid, text, text, text[], int, int, int, int, bigint, int) to authenticated;
