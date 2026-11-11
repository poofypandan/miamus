-- ============================================================================
-- 151 — Kitchen recipes (Phase 170 PR B)
-- ============================================================================
-- docs/phase-170-kitchen-plan.md, D8 (owners write, every staff phone reads)
-- and the household's answer 4 (2026-11-11): recipes are written in English
-- or Indonesian, cooks read Indonesian only, so a recipe keeps its original
-- text plus an optional Indonesian version for staff phones. Numbered 151:
-- the next free number above 150 (manager, 2026-11-11). Builds on 148's
-- unique (id, household_id) on inventory_items.
--
-- NEW
--   recipes             name (1–80), servings (1–50, default 4), steps (up
--        to 4,000), written_in ('en' or 'id', the original's language), and
--        the Indonesian version for staff: name_id, steps_id. Server-stamped
--        created_by, created_at, updated_at. unique (id, household_id) for
--        PR C's menu.
--   recipe_ingredients  one line each, in order: an item from the
--        household's list (composite key, so never another household's) or
--        a free name; an amount (null = to taste, "secukupnya"); a unit (the
--        stock units plus sdm and sdt, which 148 refuses on stock); the
--        line's Indonesian name for staff (name_id). The line keeps its name
--        even when linked, so a deleted item still reads (on delete set null
--        of item_id only).
--   save_recipe(recipe, ingredients)  the recipe and all its lines in one
--        transaction, so a phone never leaves half a recipe. SECURITY
--        INVOKER: RLS applies; it also checks is_household_admin() itself.
--
-- RE-CREATED (from its newest definition, 149)
--   export_household_data  adds 'recipes', each with its ingredient lines.
--
-- WHO MAY DO WHAT. Every session of the household reads (staff phones cook
-- from recipes: get_user_household_ids()). Insert, update and delete are
-- owners only, through is_household_admin(household_id), a
-- household_members check, never get_user_household_ids() alone (AGENTS.md:
-- staff phones hold the authenticated role too). anon gets nothing.
--
-- NOT HERE: photos (no photo column, so the photo clean-up functions are
-- untouched), the menu, cooking from stock, Kakak's translation. No prices:
-- nothing here holds money (staff never see prices).
--
-- Additive only: two new tables, one new function, one re-created function.
-- Privacy policy updated in the same PR (recipes are a new kind of data).
-- ============================================================================

-- --- 1. recipes ----------------------------------------------------------------------
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  servings smallint not null default 4,
  steps text,
  written_in text not null default 'id',
  name_id text,
  steps_id text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipes_id_household_key unique (id, household_id),
  constraint recipes_name_length check (char_length(btrim(name)) between 1 and 80),
  constraint recipes_servings_check check (servings between 1 and 50),
  constraint recipes_steps_length check (steps is null or char_length(steps) <= 4000),
  constraint recipes_written_in_check check (written_in in ('en', 'id')),
  constraint recipes_name_id_length check (name_id is null or char_length(btrim(name_id)) between 1 and 80),
  constraint recipes_steps_id_length check (steps_id is null or char_length(steps_id) <= 4000)
);

create index if not exists recipes_household_idx on public.recipes (household_id, name);

-- --- 2. recipe_ingredients -----------------------------------------------------------
create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id uuid not null,
  item_id uuid,
  name text not null,
  name_id text,
  amount numeric,
  unit text,
  position smallint not null default 0,
  constraint recipe_ingredients_recipe_fkey foreign key (recipe_id, household_id)
    references public.recipes (id, household_id) on delete cascade,
  -- Only item_id goes null: household_id stays (it is the line's household).
  constraint recipe_ingredients_item_fkey foreign key (item_id, household_id)
    references public.inventory_items (id, household_id) on delete set null (item_id),
  constraint recipe_ingredients_name_length check (char_length(btrim(name)) between 1 and 80),
  constraint recipe_ingredients_name_id_length check (name_id is null or char_length(btrim(name_id)) between 1 and 80),
  constraint recipe_ingredients_amount_check check (amount is null or (amount > 0 and amount <= 100000)),
  -- 148's stock units plus sdm and sdt (recipe only: never taken off stock).
  constraint recipe_ingredients_unit_check check (unit is null or unit in (
    'pcs', 'pack', 'box', 'bottle', 'roll', 'tube', 'kg', 'g', 'L', 'ml',
    'buah', 'butir', 'ikat', 'siung', 'lembar', 'batang', 'bungkus', 'sachet',
    'sdm', 'sdt'
  )),
  -- To taste has no amount and so no unit.
  constraint recipe_ingredients_unit_needs_amount check (unit is null or amount is not null),
  constraint recipe_ingredients_position_check check (position between 0 and 199)
);

