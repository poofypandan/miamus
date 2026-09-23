-- ============================================================================
-- Phase 88 (part 2 of 2) — the lockdown
-- ============================================================================
-- Ends public access to household data. Every operational table moves from
-- "any holder of the anon key may do anything" (see rls-policies.sql, which
-- was honest about being blast-radius reduction rather than security) to
-- "only an identity bound to this household, and only for this household".
--
-- REQUIRES: anonymous sign-ins enabled on the project, and migration 089.
-- Applying this while devices are still anonymous-less takes the staff view
-- blank: no identity, no rows.
--
-- HOW A ROW IS SCOPED
--   Tables carrying household_id  -> compared directly.
--   Tables carrying a parent id   -> through the parent (a log belongs to the
--                                    pet it is about, an audit to its item).
-- Both read get_user_household_ids(), which is STABLE, so it is evaluated
-- once per statement and not per row.
--
-- The verb sets are unchanged from the anon era on purpose: this migration
-- narrows *who*, not *what*. Medical records stay append-only, a completion
-- still cannot be edited, an alert can still only be deleted inside its
-- five-minute undo window.
-- ============================================================================

-- Start from a known state: permissive policies OR together, so a leftover
-- `using (true)` would quietly undo everything below.
do $$
declare
  r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in (
        'task_entities', 'staff_profiles', 'inventory_items', 'household_tasks',
        'inventory_alerts', 'master_schedules', 'task_logs', 'medical_records',
        'routine_proposals', 'inventory_audit_logs'
      )
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- RLS on regardless of how each table got here.
alter table task_entities        enable row level security;
alter table staff_profiles       enable row level security;
alter table inventory_items      enable row level security;
alter table household_tasks      enable row level security;
alter table inventory_alerts     enable row level security;
alter table master_schedules     enable row level security;
alter table task_logs            enable row level security;
alter table medical_records      enable row level security;
alter table routine_proposals    enable row level security;
alter table inventory_audit_logs enable row level security;

-- --- tables that carry household_id -----------------------------------------

-- Pets. Full CRUD; deleting one cascades into its logs, schedules and records,
-- which is now at least restricted to people inside the household.
create policy "tenant_select_task_entities" on task_entities
  for select to authenticated using (household_id = any (get_user_household_ids()));
create policy "tenant_insert_task_entities" on task_entities
  for insert to authenticated with check (household_id = any (get_user_household_ids()));
create policy "tenant_update_task_entities" on task_entities
  for update to authenticated using (household_id = any (get_user_household_ids()))
  with check (household_id = any (get_user_household_ids()));
create policy "tenant_delete_task_entities" on task_entities
  for delete to authenticated using (household_id = any (get_user_household_ids()));

-- Staff roster. No DELETE: the app never removes a person, and their id is
-- referenced by every log they filed.
create policy "tenant_select_staff_profiles" on staff_profiles
  for select to authenticated using (household_id = any (get_user_household_ids()));
create policy "tenant_insert_staff_profiles" on staff_profiles
  for insert to authenticated with check (household_id = any (get_user_household_ids()));
create policy "tenant_update_staff_profiles" on staff_profiles
  for update to authenticated using (household_id = any (get_user_household_ids()))
  with check (household_id = any (get_user_household_ids()));

create policy "tenant_select_inventory_items" on inventory_items
  for select to authenticated using (household_id = any (get_user_household_ids()));
create policy "tenant_insert_inventory_items" on inventory_items
  for insert to authenticated with check (household_id = any (get_user_household_ids()));
create policy "tenant_update_inventory_items" on inventory_items
  for update to authenticated using (household_id = any (get_user_household_ids()))
  with check (household_id = any (get_user_household_ids()));
create policy "tenant_delete_inventory_items" on inventory_items
  for delete to authenticated using (household_id = any (get_user_household_ids()));

-- Chores. No DELETE, matching migrations/082: a chore is cancelled, not erased.
create policy "tenant_select_household_tasks" on household_tasks
  for select to authenticated using (household_id = any (get_user_household_ids()));
create policy "tenant_insert_household_tasks" on household_tasks
  for insert to authenticated with check (household_id = any (get_user_household_ids()));
create policy "tenant_update_household_tasks" on household_tasks
  for update to authenticated using (household_id = any (get_user_household_ids()))
  with check (household_id = any (get_user_household_ids()));

create policy "tenant_select_inventory_alerts" on inventory_alerts
  for select to authenticated using (household_id = any (get_user_household_ids()));
create policy "tenant_insert_inventory_alerts" on inventory_alerts
  for insert to authenticated with check (household_id = any (get_user_household_ids()));
create policy "tenant_update_inventory_alerts" on inventory_alerts
  for update to authenticated using (household_id = any (get_user_household_ids()))
  with check (household_id = any (get_user_household_ids()));
-- The Phase 47 undo window, kept as it was.
create policy "tenant_delete_recent_inventory_alerts" on inventory_alerts
  for delete to authenticated using (
    household_id = any (get_user_household_ids())
    and created_at > now() - interval '5 minutes'
  );

-- --- tables scoped through their parent -------------------------------------

