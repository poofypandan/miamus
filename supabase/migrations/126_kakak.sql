-- ============================================================================
-- 126 — Kakak: switch, daily limits and call statistics (Phase 156, step 2)
-- ============================================================================
-- docs/phase-156-step2-kakak-plan.md, sections 4 and 10. Kakak turns an
-- owner's sentence into a suggested chore, shopping item, pet routine or food
-- entry. This migration holds only the switch, the counters and per-call
-- statistics. NO TEXT COLUMN HOLDS WHAT ANYONE SAID: the only text columns
-- are short codes (model name, outcome, result, tool names), each held to a
-- fixed list or pattern by a CHECK.
--
-- THE PIECES
--   kakak_settings   per household: allowed (by the platform admin), enabled
--                    (by an owner), who last changed it and when, the daily
--                    limit (40). Admins of the household can read it.
--   kakak_usage      calls per household per Jakarta day. Functions only.
--                    Rows older than 35 days are deleted nightly.
--   kakak_requests   one row per call: who, when, model, outcome, tools
--                    used, token counts, cost, latency, and what the owner did
--                    with the suggestion. Admins of the household can read it.
--                    Deleted after 13 months. Statistics only: no check reads
--                    them; Anthropic's console is the source of truth for cost.
--   kakak_config     one row: the global daily call cap (400) and the most one
--                    call can cost (150,000 micro-USD). No client access;
--                    the platform admin changes it with SQL.
--
-- WHO MAY CALL WHAT. "Admin" is a household_members row for auth.uid() and
-- the given household — the question caller_admin_household() asks, never
-- get_user_household_ids(), which also answers yes for every staff phone
-- (anonymous sessions hold the `authenticated` role).
--   kakak_status, set_kakak_enabled, kakak_begin, kakak_record,
--   kakak_set_result                        admins of the household
--   platform_set_kakak_allowed              is_platform_admin() only
--
-- LIMITS (section 4). 40 calls a household a Jakarta day, and 400 a day across
-- all households. kakak_begin takes a transaction-scoped advisory lock so the
-- global total it reads cannot move under it; when the global cap is reached
-- it gives back the household's call before answering "busy".
--
-- The nightly prune_finished_food (123) also deletes old Kakak usage and
-- request rows; it keeps doing everything it did.
--
-- Additive: four new tables, six new functions, one function re-created.
-- Privacy policy (both languages) updated in the same PR.
-- ============================================================================

-- --- 1. Tables ------------------------------------------------------------------------
create table if not exists public.kakak_settings (
  household_id uuid primary key references public.households (id) on delete cascade,
  allowed boolean not null default false,
  enabled boolean not null default false,
  enabled_by uuid references auth.users (id) on delete set null,
  enabled_at timestamptz,
  daily_limit int not null default 40 check (daily_limit between 0 and 1000)
);

create table if not exists public.kakak_usage (
  household_id uuid not null references public.households (id) on delete cascade,
  day date not null,
  calls int not null default 0 check (calls >= 0),
  primary key (household_id, day)
);

create table if not exists public.kakak_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  model text check (length(model) <= 64 and model ~ '^[A-Za-z0-9._:-]+$'),
  outcome text not null default 'pending'
    check (outcome in ('pending', 'question', 'suggestion', 'message', 'error')),
  tools text[] check (
    cardinality(tools) <= 20
    and tools <@ array['create_chore', 'add_to_shopping_list', 'add_pet_routine', 'add_food', 'ask_question']::text[]
  ),
  input_tokens int check (input_tokens >= 0),
  cache_read_tokens int check (cache_read_tokens >= 0),
  cache_write_tokens int check (cache_write_tokens >= 0),
  output_tokens int check (output_tokens >= 0),
  cost_micro_usd bigint check (cost_micro_usd >= 0),
  latency_ms int check (latency_ms >= 0),
  result text check (result in ('confirmed', 'changed', 'cancelled', 'undone'))
);

create index if not exists kakak_usage_day_idx on public.kakak_usage (day);
create index if not exists kakak_settings_enabled_by_idx on public.kakak_settings (enabled_by);
create index if not exists kakak_requests_household_created_idx on public.kakak_requests (household_id, created_at);
create index if not exists kakak_requests_user_id_idx on public.kakak_requests (user_id);
create index if not exists kakak_requests_created_at_idx on public.kakak_requests (created_at);