create index if not exists recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id, household_id, position);
create index if not exists recipe_ingredients_item_idx on public.recipe_ingredients (item_id, household_id);
create index if not exists recipe_ingredients_household_idx on public.recipe_ingredients (household_id);

-- --- 3. What the server decides ------------------------------------------------------
create or replace function public.recipes_server_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    new.household_id := old.household_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  new.name := btrim(new.name);
  new.name_id := nullif(btrim(new.name_id), '');
  new.steps := nullif(btrim(new.steps), '');
  new.steps_id := nullif(btrim(new.steps_id), '');
  return new;
end;
$$;

drop trigger if exists recipes_server_fields on public.recipes;
create trigger recipes_server_fields
  before insert or update on public.recipes
  for each row execute function public.recipes_server_fields();

create or replace function public.recipe_ingredients_server_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.household_id := old.household_id;
    new.recipe_id := old.recipe_id;
  end if;
  new.name := btrim(new.name);
  new.name_id := nullif(btrim(new.name_id), '');
  return new;
end;
$$;

drop trigger if exists recipe_ingredients_server_fields on public.recipe_ingredients;
create trigger recipe_ingredients_server_fields
  before insert or update on public.recipe_ingredients
  for each row execute function public.recipe_ingredients_server_fields();

revoke all on function public.recipes_server_fields() from public, anon, authenticated;
revoke all on function public.recipe_ingredients_server_fields() from public, anon, authenticated;

-- --- 4. Row level security -----------------------------------------------------------
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;

-- Every session of the household reads: staff phones cook from recipes.
drop policy if exists "tenant_select_recipes" on public.recipes;
create policy "tenant_select_recipes" on public.recipes
  for select to authenticated using (household_id = any (public.get_user_household_ids()));

-- Owners only write: a household_members check, never a device session.
drop policy if exists "admin_insert_recipes" on public.recipes;
create policy "admin_insert_recipes" on public.recipes
  for insert to authenticated with check (public.is_household_admin(household_id));

drop policy if exists "admin_update_recipes" on public.recipes;
create policy "admin_update_recipes" on public.recipes
  for update to authenticated
  using (public.is_household_admin(household_id))
  with check (public.is_household_admin(household_id));

drop policy if exists "admin_delete_recipes" on public.recipes;
create policy "admin_delete_recipes" on public.recipes
  for delete to authenticated using (public.is_household_admin(household_id));

drop policy if exists "tenant_select_recipe_ingredients" on public.recipe_ingredients;
create policy "tenant_select_recipe_ingredients" on public.recipe_ingredients
  for select to authenticated using (household_id = any (public.get_user_household_ids()));

drop policy if exists "admin_insert_recipe_ingredients" on public.recipe_ingredients;
create policy "admin_insert_recipe_ingredients" on public.recipe_ingredients
  for insert to authenticated with check (public.is_household_admin(household_id));

drop policy if exists "admin_update_recipe_ingredients" on public.recipe_ingredients;
create policy "admin_update_recipe_ingredients" on public.recipe_ingredients
  for update to authenticated
  using (public.is_household_admin(household_id))
  with check (public.is_household_admin(household_id));

drop policy if exists "admin_delete_recipe_ingredients" on public.recipe_ingredients;
create policy "admin_delete_recipe_ingredients" on public.recipe_ingredients
  for delete to authenticated using (public.is_household_admin(household_id));

