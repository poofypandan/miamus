-- ============================================================================
-- 138 — Bill payments: amount and receipt, owners only (Phase 164, PR B)
-- ============================================================================
-- docs/phase-164-bills-upkeep-plan.md, D5 A (owner, 2026-11-10). When an
-- owner marks a bill paid, they may note what it cost and add a photo of the
-- receipt (or the bank app's proof). OWNERS ONLY: staff phones can neither
-- read nor write it. household_tasks is readable by every session of the
-- household, staff phones included (090), so the amount can't live there;
-- like repair_costs (131) it has a table of its own, and the receipt sits in
-- the owner-only owner-receipts bucket (131), under <household>/bills/….
--
--   bill_payments   one per paid day of a bill: the day's row (task_id), the
--                   bill it belongs to (series_id, stamped by the server:
--                   the repeat, or the one-off itself), the amount, the
--                   receipt, when it was recorded.
--
-- HOW LONG: 2 years from the payment, then the nightly prune_old_bill_payments
-- deletes the row; its receipt, then pointed at by nothing, goes in the same
-- night's receipt sweep. Deleting the bill deletes its days and so their
-- payments (097's cascade); the app says so before deleting.
--
-- RE-CREATED, each copied from its latest definition with bill payments added:
--   repair_receipts_due_for_pruning (131)  keeps a bill receipt for 2 years
--        from its payment. Without this the sweep would delete it the night
--        after it was saved: it kept only what repair_costs points at.
--   orphaned_household_photos (131)        never lists a file a payment
--        points at.
--   export_household_data (135)            includes bill_payments (the
--        export is owners-only).
--
-- Privacy policy and legal.ts updated in the same PR (new personal data).
-- Additive: one constraint, one table, its indexes and policy, three functions
-- (reopen_bill_day, called by owners, runs as the caller), three re-created, one cron job. No SECURITY DEFINER function a client can call
-- except the export, re-created as it was (owners only through
-- caller_admin_household()); every function created or replaced revokes
-- EXECUTE here.
-- ============================================================================

-- --- 1. A composite key on chores, for the payment's foreign key ---------------
-- As 105 and 130 have: a payment can only ever point at a chore of its own
-- household, whatever ids a client sends.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'household_tasks_id_household_key') then
    alter table public.household_tasks
      add constraint household_tasks_id_household_key unique (id, household_id);
  end if;
end;
$$;

-- --- 2. The table ------------------------------------------------------------------
create table if not exists public.bill_payments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  task_id uuid not null,
  series_id uuid,
  amount_idr bigint,
  receipt_url text,
  paid_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  constraint bill_payments_task_fkey foreign key (task_id, household_id)
    references public.household_tasks (id, household_id) on delete cascade,
  constraint bill_payments_task_key unique (task_id),
  constraint bill_payments_amount_check check (amount_idr is null or amount_idr between 0 and 10000000000000),
  -- A payment says something: an amount, a receipt, or both.
  constraint bill_payments_not_empty check (amount_idr is not null or receipt_url is not null)
);

-- The composite foreign key's own index (134's rule: every foreign key covered).
create index if not exists bill_payments_task_household_idx on public.bill_payments (task_id, household_id);
create index if not exists bill_payments_household_idx on public.bill_payments (household_id, paid_at desc);
create index if not exists bill_payments_series_idx on public.bill_payments (series_id, paid_at desc);

alter table public.bill_payments enable row level security;

-- Owners only: a household_members row of the payment's household, never
-- get_user_household_ids(), which every staff phone passes (AGENTS.md).
drop policy if exists "owner_all_bill_payments" on public.bill_payments;
create policy "owner_all_bill_payments" on public.bill_payments
  for all to authenticated
  using (exists (select 1 from public.household_members m
                  where m.user_id = (select auth.uid()) and m.household_id = bill_payments.household_id))
  with check (exists (select 1 from public.household_members m
                       where m.user_id = (select auth.uid()) and m.household_id = bill_payments.household_id));

revoke all on table public.bill_payments from anon;
grant select, insert, update, delete on table public.bill_payments to authenticated;

-- What the server decides: who recorded it, when, and which bill it belongs
-- to (read from the day's row, so it can't disagree). The household, the day
-- and the bill never change on an update. Runs as the caller: an owner, who
-- can read the household's chores (090).
create or replace function public.bill_payments_server_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.paid_at := now();
    select coalesce(t.parent_task_id, t.id) into new.series_id
      from public.household_tasks t
     where t.id = new.task_id and t.household_id = new.household_id;
  else
    if new.household_id is distinct from old.household_id or new.task_id is distinct from old.task_id then
      raise exception 'bill_payment_fixed' using errcode = '42501';
    end if;
    new.created_by := old.created_by;
    new.paid_at := old.paid_at;
    new.series_id := old.series_id;
  end if;
  return new;
