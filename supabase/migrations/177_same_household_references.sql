-- ============================================================================
-- 177 — A household's rows name only its own people, pets, tasks and photos
-- ============================================================================
-- Security audit, 20 Nov 2026 (docs/private/security-audit-2026-11-20.md,
-- finding S2). Row-level security already keeps every household's rows to
-- itself: supabase/tests/177_household_isolation.sql tries ~700 reads and
-- writes across two households and all are refused. This is the second wall.
--
-- The newer tables (Phase 159 onwards) use composite foreign keys or guard
-- triggers, so a row can only point at a person, pet or photo of its own
-- household. The oldest tables check the person is not archived, not that
-- they belong to the same house. So a phone of household A could write a log
-- "by" household B's staff member, on B's routine, with a photo path in B's
-- folder. Nobody can learn B's ids through Miamus today (every read of them
-- is refused), so this is not reachable now; but if an id ever leaked:
--   - A's export and A's pushes would carry B's staff member's name
--     (export_household_data and notify_sick_report join staff_profiles by
--     id alone);
--   - a reference from A would keep B's photo alive after B deleted its
--     household or the photo's 30 days ran out (the nightly clean-up keeps
--     anything still referenced).
-- No photo can be opened this way: storage policies decide who reads a photo,
-- by the folder, whatever a row says.
--
-- ADDED
--   same_household_staff(staff, household)   true for null or a person of
--        that household. Internal (triggers only).
--   same_household_photo(url, household)     true for null, for a value that
--        is not a storage URL, or for a stored photo under that household's
--        folder (any of the three buckets).
--   same_household_refs()                    one BEFORE INSERT OR UPDATE
--        trigger function for the tables below. It checks a column only when
--        it is new or changed, so rows saved before this migration (including
--        the founding household's early photos without a folder, audit L2)
--        stay editable. Writes with no signed-in user (the service role,
--        cron, migrations) are trusted and not checked.
--   Triggers *_same_household on: task_logs, routine_proposals,
--        inventory_alerts, inventory_items, inventory_audit_logs,
--        household_tasks, repairs, repair_notes, medical_records, food_items,
--        bill_payments, repair_costs, task_entities.
--
-- What is checked, per table (the household is the row's own, or for the
-- four tables without household_id, its pet's or item's):
--   task_logs             staff_id, schedule_id, photo_url
--   routine_proposals     staff_id
--   inventory_alerts      staff_id, pet_id
--   inventory_items       stock_status_by, photo_url (amount_set_by: 148)
--   inventory_audit_logs  audited_by, photo_url
--   household_tasks       assigned_to, completed_by, parent_task_id,
--                         photo_url, before_photo_url, after_photo_url
--   repairs               photo_url (reported_by_staff: repairs_guard, 130)
--   repair_notes          photo_url (staff_id: repair_notes_guard, 131)
--   medical_records       document_photo_url
--   food_items            photo_url (added_by, finished_by: 123)
--   bill_payments         receipt_url
--   repair_costs          receipt_url
--   task_entities         every storage photo named in metadata that the
--                         row did not already name
-- Already checked elsewhere, unchanged: master_schedules (144),
-- task_exceptions (139), repair_visits and repair_supervision (149),
-- feedback (135), leave_requests (policy), menu_dishes (153), recipes and
-- recipe_ingredients (composite keys, 151).
--
-- Refusal: errcode 42501, message 'other_household_reference', the column in
-- the detail. The app never sends such a row, so no screen changes and no
-- string is needed. Additive: no table, column, policy or grant changes; no
-- existing row is rewritten. Nothing new is stored or shared, so the privacy
-- policy is unchanged by this migration.
--
-- Test: supabase/tests/177_household_isolation.sql (local only).

-- --- 1. Helpers ----------------------------------------------------------------------
create or replace function public.same_household_staff(p_staff uuid, p_household uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_staff is null or exists (
    select 1 from public.staff_profiles s
     where s.id = p_staff and s.household_id = p_household
  );
$$;

create or replace function public.same_household_photo(p_url text, p_household uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_url is null
      -- Not a stored photo at all: nothing of another household's to name
      -- (the app only ever saves storage URLs; older tests save 'b.jpg').
      or public.photo_object_ref(p_url) is null
      or coalesce(
           (public.photo_object_ref(p_url))[1] in ('household-logs', 'inventory_audits', 'owner-receipts')
           and public.storage_object_household((public.photo_object_ref(p_url))[2]) = p_household,
           false
         );
$$;

revoke all on function public.same_household_staff(uuid, uuid) from public, anon, authenticated;
grant execute on function public.same_household_staff(uuid, uuid) to service_role;
revoke all on function public.same_household_photo(text, uuid) from public, anon, authenticated;
grant execute on function public.same_household_photo(text, uuid) to service_role;

-- --- 2. The trigger --------------------------------------------------------------------
create or replace function public.same_household_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  hh uuid;
  bad text;
  new_j jsonb := to_jsonb(new);
  old_j jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  col text;
  url text;
begin
  -- No session (the service role, cron jobs, migrations): maintenance,
  -- trusted, as the other guards (repair_visits_guard, 149).
  if auth.uid() is null then
    return new;
  end if;

  -- The household the row belongs to.
  hh := case tg_table_name
    when 'task_logs' then (select e.household_id from public.task_entities e where e.id = (new_j ->> 'entity_id')::uuid)
    when 'medical_records' then (select e.household_id from public.task_entities e where e.id = (new_j ->> 'entity_id')::uuid)
    when 'routine_proposals' then (select e.household_id from public.task_entities e where e.id = (new_j ->> 'pet_id')::uuid)
    when 'inventory_audit_logs' then (select i.household_id from public.inventory_items i where i.id = (new_j ->> 'item_id')::uuid)
    else (new_j ->> 'household_id')::uuid
  end;
  -- No household found (a pet or item that doesn't exist): the foreign key
  -- refuses it with its own error.
  if hh is null then
    return new;
  end if;

  -- People.
  foreach col in array case tg_table_name
    when 'task_logs' then array['staff_id']
    when 'routine_proposals' then array['staff_id']
    when 'inventory_alerts' then array['staff_id']
    when 'inventory_items' then array['stock_status_by']
    when 'inventory_audit_logs' then array['audited_by']
    when 'household_tasks' then array['assigned_to', 'completed_by']
    else array[]::text[]
  end loop
    if (old_j is null or new_j -> col is distinct from old_j -> col)
       and not public.same_household_staff((new_j ->> col)::uuid, hh) then
      bad := col;
    end if;
  end loop;

  -- Pets, routines and chores.
  if tg_table_name = 'task_logs'
     and (old_j is null or new_j -> 'schedule_id' is distinct from old_j -> 'schedule_id')
     and new_j ->> 'schedule_id' is not null
     and not exists (select 1 from public.master_schedules ms
                       join public.task_entities e on e.id = ms.entity_id
                      where ms.id = (new_j ->> 'schedule_id')::uuid and e.household_id = hh) then
    bad := 'schedule_id';
  end if;
  if tg_table_name = 'inventory_alerts'
     and (old_j is null or new_j -> 'pet_id' is distinct from old_j -> 'pet_id')
     and new_j ->> 'pet_id' is not null
     and not exists (select 1 from public.task_entities e
                      where e.id = (new_j ->> 'pet_id')::uuid and e.household_id = hh) then
    bad := 'pet_id';
  end if;
  if tg_table_name = 'household_tasks'
     and (old_j is null or new_j -> 'parent_task_id' is distinct from old_j -> 'parent_task_id')
     and new_j ->> 'parent_task_id' is not null
     and not exists (select 1 from public.household_tasks t
                      where t.id = (new_j ->> 'parent_task_id')::uuid and t.household_id = hh) then
    bad := 'parent_task_id';
  end if;

  -- Photos.
  foreach col in array case tg_table_name
    when 'task_logs' then array['photo_url']
    when 'inventory_items' then array['photo_url']
    when 'inventory_audit_logs' then array['photo_url']
    when 'household_tasks' then array['photo_url', 'before_photo_url', 'after_photo_url']
    when 'repairs' then array['photo_url']
    when 'repair_notes' then array['photo_url']
    when 'medical_records' then array['document_photo_url']
    when 'food_items' then array['photo_url']
    when 'bill_payments' then array['receipt_url']
    when 'repair_costs' then array['receipt_url']
    else array[]::text[]
  end loop
    if (old_j is null or new_j -> col is distinct from old_j -> col)
       and not public.same_household_photo(new_j ->> col, hh) then
      bad := col;
    end if;
  end loop;

  -- A pet's photos live in its details (avatar, the photo it was cut from,
  -- documents): every stored photo named there that the row didn't name yet.
  if tg_table_name = 'task_entities' then
    for url in
      select v #>> '{}'
        from jsonb_path_query(coalesce(new_j -> 'metadata', '{}'::jsonb), 'strict $.** ? (@.type() == "string")') v
       where public.photo_object_ref(v #>> '{}') is not null
      except
      select v #>> '{}'
        from jsonb_path_query(coalesce(old_j -> 'metadata', '{}'::jsonb), 'strict $.** ? (@.type() == "string")') v
    loop
      if not public.same_household_photo(url, hh) then
        bad := 'metadata';
      end if;
    end loop;
  end if;

  if bad is not null then
    raise exception 'other_household_reference' using errcode = '42501',
      detail = format('%s.%s names something outside this household', tg_table_name, bad);
  end if;
  return new;
end;
$$;

-- A trigger function: nothing calls it directly, and triggers fire without an
-- EXECUTE grant (as 128 did for household_tasks_owner_guard).
revoke all on function public.same_household_refs() from public, anon, authenticated;
grant execute on function public.same_household_refs() to service_role;

-- --- 3. The triggers -------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['task_logs', 'routine_proposals', 'inventory_alerts', 'inventory_items',
                           'inventory_audit_logs', 'household_tasks', 'repairs', 'repair_notes',
                           'medical_records', 'food_items', 'bill_payments', 'repair_costs',
                           'task_entities'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_same_household', t);
    execute format('create trigger %I before insert or update on public.%I
                      for each row execute function public.same_household_refs()',
                   t || '_same_household', t);
  end loop;
end $$;