create table if not exists public.kakak_config (
  id boolean primary key default true check (id),
  daily_call_cap int not null default 400 check (daily_call_cap >= 0),
  max_call_cost_micro_usd bigint not null default 150000 check (max_call_cost_micro_usd >= 0)
);
insert into public.kakak_config (id) values (true) on conflict (id) do nothing;

-- --- 2. Row level security ------------------------------------------------------------
alter table public.kakak_settings enable row level security;
alter table public.kakak_usage enable row level security;
alter table public.kakak_requests enable row level security;
alter table public.kakak_config enable row level security;

drop policy if exists "admin_select_kakak_settings" on public.kakak_settings;
create policy "admin_select_kakak_settings" on public.kakak_settings
  for select to authenticated using (exists (
    select 1 from public.household_members m
     where m.user_id = (select auth.uid()) and m.household_id = kakak_settings.household_id));

drop policy if exists "admin_select_kakak_requests" on public.kakak_requests;
create policy "admin_select_kakak_requests" on public.kakak_requests
  for select to authenticated using (exists (
    select 1 from public.household_members m
     where m.user_id = (select auth.uid()) and m.household_id = kakak_requests.household_id));

-- Reads through the policies above; every write goes through the functions.
revoke all on table public.kakak_settings, public.kakak_usage, public.kakak_requests, public.kakak_config
  from public, anon, authenticated;
grant select on table public.kakak_settings, public.kakak_requests to authenticated;
grant select, insert, update, delete on table
  public.kakak_settings, public.kakak_usage, public.kakak_requests, public.kakak_config to service_role;

