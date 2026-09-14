-- ============================================================================
-- Phase 32 — Row Level Security audit & hardening
-- ============================================================================
--
-- AUDIT RESULT (probed live against the project on 2026-09-13 using the
-- public anon key, one throwaway row per table, all cleaned up afterwards):
--
--   table              SELECT  INSERT  UPDATE  DELETE
--   task_entities        yes     yes     yes     yes
--   master_schedules     yes     yes     yes     yes
--   task_logs            yes     yes     yes     yes
--   medical_records      yes     yes     yes     yes
--   inventory_alerts     yes     yes     yes     yes
--   staff_profiles       yes      -       -       -
--   storage/household-logs
--                        yes     yes      -      NO  <- 403 Access Denied
--
-- So: every table is wide open to all four verbs, and storage is the only
-- thing refusing anything — which is itself a bug, see part C.
--
-- ---------------------------------------------------------------------------
-- THREAT MODEL — read this before treating anything below as "security".
-- ---------------------------------------------------------------------------
-- Staff authenticate with a shared household PIN that is compared in the
-- browser. Nobody has a database identity. Every request the app makes
-- therefore arrives as the same `anon` role, carrying a key that ships inside
-- the public JS bundle (NEXT_PUBLIC_SUPABASE_ANON_KEY) and is readable by
-- anyone who opens devtools.
--
-- Consequently RLS here CANNOT:
--   * tell our app apart from someone running curl with the same key, or
--   * tell an owner apart from a staff member, so none of the owner-only
--     rules the UI enforces (pet deletion, resolving alerts, deleting a log
--     older than today) can be mirrored at the database layer.
--
-- What it CAN do, and what this file actually does, is delete whole command
-- classes the app never issues. A verb with no policy is a verb a leaked key
-- cannot use, no matter who is holding it. That is narrowing the blast
-- radius, not authentication.
--
-- The actual fix is real identity — Supabase Auth, or routing writes through
-- a server action that holds the service-role key. Until then this is
-- defence in depth.
--
-- ---------------------------------------------------------------------------
-- WHAT THE APP ACTUALLY CALLS  (src/lib/data/supabase-provider.ts)
-- ---------------------------------------------------------------------------
--   task_entities     select, insert, update, delete
--   master_schedules  select, insert, update, delete
--   task_logs         select, insert, delete          -- never updates
--   medical_records   select, insert                  -- never updates/deletes
--   inventory_alerts  select, insert, update, delete (5-minute undo window)
--   routine_proposals select, insert, update, delete (5-minute undo window)
--   staff_profiles    (untouched — Phase 3 placeholder)
--
-- Everything in part B is derived from that list, so applying it cannot break
-- a code path that exists today.
-- ============================================================================


-- ============================================================================
-- PART A — start from a known state
-- ============================================================================
-- Permissive policies OR together, so adding a tight policy next to a
-- forgotten `using (true)` changes nothing. Drop every existing policy on
-- these tables first rather than assuming we know their names.

do $$
declare
  r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'task_entities', 'master_schedules', 'task_logs',
        'medical_records', 'inventory_alerts', 'staff_profiles'
      )
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Idempotent, and the important half of the migration: if RLS was switched
-- off entirely then the policies below would be decoration.
alter table public.task_entities    enable row level security;
alter table public.master_schedules enable row level security;
alter table public.task_logs        enable row level security;
alter table public.medical_records  enable row level security;
alter table public.inventory_alerts enable row level security;
alter table public.staff_profiles   enable row level security;


-- ============================================================================
-- PART B — explicit policies, one per verb the app genuinely uses
-- ============================================================================

-- --- task_entities (pets) ---------------------------------------------------
-- Full CRUD. Deleting a pet cascades into its logs, schedules and medical
-- records, which makes this the single most destructive call available to the
-- client; part D offers an archive-only variant that removes it.
create policy "anon_select_task_entities" on public.task_entities
  for select to anon using (true);
create policy "anon_insert_task_entities" on public.task_entities
  for insert to anon with check (true);
create policy "anon_update_task_entities" on public.task_entities
  for update to anon using (true) with check (true);
create policy "anon_delete_task_entities" on public.task_entities
  for delete to anon using (true);

-- --- master_schedules -------------------------------------------------------
-- Full CRUD: the schedule editor creates, edits and removes routines.
create policy "anon_select_master_schedules" on public.master_schedules
  for select to anon using (true);
create policy "anon_insert_master_schedules" on public.master_schedules
  for insert to anon with check (true);
create policy "anon_update_master_schedules" on public.master_schedules
  for update to anon using (true) with check (true);
create policy "anon_delete_master_schedules" on public.master_schedules
  for delete to anon using (true);

-- --- task_logs --------------------------------------------------------------
-- SELECT and INSERT are deliberately unconditional: this is the table the
-- staff logging flow and the Phase 29 offline queue write to, and a replayed
-- offline log carries its original (past) completed_at, so any time-based
-- WITH CHECK here risks 403-ing a legitimate sync. Not worth it.
create policy "anon_select_task_logs" on public.task_logs
  for select to anon using (true);
create policy "anon_insert_task_logs" on public.task_logs
  for insert to anon with check (true);