end;
$$;

drop trigger if exists bill_payments_server_fields on public.bill_payments;
create trigger bill_payments_server_fields
  before insert or update on public.bill_payments
  for each row execute function public.bill_payments_server_fields();

revoke all on function public.bill_payments_server_fields() from public, anon, authenticated;

-- Marking a paid bill not paid (Undo, Mark not done): its payment goes and
-- the day reopens, in one transaction, so neither half can happen without
-- the other (Codex, PR #65). Not SECURITY DEFINER: it runs as the caller,
-- under the tables' own policies (an owner's delete and update; anyone else's
-- delete reaches nothing). Returns the reopened day and the removed payment
-- (null if there was none), so the app can drop the receipt file.
create or replace function public.reopen_bill_day(p_task_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  removed public.bill_payments;
  reopened public.household_tasks;
begin
  delete from public.bill_payments where task_id = p_task_id returning * into removed;
  -- As updateHouseholdTaskStatus(…, 'pending'): the whole completion goes.
  update public.household_tasks
     set status = 'pending', completed_at = null, completed_by = null,
         photo_url = null, before_photo_url = null, after_photo_url = null
   where id = p_task_id
  returning * into reopened;
  if reopened.id is null then
    raise exception 'chore_not_updated' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'task', to_jsonb(reopened),
    'payment', case when removed.id is null then null else to_jsonb(removed) end
  );
end;
$$;

revoke all on function public.reopen_bill_day(uuid) from public, anon;
grant execute on function public.reopen_bill_day(uuid) to authenticated;

-- --- 3. Kept 2 years ------------------------------------------------------------------
-- Not SECURITY DEFINER: only its cron job (as its owner) and the service role
-- call it. Returns how many were deleted.
create or replace function public.prune_old_bill_payments()
returns int
language plpgsql
set search_path = ''
as $$
declare
  removed int;
begin
  delete from public.bill_payments bp where bp.paid_at < public.repair_keep_cutoff();
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.prune_old_bill_payments() from public, anon, authenticated;
grant execute on function public.prune_old_bill_payments() to service_role;

-- 19:50 UTC (02:50 in Jakarta), before the photo clean-up at 20:00, so a
-- deleted payment's receipt goes the same night.
select cron.unschedule('prune-old-bill-payments')
where exists (select 1 from cron.job where jobname = 'prune-old-bill-payments');

select cron.schedule('prune-old-bill-payments', '50 19 * * *', $job$ select public.prune_old_bill_payments(); $job$);

