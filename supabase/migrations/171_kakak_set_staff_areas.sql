-- ============================================================================
-- 171 — Kakak may record set_staff_areas (Phase 178 follow-up)
-- ============================================================================
-- docs/phase-178-staff-areas-plan.md, section 7 (follow-up). Kakak's new
-- tool, set_staff_areas (what one staff member sees), is named in
-- kakak_requests.tools like every other tool. 155 allowed only six names, in
-- two places, so recording a call that used it would raise bad_tools: the
-- owner's card would still work, but that call's tokens and cost would never
-- be written. Numbered 171: given by the manager, 2026-11-13 (167 to 169 are
-- reserved by other specs, 170 is #139). Additive only: every name 155
-- accepted is still accepted. The staff areas themselves need nothing new:
-- the owner's card saves staff_profiles.hidden_areas through the owner's
-- own switches' path (165, admin_update_staff_profiles).
--
-- REPLACED
--   kakak_requests_tools_check  the same rule (at most 20 names, all known)
--        with set_staff_areas added. Dropped and added again; existing rows
--        hold only the old names, so they pass.
--
-- RE-CREATED (from its newest definition, 155)
--   kakak_record  unchanged except set_staff_areas in its p_tools list.
--        Still SECURITY DEFINER with search_path = public, pg_temp; EXECUTE
--        revoked from public, anon and granted to authenticated, as 126 and
--        155 did.
--
-- NOT CHANGED
--   kakak_begin, kakak_set_result, the tables' RLS and grants, retention,
--   staff_profiles.
--
-- Test: supabase/tests/171_kakak_set_staff_areas.sql (local only).

-- --- 1. The tools column ------------------------------------------------------------
alter table public.kakak_requests drop constraint if exists kakak_requests_tools_check;
alter table public.kakak_requests add constraint kakak_requests_tools_check check (
  cardinality(tools) <= 20
  and tools <@ array['create_chore', 'add_to_shopping_list', 'add_pet_routine', 'add_food', 'put_away_ingredient', 'set_staff_areas', 'ask_question']::text[]
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
      or not p_tools <@ array['create_chore', 'add_to_shopping_list', 'add_pet_routine', 'add_food', 'put_away_ingredient', 'set_staff_areas', 'ask_question']::text[]) then
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

-- --- 3. Grants (as 126 and 155) --------------------------------------------------------------
revoke all on function public.kakak_record(uuid, text, text, text[], int, int, int, int, bigint, int) from public, anon;
grant execute on function public.kakak_record(uuid, text, text, text[], int, int, int, int, bigint, int) to authenticated;