-- PostgREST reaches the tables through these grants; RLS decides the rows.
revoke all on table public.recipes from public, anon;
revoke all on table public.recipe_ingredients from public, anon;
grant select, insert, update, delete on table public.recipes to authenticated, service_role;
grant select, insert, update, delete on table public.recipe_ingredients to authenticated, service_role;

-- --- 5. Saving a recipe and its lines together ---------------------------------------
-- p_recipe: { id?, household_id, name, servings, steps, written_in,
--             name_id, steps_id }
-- p_ingredients: [{ item_id?, name, name_id?, amount?, unit? }, ...] in
--             order; replaces every line the recipe had.
-- Returns { recipe, ingredients }. SECURITY INVOKER: the caller's RLS
-- applies (owners only), and the owner check is repeated here so a staff
-- phone gets a clear refusal rather than a silent nothing.
create or replace function public.save_recipe(p_recipe jsonb, p_ingredients jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := coalesce(nullif(p_recipe ->> 'id', '')::uuid, gen_random_uuid());
  v_household uuid := nullif(p_recipe ->> 'household_id', '')::uuid;
  v_lines jsonb := coalesce(p_ingredients, '[]'::jsonb);
  r public.recipes;
begin
  if v_household is null or not public.is_household_admin(v_household) then
    raise exception 'recipes_owner_only' using errcode = '42501';
  end if;
  if jsonb_typeof(v_lines) <> 'array' or jsonb_array_length(v_lines) > 200 then
    raise exception 'bad_ingredients' using errcode = '22023';
  end if;

  if exists (select 1 from public.recipes where id = v_id) then
    update public.recipes
       set name = p_recipe ->> 'name',
           servings = coalesce((p_recipe ->> 'servings')::smallint, 4),
           steps = p_recipe ->> 'steps',
           written_in = coalesce(p_recipe ->> 'written_in', 'id'),
           name_id = p_recipe ->> 'name_id',
           steps_id = p_recipe ->> 'steps_id'
     where id = v_id and household_id = v_household
    returning * into r;
    if not found then
      raise exception 'not_found' using errcode = '42501';
    end if;
  else
    insert into public.recipes (id, household_id, name, servings, steps, written_in, name_id, steps_id)
    values (v_id, v_household, p_recipe ->> 'name', coalesce((p_recipe ->> 'servings')::smallint, 4),
            p_recipe ->> 'steps', coalesce(p_recipe ->> 'written_in', 'id'),
            p_recipe ->> 'name_id', p_recipe ->> 'steps_id')
    returning * into r;
  end if;

  delete from public.recipe_ingredients where recipe_id = v_id;
  insert into public.recipe_ingredients (household_id, recipe_id, item_id, name, name_id, amount, unit, position)
  select v_household, v_id,
         nullif(e ->> 'item_id', '')::uuid,
         e ->> 'name',
         e ->> 'name_id',
         nullif(e ->> 'amount', '')::numeric,
         nullif(e ->> 'unit', ''),
         (ord - 1)::smallint
    from jsonb_array_elements(v_lines) with ordinality as x(e, ord);

  return jsonb_build_object(
    'recipe', to_jsonb(r),
    'ingredients', coalesce((
      select jsonb_agg(to_jsonb(ri) order by ri.position)
        from public.recipe_ingredients ri where ri.recipe_id = v_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.save_recipe(jsonb, jsonb) from public, anon;
grant execute on function public.save_recipe(jsonb, jsonb) to authenticated, service_role;

-- --- 6. The export (149's body, plus recipes) ----------------------------------------
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
                                'staff_push', h.staff_push)
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
    'my_notifications', (
      select jsonb_build_object('evening_summary_hour', pr.evening_summary_hour,
                                'staff_requests', pr.staff_request_pushes)
      from public.notification_prefs_of(uid) pr
    )
  );
end;
$$;
revoke all on function public.export_household_data() from public, anon;
grant execute on function public.export_household_data() to authenticated;