-- --- 4. Receipts: bill receipts are kept 2 years (131's function, re-created) --------
-- Receipts due for deletion, as (bucket_id, name) for the Edge Function's
-- per-bucket pass: a receipt of a repair closed more than 2 years ago or of a
-- payment recorded more than 2 years ago, or one nothing points at any more
-- (its repair or payment deleted, or an abandoned upload) once over a day old.
create or replace function public.repair_receipts_due_for_pruning(p_secret text, p_limit int default 100)
returns table (bucket_id text, name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  repair_cutoff timestamptz := public.repair_keep_cutoff();
  upload_grace timestamptz := public.food_photo_keep_cutoff();
begin
  perform public.assert_task_photo_retention_secret(p_secret);

  return query
  with kept as (
    select (public.photo_object_ref(c.receipt_url))[2] as object_name
    from public.repair_costs c
    join public.repairs rp on rp.id = c.repair_id
    where c.receipt_url is not null
      and (public.photo_object_ref(c.receipt_url))[1] = 'owner-receipts'
      and (rp.closed_at is null or rp.closed_at >= repair_cutoff)
    union all
    -- A bill's receipt (138): kept 2 years from the payment.
    select (public.photo_object_ref(bp.receipt_url))[2]
    from public.bill_payments bp
    where bp.receipt_url is not null
      and (public.photo_object_ref(bp.receipt_url))[1] = 'owner-receipts'
      and bp.paid_at >= repair_cutoff
  ),
  referenced as (
    select (public.photo_object_ref(c.receipt_url))[2] as object_name
    from public.repair_costs c
    where c.receipt_url is not null
      and (public.photo_object_ref(c.receipt_url))[1] = 'owner-receipts'
    union all
    select (public.photo_object_ref(bp.receipt_url))[2]
    from public.bill_payments bp
    where bp.receipt_url is not null
      and (public.photo_object_ref(bp.receipt_url))[1] = 'owner-receipts'
  )
  select o.bucket_id, o.name
  from storage.objects o
  where o.bucket_id = 'owner-receipts'
    and not exists (select 1 from kept k where k.object_name = o.name)
    -- Unreferenced uploads wait a day: a save may still be on its way.
    and (o.created_at < upload_grace or exists (select 1 from referenced r where r.object_name = o.name))
  order by o.created_at
  limit greatest(p_limit, 0);
end;
$$;

revoke all on function public.repair_receipts_due_for_pruning(text, int) from public, anon, authenticated;
grant execute on function public.repair_receipts_due_for_pruning(text, int) to service_role;

-- --- 5. Orphaned photos: never one a payment points at (131's function, re-created) ---
create or replace function public.orphaned_household_photos(p_secret text, p_limit integer DEFAULT 100)
 RETURNS TABLE(bucket_id text, name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
begin
  perform public.assert_task_photo_retention_secret(p_secret);

  return query
  with candidates as (
    select o.bucket_id, o.name, o.created_at
    from storage.objects o
    where o.bucket_id in ('household-logs', 'inventory_audits', 'owner-receipts')
      and case
            when public.storage_object_household(o.name) is not null then
              not exists (select 1 from public.households h
                           where h.id = public.storage_object_household(o.name))
            -- The oldest uploads have no household folder; the storage
            -- policies (migration 092) give them to this household.
            else
              not exists (select 1 from public.households h
                           where h.id = '975f0914-4d0d-43ad-8dee-a967d9bd10cd')
          end
  ),
  -- Insurance: a file any remaining row still points at is never listed.
  live_refs as (
    select public.photo_object_ref(u) as r
    from (
      select l.photo_url as u from public.task_logs l
      union all
      select unnest(array[t.photo_url, t.before_photo_url, t.after_photo_url]) from public.household_tasks t
      union all
      select m.document_photo_url from public.medical_records m
      union all
      select i.photo_url from public.inventory_items i
      union all
      select a.photo_url from public.inventory_audit_logs a
      union all
      select f.photo_url from public.food_items f
      union all
      select rp.photo_url from public.repairs rp
      union all
      select n.photo_url from public.repair_notes n
      union all
      select c.receipt_url from public.repair_costs c
      union all
      select bp.receipt_url from public.bill_payments bp
      union all
      select v #>> '{}'
      from public.task_entities e,
           jsonb_path_query(e.metadata, 'strict $.** ? (@.type() == "string")') as v
    ) x
    where x.u is not null
  )
  select c.bucket_id, c.name
  from candidates c
  where not exists (
    select 1 from live_refs lr
     where lr.r is not null and lr.r[1] = c.bucket_id and lr.r[2] = c.name
  )
  order by c.created_at
  limit greatest(p_limit, 0);
end;
$$;
revoke all on function public.orphaned_household_photos(text, int) from public, anon, authenticated;
grant execute on function public.orphaned_household_photos(text, int) to service_role;

-- --- 6. The export includes bill payments (135's function, plus 'bill_payments') ----
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
      select jsonb_build_object('id', h.id, 'name', h.name, 'created_at', h.created_at)
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
        'completed_at', l.completed_at, 'staff', s.name,
        'photo', (public.photo_object_ref(l.photo_url))[1] || '/' || (public.photo_object_ref(l.photo_url))[2]
      ) order by l.completed_at)
      from public.task_logs l
      join public.task_entities e on e.id = l.entity_id
      left join public.staff_profiles s on s.id = l.staff_id
      where e.household_id = hh
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
    'linked_phones', coalesce((
      select jsonb_agg(jsonb_build_object('linked_at', d.created_at, 'last_seen_at', d.last_seen_at)
                       order by d.created_at)
      from public.device_sessions d where d.household_id = hh
    ), '[]'::jsonb),
    'staff_sign_in_attempts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'at', a.created_at, 'kind', a.kind, 'success', a.success, 'staff', s.name
      ) order by a.created_at)
      from public.staff_sign_in_attempts a
      left join public.staff_profiles s on s.id = a.staff_id
      where a.household_id = hh
    ), '[]'::jsonb),
    'my_language', (select p.locale from public.user_preferences p where p.user_id = uid)
  );
end;
$$;
revoke all on function public.export_household_data() from public, anon;
grant execute on function public.export_household_data() to authenticated;