create policy "tenant_select_master_schedules" on master_schedules
  for select to authenticated using (
    exists (select 1 from task_entities e
             where e.id = master_schedules.entity_id
               and e.household_id = any (get_user_household_ids())));
create policy "tenant_insert_master_schedules" on master_schedules
  for insert to authenticated with check (
    exists (select 1 from task_entities e
             where e.id = master_schedules.entity_id
               and e.household_id = any (get_user_household_ids())));
create policy "tenant_update_master_schedules" on master_schedules
  for update to authenticated using (
    exists (select 1 from task_entities e
             where e.id = master_schedules.entity_id
               and e.household_id = any (get_user_household_ids())))
  with check (
    exists (select 1 from task_entities e
             where e.id = master_schedules.entity_id
               and e.household_id = any (get_user_household_ids())));
create policy "tenant_delete_master_schedules" on master_schedules
  for delete to authenticated using (
    exists (select 1 from task_entities e
             where e.id = master_schedules.entity_id
               and e.household_id = any (get_user_household_ids())));

-- Completions: select, insert, delete — never update, so a log cannot be
-- rewritten after the fact (a mistake is deleted and re-logged).
create policy "tenant_select_task_logs" on task_logs
  for select to authenticated using (
    exists (select 1 from task_entities e
             where e.id = task_logs.entity_id
               and e.household_id = any (get_user_household_ids())));
create policy "tenant_insert_task_logs" on task_logs
  for insert to authenticated with check (
    exists (select 1 from task_entities e
             where e.id = task_logs.entity_id
               and e.household_id = any (get_user_household_ids())));
create policy "tenant_delete_task_logs" on task_logs
  for delete to authenticated using (
    exists (select 1 from task_entities e
             where e.id = task_logs.entity_id
               and e.household_id = any (get_user_household_ids())));

-- The health passport stays append-only: no UPDATE, no DELETE.
create policy "tenant_select_medical_records" on medical_records
  for select to authenticated using (
    exists (select 1 from task_entities e
             where e.id = medical_records.entity_id
               and e.household_id = any (get_user_household_ids())));
create policy "tenant_insert_medical_records" on medical_records
  for insert to authenticated with check (
    exists (select 1 from task_entities e
             where e.id = medical_records.entity_id
               and e.household_id = any (get_user_household_ids())));

create policy "tenant_select_routine_proposals" on routine_proposals
  for select to authenticated using (
    exists (select 1 from task_entities e
             where e.id = routine_proposals.pet_id
               and e.household_id = any (get_user_household_ids())));
create policy "tenant_insert_routine_proposals" on routine_proposals
  for insert to authenticated with check (
    exists (select 1 from task_entities e
             where e.id = routine_proposals.pet_id
               and e.household_id = any (get_user_household_ids())));
create policy "tenant_update_routine_proposals" on routine_proposals
  for update to authenticated using (
    exists (select 1 from task_entities e
             where e.id = routine_proposals.pet_id
               and e.household_id = any (get_user_household_ids())))
  with check (
    exists (select 1 from task_entities e
             where e.id = routine_proposals.pet_id
               and e.household_id = any (get_user_household_ids())));
-- Same five-minute undo window as before (Phase 52).
create policy "tenant_delete_recent_routine_proposals" on routine_proposals
  for delete to authenticated using (
    created_at > now() - interval '5 minutes'
    and exists (select 1 from task_entities e
                 where e.id = routine_proposals.pet_id
                   and e.household_id = any (get_user_household_ids())));

-- Stock checks are append-only, like medical records (migrations/083).
create policy "tenant_select_inventory_audit_logs" on inventory_audit_logs
  for select to authenticated using (
    exists (select 1 from inventory_items i
             where i.id = inventory_audit_logs.item_id
               and i.household_id = any (get_user_household_ids())));
create policy "tenant_insert_inventory_audit_logs" on inventory_audit_logs
  for insert to authenticated with check (
    exists (select 1 from inventory_items i
             where i.id = inventory_audit_logs.item_id
               and i.household_id = any (get_user_household_ids())));

-- ============================================================================
-- Indexes for the parent lookups the policies above run on every row
-- ============================================================================
create index if not exists master_schedules_entity_id_idx  on master_schedules(entity_id);
create index if not exists task_logs_entity_id_idx         on task_logs(entity_id);
create index if not exists medical_records_entity_id_idx   on medical_records(entity_id);
create index if not exists routine_proposals_pet_id_idx    on routine_proposals(pet_id);

-- ============================================================================
-- STILL OPEN AFTER THIS, AND WORTH SAYING OUT LOUD
-- ============================================================================
-- Storage. Both buckets (household-logs, inventory_audits) are public:true
-- with policies keyed only on bucket_id, so every task photo and stock photo
-- is readable by URL and uploadable by anyone holding the anon key. The rows
-- pointing at them are now private; the images are not. Fixing that means
-- private buckets plus signed URLs on every read path, which is its own phase.
--
-- The legacy binding window (migrations/089) is the other soft spot: until it
-- closes, a staff id is enough to bind a new device to that household.
-- ============================================================================
