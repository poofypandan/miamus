-- ============================================================================
-- 176 — The household's food preferences, and Kakak's recipe ideas (PR C2)
-- ============================================================================
-- Can we cook it?, PR C2 (owner, 20 Nov; plan v3, section 2 and D2/D4).
-- Kakak may suggest recipe ideas from her own knowledge. Before the first
-- ideas she asks once for the household's food rules, with the app's own
-- question card; the owner's tap saves the answer (the tap is the consent),
-- and it is never asked again. Owners change it by hand on Kitchen notes;
-- staff see it read-only there, because the cook needs it too.
--
-- One optional household setting, never per person. A closed set of
-- choices, any number of them: halal, no_alcohol, no_beef, vegetarian. No
-- free text, so nothing is typed here and no allergy can end up in it
-- (allergies stay in Kitchen notes, which are never sent to Kakak).
-- Religion is not specific personal data under UU PDP Art. 4(2), but a
-- preference such as halal hints at it, so the privacy policy says so.
--
-- ADDED
--   households.food_preferences text[] null  null: not asked yet; '{}': no
--        rules. A check keeps every value one of the four, at most four, no
--        nulls. set_food_preferences stores them once each, in a fixed order.
--   households.food_preferences_set_at timestamptz null,
--   households.food_preferences_set_by uuid null references auth.users
--        on delete set null  who answered and when (nullable: nothing breaks).
--   set_food_preferences(p_household uuid, p_rules text[]) returns jsonb
--        {before, after}: SECURITY DEFINER, search_path ''. Admins of that
--        household only (is_household_admin: a household_members row, so a
--        staff phone, which signs in anonymously as authenticated, is
--        refused). p_rules null puts "not asked yet" back, for Undo of a
--        first answer. EXECUTE revoked from public and anon, granted to
--        authenticated.
--
-- REPLACED
--   kakak_requests_tools_check  the same rule (at most 20 names, all known)
--        with save_recipe_idea and ask_food_preferences added. It keeps
--        every name 181 accepts (plan_dish from 174; add_staff and
--        remove_staff from 181, applied to staging and production before
--        this one), so whichever of 176 and 181 runs last, every tool is
--        accepted. Dropped and added again; existing rows hold only known
--        names, so they pass.
--
-- RE-CREATED
--   kakak_record (from its newest definition, 181)  unchanged except the
--        p_tools list. Still SECURITY DEFINER with search_path = public,
--        pg_temp; its guard is a household_members row; EXECUTE revoked from
--        public and anon, granted to authenticated.
--   export_household_data (from its newest definition, 153)  unchanged
--        except the household's food preferences, with who set them and
--        when, beside the kitchen notes.
--
-- NOT CHANGED
--   households' RLS (clients read their household as before, so staff
--   phones can read the preference, as they read the kitchen notes; nobody
--   writes it except through set_food_preferences), recipes (an idea is
--   saved through the owner's own save_recipe, 151), kakak_begin,
--   kakak_set_result, retention (kept as long as the household).
--
-- PRIVACY. New: the food preference with who set it and when. Sent to
-- Anthropic with each Kakak request: the preference, and whether kitchen
-- notes exist (never their text). Privacy policy (EN and ID) and legal.ts
-- updated in the same PR. Supabase only, same region, no new service.
--
-- Test: supabase/tests/176_food_preferences.sql (local only).

-- --- 1. The preference ----------------------------------------------------------------
alter table public.households
  add column if not exists food_preferences text[],
  add column if not exists food_preferences_set_at timestamptz,
  add column if not exists food_preferences_set_by uuid references auth.users (id) on delete set null;

alter table public.households drop constraint if exists households_food_preferences_check;
alter table public.households add constraint households_food_preferences_check check (
  food_preferences is null
  or (cardinality(food_preferences) <= 4
      and array_position(food_preferences, null) is null
      and food_preferences <@ array['halal', 'no_alcohol', 'no_beef', 'vegetarian']::text[])
);

create index if not exists households_food_preferences_set_by_idx on public.households (food_preferences_set_by);

-- --- 2. set_food_preferences ------------------------------------------------------------
-- Saves the household's food preferences and returns what they were, so
-- Undo can put them back. p_rules '{}' is "no rules"; null is "not asked
-- yet" (only Undo of a first answer sends it).
create or replace function public.set_food_preferences(p_household uuid, p_rules text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before text[];
  v_after text[];
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_household is null or not public.is_household_admin(p_household) then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  if p_rules is not null and (
       cardinality(p_rules) > 8
       or array_position(p_rules, null) is not null
       or not p_rules <@ array['halal', 'no_alcohol', 'no_beef', 'vegetarian']::text[]) then
    raise exception 'bad_value' using errcode = '22023';
  end if;

  select h.food_preferences into v_before
    from public.households h where h.id = p_household for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  -- Each once, in the app's order (lib/food-preferences.ts FOOD_RULES).
  if p_rules is not null then
    select coalesce(array_agg(r order by array_position(array['halal', 'no_alcohol', 'no_beef', 'vegetarian']::text[], r)), '{}')
      into v_after
      from (select distinct unnest(p_rules) as r) s;
  end if;

  update public.households
     set food_preferences = v_after,
         food_preferences_set_at = case when v_after is null then null else now() end,
         food_preferences_set_by = case when v_after is null then null else auth.uid() end
   where id = p_household;

  return jsonb_build_object('before', to_jsonb(v_before), 'after', to_jsonb(v_after));
end;
$$;

revoke all on function public.set_food_preferences(uuid, text[]) from public, anon;
grant execute on function public.set_food_preferences(uuid, text[]) to authenticated;

-- --- 3. The tools column ------------------------------------------------------------
alter table public.kakak_requests drop constraint if exists kakak_requests_tools_check;
alter table public.kakak_requests add constraint kakak_requests_tools_check check (
  cardinality(tools) <= 20
  and tools <@ array['create_chore', 'add_to_shopping_list', 'add_pet_routine', 'add_food', 'put_away_ingredient', 'set_staff_areas', 'plan_dish', 'add_staff', 'remove_staff', 'save_recipe_idea', 'ask_food_preferences', 'ask_question']::text[]
);

-- --- 4. kakak_record ----------------------------------------------------------------
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
      or not p_tools <@ array['create_chore', 'add_to_shopping_list', 'add_pet_routine', 'add_food', 'put_away_ingredient', 'set_staff_areas', 'plan_dish', 'add_staff', 'remove_staff', 'save_recipe_idea', 'ask_food_preferences', 'ask_question']::text[]) then
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

revoke all on function public.kakak_record(uuid, text, text, text[], int, int, int, int, bigint, int) from public, anon;
grant execute on function public.kakak_record(uuid, text, text, text[], int, int, int, int, bigint, int) to authenticated;

-- --- 5. The export (153's body, plus the food preferences) -------------------------------
create or replace function public.export_household_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  uid uuid := auth.uid();
  hh uuid := public.caller_admin_household();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if hh is null then
    raise exception 'admins_only' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'format', 'miamus-household-export/1',
    'exported_at', now(),
    'household', (
      select jsonb_build_object('id', h.id, 'name', h.name, 'created_at', h.created_at,
                                -- Notifications to staff phones on or off (migrations/141).
                                'staff_push', h.staff_push,
                                -- The kitchen note for whoever cooks, and the owner's
                                -- health-data OK (migrations/153).
                                'kitchen_notes', h.kitchen_notes,
                                'kitchen_notes_confirmed_at', h.kitchen_notes_confirmed_at,
                                'kitchen_notes_confirmed_by', (select u.email from auth.users u where u.id = h.kitchen_notes_confirmed_by),
                                -- The food preferences, with who set them and when (migrations/176).
                                'food_preferences', h.food_preferences,
                                'food_preferences_set_at', h.food_preferences_set_at,
                                'food_preferences_set_by', (select u.email from auth.users u where u.id = h.food_preferences_set_by))
      from public.households h where h.id = hh
    ),
    'admins', coalesce((
      select jsonb_agg(jsonb_build_object(
        'email', u.email, 'role', m.role, 'joined_at', m.created_at,
        'founder', h.owner_auth_id is not distinct from m.user_id
      ) order by m.created_at)
      from public.household_members m
      join auth.users u on u.id = m.user_id
      join public.households h on h.id = m.household_id
      where m.household_id = hh
    ), '[]'::jsonb),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'created_at', s.created_at,
        'archived_at', s.archived_at, 'has_pin', s.has_pin,
        -- Admins get a profile too, so chores can be assigned to them (106).
        'is_admin', s.user_id is not null
      ) order by s.created_at)
      from public.staff_profiles s where s.household_id = hh
    ), '[]'::jsonb),
    'pets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'type', e.entity_type, 'name', e.name, 'icon', e.icon,
        'status', e.status, 'details', e.metadata, 'created_at', e.created_at
      ) order by e.created_at)
      from public.task_entities e where e.household_id = hh
    ), '[]'::jsonb),
    'routines', coalesce((
      select jsonb_agg(to_jsonb(ms) order by ms.created_at)
      from public.master_schedules ms
      join public.task_entities e on e.id = ms.entity_id
      where e.household_id = hh
    ), '[]'::jsonb),
    'logs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'pet_id', l.entity_id, 'routine_id', l.schedule_id,
        'module', l.module, 'kind', l.sub_type, 'notes', l.notes,
        'completed_at', l.completed_at, 'received_at', l.received_at, 'staff', s.name,
        'photo', (public.photo_object_ref(l.photo_url))[1] || '/' || (public.photo_object_ref(l.photo_url))[2]
      ) order by l.completed_at)
      from public.task_logs l
      join public.task_entities e on e.id = l.entity_id
      left join public.staff_profiles s on s.id = l.staff_id
      where e.household_id = hh
    ), '[]'::jsonb),
    -- Tasks someone said couldn't be done (migrations/139); the walk-in a
    -- "supervising a repair" record names (migrations/149).
    'couldnt_do', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'chore_id', x.chore_id, 'routine_id', x.schedule_id, 'pet_id', x.entity_id,
        'task', coalesce(t.title, ms.title), 'day', x.occurs_on, 'slot', x.slot_time,
        'reason', x.reason, 'note', x.note, 'shopping_item_id', x.inventory_item_id,
        'repair_visit_id', x.repair_visit_id,
        'staff', s.name, 'at', x.created_at,
        'photo', (public.photo_object_ref(x.photo_url))[1] || '/' || (public.photo_object_ref(x.photo_url))[2]
      ) order by x.created_at)
      from public.task_exceptions x
      left join public.household_tasks t on t.id = x.chore_id
      left join public.master_schedules ms on ms.id = x.schedule_id
      left join public.staff_profiles s on s.id = x.staff_id
      where x.household_id = hh
    ), '[]'::jsonb),
    'health_records', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at)
      from public.medical_records r
      join public.task_entities e on e.id = r.entity_id
      where e.household_id = hh
    ), '[]'::jsonb),
    'routine_suggestions', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.created_at)
      from public.routine_proposals p
      join public.task_entities e on e.id = p.pet_id
      where e.household_id = hh
    ), '[]'::jsonb),
    'chores', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.created_at)
      from public.household_tasks t where t.household_id = hh
    ), '[]'::jsonb),
    'rooms', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at)
      from public.household_locations r where r.household_id = hh
    ), '[]'::jsonb),
    'supplies', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.created_at)
      from public.inventory_items i where i.household_id = hh
    ), '[]'::jsonb),
    'stock_counts', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at)
      from public.inventory_audit_logs a
      join public.inventory_items i on i.id = a.item_id
      where i.household_id = hh
    ), '[]'::jsonb),
    'shopping_list', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at)
      from public.inventory_alerts a where a.household_id = hh
    ), '[]'::jsonb),
    'repairs', coalesce((
      select jsonb_agg(to_jsonb(rp) order by rp.created_at)
      from public.repairs rp where rp.household_id = hh
    ), '[]'::jsonb),
    -- Walk-ins (migrations/149): who came, when, the photos, who logged it.
    'repair_walk_ins', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'repair_id', v.repair_id, 'worker_name', v.worker_name,
        'logged_by', s.name, 'arrived_at', v.arrived_at, 'arrived_phone_at', v.arrived_phone_at,
        'left_at', v.left_at, 'left_phone_at', v.left_phone_at,
        'outcome', v.outcome, 'note', v.note,
        'before_photo', (public.photo_object_ref(v.before_photo_url))[1] || '/' || (public.photo_object_ref(v.before_photo_url))[2],
        'after_photo', (public.photo_object_ref(v.after_photo_url))[1] || '/' || (public.photo_object_ref(v.after_photo_url))[2]
      ) order by v.arrived_at)
      from public.repair_visits v
      left join public.staff_profiles s on s.id = v.logged_by_staff
      where v.household_id = hh
    ), '[]'::jsonb),
    -- Who supervised each walk-in, from when to when (kept 90 days).
    'repair_supervision', coalesce((
      select jsonb_agg(jsonb_build_object(
        'visit_id', rs.visit_id, 'staff', s.name, 'owner', rs.user_id is not null,
        'started_at', rs.started_at, 'ended_at', rs.ended_at
      ) order by rs.started_at)
      from public.repair_supervision rs
      left join public.staff_profiles s on s.id = rs.staff_id
      where rs.household_id = hh
    ), '[]'::jsonb),
    'repair_costs', coalesce((
      select jsonb_agg(to_jsonb(rc) order by rc.repair_id)
      from public.repair_costs rc where rc.household_id = hh
    ), '[]'::jsonb),
    'bill_payments', coalesce((
      select jsonb_agg(to_jsonb(bp) order by bp.paid_at)
      from public.bill_payments bp where bp.household_id = hh
    ), '[]'::jsonb),
    'repair_notes', coalesce((
      select jsonb_agg(to_jsonb(rn) order by rn.created_at)
      from public.repair_notes rn where rn.household_id = hh
    ), '[]'::jsonb),
    'food', coalesce((
      select jsonb_agg(to_jsonb(f) order by f.created_at)
      from public.food_items f where f.household_id = hh
    ), '[]'::jsonb),
    -- Recipes (migrations/151), each with its ingredient lines in order.
    'recipes', coalesce((
      select jsonb_agg(to_jsonb(rc) || jsonb_build_object('ingredients', coalesce((
        select jsonb_agg(to_jsonb(ri) - 'household_id' order by ri.position)
          from public.recipe_ingredients ri where ri.recipe_id = rc.id
      ), '[]'::jsonb)) order by rc.created_at)
      from public.recipes rc where rc.household_id = hh
    ), '[]'::jsonb),
    -- The menu (migrations/153): every dish, who cooked it, when, and what
    -- cooking took off stock (kept one year).
    'menu', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', md.id, 'day', md.day, 'meal', md.meal, 'title', md.title,
        'recipe_id', md.recipe_id, 'servings', md.servings, 'notes', md.notes,
        'position', md.position, 'cooked_at', md.cooked_at, 'cooked_by', s.name,
        'cooked_uses', md.cooked_uses, 'created_at', md.created_at
      ) order by md.day, md.meal, md.position)
      from public.menu_dishes md
      left join public.staff_profiles s on s.id = md.cooked_by
      where md.household_id = hh
    ), '[]'::jsonb),
    'leave', coalesce((
      select jsonb_agg(to_jsonb(lr) order by lr.created_at)
      from public.leave_requests lr where lr.household_id = hh
    ), '[]'::jsonb),
    'feedback', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', fb.id, 'category', fb.category, 'message', fb.message,
        'page', fb.page, 'app_version', fb.app_version, 'sent_at', fb.created_at,
        'staff', s.name, 'from_admin', fb.staff_id is null
      ) order by fb.created_at)
      from public.feedback fb
      left join public.staff_profiles s on s.id = fb.staff_id
      where fb.household_id = hh
    ), '[]'::jsonb),
    -- Numbered as Household → Linked staff phones lists them (last sign-in
    -- first), so "HP 1" here is "Phone 1" on screen (migrations/141).
    'linked_phones', coalesce((
      select jsonb_agg(jsonb_build_object('phone', 'HP ' || ph.n, 'linked_at', ph.created_at,
                                          'last_seen_at', ph.last_seen_at)
                       order by ph.n)
      from (
        select d.created_at, d.last_seen_at,
               row_number() over (order by d.last_seen_at desc, d.created_at) as n
          from public.device_sessions d where d.household_id = hh
      ) ph
    ), '[]'::jsonb),
    -- Who gets notifications on which linked phone (migrations/141): the
    -- phone as linked_phones above numbers it, never an endpoint.
    'staff_notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'phone', 'HP ' || ph.n, 'staff', s.name, 'since', p.created_at
      ) order by ph.n, p.created_at)
      from public.staff_push_people p
      join (
        select d.user_id, row_number() over (order by d.last_seen_at desc, d.created_at) as n
          from public.device_sessions d where d.household_id = hh
      ) ph on ph.user_id = p.device_user_id
      join public.staff_profiles s on s.id = p.staff_id
      where p.household_id = hh
    ), '[]'::jsonb),
    'staff_sign_in_attempts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'at', a.created_at, 'kind', a.kind, 'success', a.success, 'staff', s.name
      ) order by a.created_at)
      from public.staff_sign_in_attempts a
      left join public.staff_profiles s on s.id = a.staff_id
      where a.household_id = hh
    ), '[]'::jsonb),
    -- Setting up the household, as numbers only (migrations/142); null until
    -- the setup screens record it.
    'setup', (
      select to_jsonb(su) - 'household_id'
      from public.household_setup su where su.household_id = hh
    ),
    -- Each ended day's due and closed task counts (migrations/142).
    'task_day_counts', coalesce((
      select jsonb_agg(jsonb_build_object('day', nd.day, 'due', nd.due, 'closed', nd.closed) order by nd.day)
      from public.north_star_days nd where nd.household_id = hh
    ), '[]'::jsonb),
    'my_language', (select p.locale from public.user_preferences p where p.user_id = uid),
    -- Plus the repair push switches (migrations/152).
    'my_notifications', (
      select jsonb_build_object('evening_summary_hour', pr.evening_summary_hour,
                                'staff_requests', pr.staff_request_pushes,
                                'repair_arrivals', rp.repair_arrival_pushes,
                                'repair_finished', rp.repair_done_pushes)
      from public.notification_prefs_of(uid) pr
      cross join public.repair_push_prefs_of(uid) rp
    )
  );
end;
$$;
revoke all on function public.export_household_data() from public, anon;
grant execute on function public.export_household_data() to authenticated;
