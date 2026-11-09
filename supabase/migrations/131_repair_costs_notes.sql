-- ============================================================================
-- 131 — Repairs, part 2: cost and receipt, notes, warranty (Phase 159, PR B)
-- ============================================================================
-- docs/phase-159-repairs-plan.md; owner decisions (2026-11-09): A for D1–D6.
--
--   repairs.warranty_until   the date a repair's warranty ends (owners).
--   repair_costs             what a repair cost, a receipt photo and a short
--                            note. OWNERS ONLY (D4): staff phones can neither
--                            read nor write it. Its own table, so the
--                            household-wide read on repairs never shows it.
--   owner-receipts bucket    receipt photos. Private, read/write/delete only
--                            for a household_members row of the household in
--                            the object's path — never get_user_household_ids(),
--                            which includes every staff phone (AGENTS.md).
--                            household-logs would not do: 092 lets every
--                            session of the household read it.
--   repair_notes             a short thread on a repair, for owners and staff
--                            ("the repair person needs a part, back
--                            Thursday"), with an optional photo. Anyone in the
--                            household reads and adds; the author may take a
--                            note back within 5 minutes; owners may delete any.
--
-- HOW LONG (D3, as migrations/130): a note's photo and a receipt are kept as
-- long as their repair — open, then 2 years after it closes. Note photos go
-- through task_photos_due_for_pruning (re-created); receipts through a new
-- repair_receipts_due_for_pruning(p_secret, p_limit) returning (bucket_id,
-- name), which the prune-task-photos Edge Function removes in one more pass
-- (deployed with this migration). Receipts of a deleted repair, and uploads
-- nothing points at, go after a day. orphaned_household_photos (127, re-created)
-- also sweeps owner-receipts for deleted households.
--
-- The export (re-created) includes costs and notes; it is owners-only.
-- Additive: two tables, one column, one bucket and its three policies, one
-- new function, four re-created. No SECURITY DEFINER function a client can
-- call; every function created or replaced revokes EXECUTE here.
-- ============================================================================

-- --- 1. Warranty --------------------------------------------------------------
alter table public.repairs add column if not exists warranty_until date;

-- 130's guard, with the warranty date among what a staff report can't set.
create or replace function public.repairs_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
declare
  is_owner boolean;
begin
  -- No session (the service role, cron, migrations): maintenance, trusted.
  is_owner := auth.uid() is null or exists (
    select 1 from public.household_members m
     where m.user_id = auth.uid() and m.household_id = new.household_id
  );

  new.title := btrim(new.title);
  new.spot := nullif(btrim(new.spot), '');
  new.details := nullif(btrim(new.details), '');
  new.fixed_by_name := nullif(btrim(new.fixed_by_name), '');
  new.dismiss_reason := nullif(btrim(new.dismiss_reason), '');
  new.updated_at := now();

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
    new.decided_by := null;
    new.decided_at := null;
    new.closed_at := null;
    if is_owner then
      -- Owners' reports go straight on the list (D2).
      if new.status <> 'open' then
        raise exception 'repair_owner_reports_open' using errcode = '23514';
      end if;
    else
      -- A staff phone: a report that waits for an owner, and nothing more.
      if new.status <> 'reported' or new.dismiss_reason is not null or new.fixed_by_name is not null
         or new.warranty_until is not null or new.reported_by_staff is null then
        raise exception 'repair_staff_report_only' using errcode = '42501';
      end if;
    end if;
    -- The person named is this household's, and still on the roster.
    if new.reported_by_staff is not null and current_user = 'authenticated' then
      if not exists (select 1 from public.staff_profiles s
                      where s.id = new.reported_by_staff and s.household_id = new.household_id) then
        raise exception 'staff_not_in_household' using errcode = '42501';
      end if;
      if public.is_archived_staff(new.reported_by_staff) then
        raise exception 'staff_archived' using errcode = '42501',
          hint = 'This person was removed from the household; work is no longer recorded in their name.';
      end if;
    end if;
    return new;
  end if;

  -- UPDATE: owners only (the policy says so too; this is the second lock).
  if not is_owner then
    raise exception 'repair_owner_only' using errcode = '42501';
  end if;
  if new.household_id is distinct from old.household_id then
    raise exception 'repair_household_fixed' using errcode = '42501';
  end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.reported_by_staff := old.reported_by_staff;

  if new.status is distinct from old.status then
    if new.status = 'reported' then
      raise exception 'repair_cannot_return_to_reported' using errcode = '23514';
    end if;
    if old.status = 'reported' then
      new.decided_by := auth.uid();
      new.decided_at := now();
    else
      new.decided_by := old.decided_by;
      new.decided_at := old.decided_at;
    end if;
    if new.status in ('fixed', 'dismissed') then
      new.closed_at := now();
    else
      new.closed_at := null;
    end if;
  else
    new.decided_by := old.decided_by;
    new.decided_at := old.decided_at;
    new.closed_at := old.closed_at;
  end if;
  -- A reason belongs to a dismissal only.
  if new.status <> 'dismissed' then
    new.dismiss_reason := null;
  end if;
  return new;
end;
$$;
revoke all on function public.repairs_guard() from public, anon, authenticated;

-- --- 2. Cost and receipt (owners only, D4) --------------------------------------
create table if not exists public.repair_costs (
  repair_id uuid primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  amount_idr bigint,
  receipt_url text,
  note text,
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  constraint repair_costs_repair_fkey foreign key (repair_id, household_id)
    references public.repairs (id, household_id) on delete cascade,
  constraint repair_costs_amount_check check (amount_idr is null or amount_idr between 0 and 10000000000000),
  constraint repair_costs_note_length check (note is null or char_length(note) <= 200)
);

create index if not exists repair_costs_household_idx on public.repair_costs (household_id);

alter table public.repair_costs enable row level security;

drop policy if exists "owner_all_repair_costs" on public.repair_costs;
create policy "owner_all_repair_costs" on public.repair_costs
  for all to authenticated
  using (exists (select 1 from public.household_members m
                  where m.user_id = (select auth.uid()) and m.household_id = repair_costs.household_id))
  with check (exists (select 1 from public.household_members m
                       where m.user_id = (select auth.uid()) and m.household_id = repair_costs.household_id));

revoke all on table public.repair_costs from anon;
grant select, insert, update, delete on table public.repair_costs to authenticated;

create or replace function public.repair_costs_server_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.note := nullif(btrim(new.note), '');
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_by := old.created_by;
    if new.household_id is distinct from old.household_id or new.repair_id is distinct from old.repair_id then
      raise exception 'repair_cost_fixed' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists repair_costs_server_fields on public.repair_costs;
create trigger repair_costs_server_fields
  before insert or update on public.repair_costs
  for each row execute function public.repair_costs_server_fields();

revoke all on function public.repair_costs_server_fields() from public, anon, authenticated;

-- --- 3. The owner-receipts bucket -------------------------------------------------
-- Same type and size limits as the photo buckets (migrations/101).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('owner-receipts', 'owner-receipts', false, 2 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "owner_read_owner_receipts" on storage.objects;
create policy "owner_read_owner_receipts" on storage.objects
  for select to authenticated using (
    bucket_id = 'owner-receipts'
    and exists (select 1 from public.household_members m
                 where m.user_id = (select auth.uid())
                   and m.household_id = public.storage_object_household(name))
  );

drop policy if exists "owner_insert_owner_receipts" on storage.objects;
create policy "owner_insert_owner_receipts" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'owner-receipts'
    and exists (select 1 from public.household_members m
                 where m.user_id = (select auth.uid())
                   and m.household_id = public.storage_object_household(name))
  );

drop policy if exists "owner_delete_owner_receipts" on storage.objects;
create policy "owner_delete_owner_receipts" on storage.objects
  for delete to authenticated using (
    bucket_id = 'owner-receipts'
    and exists (select 1 from public.household_members m
                 where m.user_id = (select auth.uid())
                   and m.household_id = public.storage_object_household(name))
  );

-- --- 4. Notes on a repair (owners and staff) --------------------------------------
create table if not exists public.repair_notes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  repair_id uuid not null,
  body text not null,
  photo_url text,
  staff_id uuid references public.staff_profiles (id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint repair_notes_repair_fkey foreign key (repair_id, household_id)
    references public.repairs (id, household_id) on delete cascade,
  constraint repair_notes_body_length check (char_length(btrim(body)) between 1 and 500)
);

create index if not exists repair_notes_repair_idx on public.repair_notes (repair_id, created_at);
create index if not exists repair_notes_household_idx on public.repair_notes (household_id);
create index if not exists repair_notes_staff_idx on public.repair_notes (staff_id) where staff_id is not null;

alter table public.repair_notes enable row level security;

drop policy if exists "tenant_select_repair_notes" on public.repair_notes;
create policy "tenant_select_repair_notes" on public.repair_notes
  for select to authenticated using (household_id = any (public.get_user_household_ids()));

drop policy if exists "tenant_insert_repair_notes" on public.repair_notes;
create policy "tenant_insert_repair_notes" on public.repair_notes
  for insert to authenticated with check (household_id = any (public.get_user_household_ids()));

-- Owners delete any note; its author takes it back within 5 minutes.
drop policy if exists "owner_or_recent_author_delete_repair_notes" on public.repair_notes;
create policy "owner_or_recent_author_delete_repair_notes" on public.repair_notes
  for delete to authenticated
  using (
    exists (select 1 from public.household_members m
             where m.user_id = (select auth.uid()) and m.household_id = repair_notes.household_id)
    or (
      household_id = any (public.get_user_household_ids())
      and created_by = (select auth.uid())
      and created_at > now() - interval '5 minutes'
    )
  );

-- No update policy: a note is said, not edited.
revoke all on table public.repair_notes from anon;
grant select, insert, delete on table public.repair_notes to authenticated;

create or replace function public.repair_notes_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.body := btrim(new.body);
  new.created_by := auth.uid();
  new.created_at := now();
  -- The author named is this household's, and still on the roster (119).
  if new.staff_id is not null and current_user = 'authenticated' then
    if not exists (select 1 from public.staff_profiles s
                    where s.id = new.staff_id and s.household_id = new.household_id) then
      raise exception 'staff_not_in_household' using errcode = '42501';
    end if;
    if public.is_archived_staff(new.staff_id) then
      raise exception 'staff_archived' using errcode = '42501',
        hint = 'This person was removed from the household; work is no longer recorded in their name.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists repair_notes_guard on public.repair_notes;
create trigger repair_notes_guard
  before insert on public.repair_notes
  for each row execute function public.repair_notes_guard();

revoke all on function public.repair_notes_guard() from public, anon, authenticated;

-- --- 5. Photos: notes and receipts kept as long as their repair --------------------
-- 130's body, plus notes' photos.
create or replace function public.task_photos_due_for_pruning(p_secret text, p_limit integer DEFAULT 100)
 RETURNS TABLE(name text, size bigint, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  cutoff timestamptz := public.task_photo_retention_cutoff();
  food_cutoff timestamptz := public.food_photo_keep_cutoff();
  repair_cutoff timestamptz := public.repair_keep_cutoff();
begin
  perform public.assert_task_photo_retention_secret(p_secret);

  return query
  with refs as (
    select public.photo_object_ref(l.photo_url) as r, l.completed_at < cutoff as expired
    from public.task_logs l
    where l.photo_url is not null
    union all
    -- A repair visit (migrations/130) keeps its photos while its repair is
    -- open, and for two years after it closes; a visit whose repair was
    -- deleted (repair_id set null) follows the 30-day rule again.
    select public.photo_object_ref(u),
           case when t.repair_id is not null then coalesce(rp.closed_at < repair_cutoff, false)
                else coalesce(t.completed_at < cutoff, false) end
    from public.household_tasks t
    left join public.repairs rp on rp.id = t.repair_id
    cross join lateral unnest(array[t.photo_url, t.before_photo_url, t.after_photo_url]) as u
    where u is not null
    union all
    -- A repair's own photo (the problem): the same two years after closing.
    select public.photo_object_ref(rp.photo_url), coalesce(rp.closed_at < repair_cutoff, false)
    from public.repairs rp
    where rp.photo_url is not null
    union all
    -- A note's photo (migrations/131): kept as long as its repair.
    select public.photo_object_ref(n.photo_url), coalesce(rp.closed_at < repair_cutoff, false)
    from public.repair_notes n
    join public.repairs rp on rp.id = n.repair_id
    where n.photo_url is not null
  ),
  due as (
    select r[2] as object_name
    from refs
    where r is not null and r[1] = 'household-logs'
    group by r[2]
    having bool_and(expired)
  ),
  permanent as (
    select public.photo_object_ref(p.url) as r
    from (
      select m.document_photo_url as url from public.medical_records m
      union all
      select i.photo_url from public.inventory_items i
      union all
      select a.photo_url from public.inventory_audit_logs a
      union all
      select v #>> '{}'
      from public.task_entities e,
           jsonb_path_query(e.metadata, 'strict $.** ? (@.type() == "string")') as v
    ) p
    where p.url is not null
  ),
  -- Food still listed, or finished less than a day ago (Undo), keeps its
  -- photo whichever branch would otherwise take it (Codex review, PR #10).
  food_kept as (
    select (public.photo_object_ref(f.photo_url))[2] as object_name
    from public.food_items f
    where f.photo_url is not null
      and (f.finished_at is null or f.finished_at >= food_cutoff)
  ),
  task_due as (
    select o.name, (o.metadata->>'size')::bigint as size, o.created_at
    from due d
    join storage.objects o on o.bucket_id = 'household-logs' and o.name = d.object_name
    where not exists (
      select 1 from permanent pm
      where pm.r is not null and pm.r[1] = 'household-logs' and pm.r[2] = d.object_name
    )
      and not exists (select 1 from food_kept k where k.object_name = d.object_name)
  ),
  -- Anything else that still needs the object protects it too (Codex review,
  -- PR #10): the folder is a convention, a reference is a fact. Permanent
  -- references, and task photos still inside their window.
  still_needed as (
    select pm.r[2] as object_name from permanent pm
    where pm.r is not null and pm.r[1] = 'household-logs'
    union all
    select rf.r[2] from refs rf
    where rf.r is not null and rf.r[1] = 'household-logs' and not rf.expired
  ),
  food_due as (
    select o.name, (o.metadata->>'size')::bigint as size, o.created_at
    from storage.objects o
    where o.bucket_id = 'household-logs'
      and o.name ~ '^[0-9a-f-]{36}/food/'
      and o.created_at < food_cutoff
      and not exists (select 1 from food_kept k where k.object_name = o.name)
      and not exists (select 1 from still_needed sn where sn.object_name = o.name)
      -- Never twice in one answer: task_due may already list it.
      and not exists (select 1 from task_due td where td.name = o.name)
  ),
  -- Photos under <household>/repairs/ that no repair points at any more —
  -- a repair deleted while the Storage delete failed, or an abandoned
  -- report's upload — once over a day old, like food's.
  repairs_due as (
    select o.name, (o.metadata->>'size')::bigint as size, o.created_at
    from storage.objects o
    where o.bucket_id = 'household-logs'
      and o.name ~ '^[0-9a-f-]{36}/repairs/'
      and o.created_at < food_cutoff
      and not exists (
        select 1 from public.repairs rp
         where (public.photo_object_ref(rp.photo_url))[1] = 'household-logs'
           and (public.photo_object_ref(rp.photo_url))[2] = o.name
      )
      and not exists (select 1 from still_needed sn where sn.object_name = o.name)
      and not exists (select 1 from task_due td where td.name = o.name)
      and not exists (select 1 from food_due fd where fd.name = o.name)
  )
  select x.name, x.size, x.created_at
  from (select * from task_due union all select * from food_due union all select * from repairs_due) x
  order by x.created_at
  limit greatest(p_limit, 0);
end;
$$;
revoke all on function public.task_photos_due_for_pruning(text, int) from public, anon, authenticated;
grant execute on function public.task_photos_due_for_pruning(text, int) to service_role;

-- Receipts due for deletion, as (bucket_id, name) for the Edge Function's
-- per-bucket pass: a receipt of a repair closed more than 2 years ago, or one
-- no cost row points at any more (its repair deleted, or an abandoned upload)
-- once over a day old.
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
  ),
  referenced as (
    select (public.photo_object_ref(c.receipt_url))[2] as object_name
    from public.repair_costs c
    where c.receipt_url is not null
      and (public.photo_object_ref(c.receipt_url))[1] = 'owner-receipts'
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

-- 127's function, now also over owner-receipts, and never listing a file a
-- repair, a note or a cost still points at.
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

-- --- 6. The export includes costs and notes (owners only, as before) --------------
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