-- --- 3. kakak_status ------------------------------------------------------------------
-- One row, also when the household has no settings row yet (all off).
create or replace function public.kakak_status(p_household uuid)
returns table (allowed boolean, enabled boolean, enabled_by uuid, enabled_at timestamptz,
               daily_limit int, calls_left int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if not exists (select 1 from public.household_members m
                  where m.user_id = auth.uid() and m.household_id = p_household) then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  return query
  select coalesce(s.allowed, false),
         coalesce(s.enabled, false),
         s.enabled_by,
         s.enabled_at,
         coalesce(s.daily_limit, 40),
         case when coalesce(s.allowed, false)
              then greatest(s.daily_limit - coalesce(u.calls, 0), 0)
              else 0 end
    from (select 1) one
    left join public.kakak_settings s on s.household_id = p_household
    left join public.kakak_usage u on u.household_id = p_household and u.day = v_today;
end;
$$;

-- --- 4. set_kakak_enabled -------------------------------------------------------------
-- An owner turns Kakak on or off; on only once the platform admin allowed it.
-- enabled_by / enabled_at record the latest change, either way.
create or replace function public.set_kakak_enabled(p_household uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_allowed boolean;
begin
  if not exists (select 1 from public.household_members m
                  where m.user_id = auth.uid() and m.household_id = p_household) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_on is null then
    raise exception 'bad_value' using errcode = '22023';
  end if;

  select s.allowed into v_allowed
    from public.kakak_settings s where s.household_id = p_household for update;

  if p_on and not coalesce(v_allowed, false) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  update public.kakak_settings
     set enabled = p_on, enabled_by = auth.uid(), enabled_at = now()
   where household_id = p_household;
end;
$$;

-- --- 5. platform_set_kakak_allowed ----------------------------------------------------
-- Taking permission away also turns Kakak off, so allowing it again later
-- never switches it back on without an owner.
create or replace function public.platform_set_kakak_allowed(p_household uuid, p_allowed boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not_platform_admin' using errcode = '42501';
  end if;
  if p_allowed is null then
    raise exception 'bad_value' using errcode = '22023';
  end if;

  insert into public.kakak_settings (household_id, allowed)
  values (p_household, p_allowed)
  on conflict (household_id) do update
    set allowed = excluded.allowed,
        enabled = kakak_settings.enabled and excluded.allowed;
end;
$$;

-- --- 6. kakak_begin -------------------------------------------------------------------
-- Before each call to Anthropic: checks, counts and opens the request row.
--   {"ok":true,"request_id":"…","calls_left":N}
--   {"ok":false,"reason":"not_admin"|"not_allowed"|"off"|"limit"|"busy"}
create or replace function public.kakak_begin(p_household uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_settings public.kakak_settings%rowtype;
  v_cap int;
  v_calls int;
  v_total bigint;
  v_request uuid;
begin
  if v_uid is null or not exists (select 1 from public.household_members m
                                   where m.user_id = v_uid and m.household_id = p_household) then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  select * into v_settings from public.kakak_settings s where s.household_id = p_household;
  if not found or not v_settings.allowed then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;
  if not v_settings.enabled then
    return jsonb_build_object('ok', false, 'reason', 'off');
  end if;
  if v_settings.daily_limit <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'limit');
  end if;

  -- One kakak_begin at a time across all households, so the day's total
  -- read below is exact. Released at the end of the transaction.
  perform pg_advisory_xact_lock(hashtext('public.kakak_begin'));

  insert into public.kakak_usage as u (household_id, day, calls)
  values (p_household, v_today, 1)
  on conflict (household_id, day) do update
    set calls = u.calls + 1
    where u.calls < v_settings.daily_limit
  returning u.calls into v_calls;

  if v_calls is null then
    return jsonb_build_object('ok', false, 'reason', 'limit');
  end if;

  select c.daily_call_cap into v_cap from public.kakak_config c where c.id;
  select coalesce(sum(u.calls), 0) into v_total from public.kakak_usage u where u.day = v_today;

  if v_total > coalesce(v_cap, 0) then
    -- Give the household its call back: the refusal is not theirs.
    update public.kakak_usage set calls = calls - 1
     where household_id = p_household and day = v_today;
    return jsonb_build_object('ok', false, 'reason', 'busy');
  end if;

  insert into public.kakak_requests (household_id, user_id)
  values (p_household, v_uid)
  returning id into v_request;

  return jsonb_build_object('ok', true, 'request_id', v_request,
                            'calls_left', v_settings.daily_limit - v_calls);
end;
$$;

-- --- 7. kakak_record ------------------------------------------------------------------
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
      or not p_tools <@ array['create_chore', 'add_to_shopping_list', 'add_pet_routine', 'add_food', 'ask_question']::text[]) then
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

-- --- 8. kakak_set_result --------------------------------------------------------------
-- What the owner did with the suggestion. Set once; the one change allowed
-- afterwards is Undo after confirming ('confirmed' → 'undone').
create or replace function public.kakak_set_result(p_request uuid, p_result text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.kakak_requests%rowtype;
begin
  if p_result is null or p_result not in ('confirmed', 'changed', 'cancelled', 'undone') then
    raise exception 'bad_result' using errcode = '22023';
  end if;

  select * into v_row from public.kakak_requests r where r.id = p_request for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.household_members m
                  where m.user_id = auth.uid() and m.household_id = v_row.household_id) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if not (v_row.result is null or (v_row.result = 'confirmed' and p_result = 'undone')) then
    raise exception 'already_set' using errcode = '55000';
  end if;

  update public.kakak_requests set result = p_result where id = p_request;
end;
$$;

-- --- 9. Grants ------------------------------------------------------------------------
revoke all on function public.kakak_status(uuid) from public, anon;
revoke all on function public.set_kakak_enabled(uuid, boolean) from public, anon;
revoke all on function public.platform_set_kakak_allowed(uuid, boolean) from public, anon;
revoke all on function public.kakak_begin(uuid) from public, anon;
revoke all on function public.kakak_record(uuid, text, text, text[], int, int, int, int, bigint, int) from public, anon;
revoke all on function public.kakak_set_result(uuid, text) from public, anon;

grant execute on function public.kakak_status(uuid) to authenticated;
grant execute on function public.set_kakak_enabled(uuid, boolean) to authenticated;
grant execute on function public.platform_set_kakak_allowed(uuid, boolean) to authenticated;
grant execute on function public.kakak_begin(uuid) to authenticated;
grant execute on function public.kakak_record(uuid, text, text, text[], int, int, int, int, bigint, int) to authenticated;
grant execute on function public.kakak_set_result(uuid, text) to authenticated;

-- --- 10. Nightly clean-up -------------------------------------------------------------
-- 123's prune_finished_food, unchanged for food, plus Kakak's retention:
-- usage over 35 days, request rows over 13 months. Still returns the number
-- of food rows removed; the cron job (20:15 UTC) is unchanged.
create or replace function public.prune_finished_food()
returns int
language plpgsql
set search_path = ''
as $$
declare
  removed int;
begin
  delete from public.food_items
   where finished_at is not null
     and finished_at < now() - interval '90 days';
  get diagnostics removed = row_count;

  delete from public.kakak_usage
   where day < (now() at time zone 'Asia/Jakarta')::date - 35;
  delete from public.kakak_requests
   where created_at < now() - interval '13 months';

  return removed;
end;
$$;

revoke all on function public.prune_finished_food() from public, anon, authenticated;
grant execute on function public.prune_finished_food() to service_role;