-- No UPDATE policy: a completion is append-only. The app corrects a mistake
-- by deleting the log and re-logging, never by editing one in place.

-- DELETE stays open because undoing a completion is a real workflow
-- (long-press a photo in the Daily Feed). Part D offers a time-scoped variant.
create policy "anon_delete_task_logs" on public.task_logs
  for delete to anon using (true);

-- --- medical_records --------------------------------------------------------
-- The biggest genuine win in this file, at zero functional cost: the app only
-- ever reads and appends health records. With no UPDATE and no DELETE policy
-- the health passport becomes strictly append-only, so a leaked key cannot
-- rewrite or erase vaccination history.
create policy "anon_select_medical_records" on public.medical_records
  for select to anon using (true);
create policy "anon_insert_medical_records" on public.medical_records
  for insert to anon with check (true);

-- --- inventory_alerts -------------------------------------------------------
-- Staff raise alerts, owners mark them resolved. DELETE is scoped to the first
-- five minutes: Phase 47 lets a staff member take back a report they filed by
-- mistake, and that window is the whole feature. Anything older is a record
-- the owner may already have acted on, so it can be resolved but not erased.
create policy "anon_select_inventory_alerts" on public.inventory_alerts
  for select to anon using (true);
create policy "anon_insert_inventory_alerts" on public.inventory_alerts
  for insert to anon with check (true);
create policy "anon_update_inventory_alerts" on public.inventory_alerts
  for update to anon using (true) with check (true);
create policy "anon_delete_recent_inventory_alerts" on public.inventory_alerts
  for delete to anon using (created_at > now() - interval '5 minutes');

-- --- staff_profiles ---------------------------------------------------------
-- Phase 3 placeholder the client never touches. Read-only until that phase
-- gives it a real shape and real policies.
create policy "anon_select_staff_profiles" on public.staff_profiles
  for select to anon using (true);


-- ============================================================================
-- PART C — storage: fix the orphaned-photo leak
-- ============================================================================
-- schema.sql grants select + insert on the household-logs bucket but never
-- delete, so deletePhoto() in supabase-provider.ts fails with 403 every time.
-- household-context catches it as "best effort" (deliberately — a storage
-- failure shouldn't strand a task as done), which means the failure is
-- invisible: every photo the owner has ever "deleted" is still sitting in the
-- bucket, costing storage and still reachable by public URL.
--
-- The bucket is public:true, so these objects are readable by anyone holding
-- the URL. Deleting the row without deleting the object does not un-share it.
create policy "Public delete access for household-logs"
on storage.objects for delete
using (bucket_id = 'household-logs');

-- One-off cleanup: the audit had to upload a probe object to prove delete was
-- blocked, and then could not remove it. Run this after the policy above.
--   delete from storage.objects
--   where bucket_id = 'household-logs' and name like '__rls_probe__/%';


-- ============================================================================
-- PART D — optional, higher-friction hardening (NOT applied above)
-- ============================================================================
-- Each of these closes a real hole but also removes a working button. Apply
-- only if the trade-off is acceptable; they are commented out on purpose.

-- D1 — Archive-only pets. task_entities already carries metadata.archived and
-- the UI has an Archive action, so deletion is arguably redundant. Dropping it
-- makes the cascade-wipe of a pet plus all of its history impossible from the
-- client. Cost: the Delete button in pet-form-dialog.tsx starts failing, so
-- remove that button in the same change.
--   drop policy "anon_delete_task_entities" on public.task_entities;

-- D2 — Time-scoped log deletion. log-photo-thumbnail.tsx already applies the
-- rule "staff may delete only today's logs, owners may delete any"; the first
-- half of that is expressible here and stops a leaked key erasing months of
-- history in one request. Cost: an owner tidying up a photo older than the
-- window gets a silent no-op, so widen the interval to taste.
--   drop policy "anon_delete_task_logs" on public.task_logs;
--   create policy "anon_delete_recent_task_logs" on public.task_logs
--     for delete to anon
--     using (completed_at > now() - interval '7 days');

-- D3 — Reject absurdly future-dated logs. Cheap integrity guard, kept out of
-- part B because a badly-skewed device clock would turn it into the exact
-- offline-sync 403 this phase is meant to avoid.
--   drop policy "anon_insert_task_logs" on public.task_logs;
--   create policy "anon_insert_task_logs" on public.task_logs
--     for insert to anon
--     with check (completed_at < now() + interval '1 day');


-- ============================================================================
-- PART E — verify
-- ============================================================================
-- Expect: rls_enabled true everywhere, and no medical_records UPDATE/DELETE,
-- no task_logs UPDATE, no inventory_alerts DELETE.
--
--   select c.relname          as table_name,
--          c.relrowsecurity   as rls_enabled,
--          p.polcmd           as command,
--          p.polname          as policy_name
--   from pg_class c
--   left join pg_policy p on p.polrelid = c.oid
--   where c.relnamespace = 'public'::regnamespace
--     and c.relname in (
--       'task_entities', 'master_schedules', 'task_logs',
--       'medical_records', 'inventory_alerts', 'staff_profiles'
--     )
--   order by c.relname, p.polcmd;
