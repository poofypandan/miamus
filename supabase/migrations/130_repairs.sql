-- ============================================================================
-- 130 — Repairs (Phase 159, PR A; docs/phase-159-repairs-plan.md)
-- ============================================================================
-- Owner decisions (2026-11-09): option A for D1–D6.
--
-- A repair is a reported problem in a room ("LT3 · Music Room: wall
-- cracked"), fixed by one or more visits. A visit is an ordinary Maintenance
-- chore with household_tasks.repair_id set, finished with the usual before
-- and after photos (migration 104). "Scheduled" and "work done" are derived
-- from the visits, never stored, so they can't disagree with the chores.
--
-- WHO MAY DO WHAT
--   Read: any session of the household, owners and staff phones
--   (get_user_household_ids()).
--   Report: owners insert as 'open'. Staff phones insert only as
--   'reported', naming an active staff profile of the household (119's
--   rule), with no decision fields (D2: an owner accepts or dismisses).
--   Staff phones may delete their own 'reported' row within 5 minutes
--   (Undo), as with routine proposals. Nothing else.
--   Accept, dismiss, edit, close, delete: owners only, through a
--   household_members check — never get_user_household_ids() alone, which
--   includes every staff phone (AGENTS.md).
--   Linking a chore to a repair (repair_id) is owner-only: 128's guard keeps
--   it out of what a staff phone may update, and a staff phone's copy of a
--   repeat's day must carry the template's repair_id.
--
-- WHAT THE SERVER DECIDES
--   created_by/created_at, decided_by/decided_at (when a staff report is
--   accepted or dismissed), closed_at (when it becomes fixed or dismissed,
--   cleared when reopened), updated_at.
--
-- URGENT (D6)
--   An urgent report from a staff phone pushes every owner, in each owner's
--   language, composed here (no phone chooses the text). Normal reports
--   show on the owners' Today screen; no push.
--
-- HOW LONG THINGS ARE KEPT (D3)
--   A repair, its photo and its visits' photos are kept while it is open and
--   for 2 years after it closes. task_photos_due_for_pruning (re-created)
--   treats a visit as expiring then, never while its repair is open; the
--   repair's own photo too. A nightly job deletes repairs closed more than 2
--   years ago once their photo is gone; their visits (repair_id set null)
--   then follow the 30-day chore rule. Photos under <household>/repairs/
--   that no repair points at are swept after a day, like food's. The Edge
--   Function and its secret are unchanged.
--
-- The repair person is a name only (D5). Cost and receipts (D4) come in
-- PR B, in their own owner-only table and bucket.
--
-- Additive: one table, its policies and triggers, one column on
-- household_tasks, functions (three re-created), one cron job. No SECURITY
-- DEFINER function a client can call; every function created or replaced
-- here revokes EXECUTE from public and anon in this file.
-- ============================================================================

-- --- 1. The table -------------------------------------------------------------
create table if not exists public.repairs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  location_id uuid,
  spot text,
  title text not null,
  details text,
  photo_url text,
  urgent boolean not null default false,
  status text not null default 'open',
  reported_by_staff uuid references public.staff_profiles (id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  dismiss_reason text,
  fixed_by_name text,
  closed_at timestamptz,
  constraint repairs_id_household_key unique (id, household_id),
  constraint repairs_location_fkey foreign key (location_id, household_id)
    references public.household_locations (id, household_id) on delete set null (location_id),
  constraint repairs_status_check check (status in ('reported', 'open', 'fixed', 'dismissed')),
  constraint repairs_title_length check (char_length(btrim(title)) between 1 and 120),
  constraint repairs_details_length check (details is null or char_length(details) <= 500),
  constraint repairs_spot_length check (spot is null or char_length(btrim(spot)) between 1 and 40),
  constraint repairs_dismiss_reason_length check (dismiss_reason is null or char_length(dismiss_reason) <= 200),
  constraint repairs_fixed_by_name_length check (fixed_by_name is null or char_length(btrim(fixed_by_name)) between 1 and 60)
);

create index if not exists repairs_household_status_idx on public.repairs (household_id, status);
create index if not exists repairs_location_idx on public.repairs (location_id) where location_id is not null;
create index if not exists repairs_reported_by_staff_idx on public.repairs (reported_by_staff) where reported_by_staff is not null;
create index if not exists repairs_closed_at_idx on public.repairs (closed_at) where closed_at is not null;

-- --- 2. Row level security ------------------------------------------------------
alter table public.repairs enable row level security;

drop policy if exists "tenant_select_repairs" on public.repairs;
create policy "tenant_select_repairs" on public.repairs
  for select to authenticated using (household_id = any (public.get_user_household_ids()));

-- Owners and staff phones may report; the guard below decides what a staff
-- phone's report may say.
drop policy if exists "tenant_insert_repairs" on public.repairs;
create policy "tenant_insert_repairs" on public.repairs
  for insert to authenticated with check (household_id = any (public.get_user_household_ids()));

-- Owners only: a household_members row for this household.
drop policy if exists "owner_update_repairs" on public.repairs;
create policy "owner_update_repairs" on public.repairs
  for update to authenticated
  using (exists (select 1 from public.household_members m
                  where m.user_id = (select auth.uid()) and m.household_id = repairs.household_id))
  with check (exists (select 1 from public.household_members m
                       where m.user_id = (select auth.uid()) and m.household_id = repairs.household_id));

-- Owners, or the phone that sent a staff report, within 5 minutes (Undo).
drop policy if exists "owner_or_recent_reporter_delete_repairs" on public.repairs;
create policy "owner_or_recent_reporter_delete_repairs" on public.repairs
  for delete to authenticated
  using (
    exists (select 1 from public.household_members m
             where m.user_id = (select auth.uid()) and m.household_id = repairs.household_id)
    or (
      household_id = any (public.get_user_household_ids())
      and status = 'reported'
      and created_by = (select auth.uid())
      and created_at > now() - interval '5 minutes'
    )
  );

revoke all on table public.repairs from anon;
grant select, insert, update, delete on table public.repairs to authenticated;

-- --- 3. What the server decides, and what a staff phone may say -----------------
create or replace function public.repairs_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
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
         or new.reported_by_staff is null then
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

drop trigger if exists repairs_guard on public.repairs;
create trigger repairs_guard
  before insert or update on public.repairs
  for each row execute function public.repairs_guard();

revoke all on function public.repairs_guard() from public, anon, authenticated;

-- --- 4. Urgent staff reports push the owners (D6) ---------------------------------
-- "Floor · Room · Spot", or nothing: how the repair's place reads in a push.
create or replace function public.repair_place_label(p_location_id uuid, p_spot text)
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(concat_ws(' · ', f.name, l.name, nullif(btrim(p_spot), '')), '')
    from (select 1) one
    left join public.household_locations l on l.id = p_location_id
    left join public.household_locations f on f.id = l.parent_id;
$$;

revoke all on function public.repair_place_label(uuid, text) from public, anon, authenticated;
grant execute on function public.repair_place_label(uuid, text) to service_role;

create or replace function public.notify_urgent_repair()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  staff_name text;
  place text;
  what text;
begin
  -- Urgent reports from a staff phone only: an owner knows what they just
  -- reported, and no session at all is maintenance.
  if not new.urgent or auth.uid() is null or exists (
       select 1 from public.household_members m
        where m.user_id = auth.uid() and m.household_id = new.household_id) then
    return new;
  end if;

  begin
    if new.reported_by_staff is not null then
      select s.name into staff_name from public.staff_profiles s where s.id = new.reported_by_staff;
    end if;
    place := public.repair_place_label(new.location_id, new.spot);
    what := coalesce(place || ' — ', '') || new.title || coalesce(' (' || staff_name || ')', '');
    perform public.queue_owner_push(
      new.household_id,
      'Urgent repair', what,
      'Perbaikan darurat', what,
      '/dashboard?module=chores&chores=repairs', 'repair-' || new.id::text,
      auth.uid()
    );
  exception when others then
    raise warning 'Repair push not queued for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists repairs_notify_urgent on public.repairs;
create trigger repairs_notify_urgent
  after insert on public.repairs
  for each row execute function public.notify_urgent_repair();

revoke all on function public.notify_urgent_repair() from public, anon, authenticated;

-- --- 5. A visit is a chore linked to its repair ------------------------------------
alter table public.household_tasks add column if not exists repair_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'household_tasks_repair_fkey') then
    alter table public.household_tasks
      add constraint household_tasks_repair_fkey foreign key (repair_id, household_id)
      references public.repairs (id, household_id) on delete set null (repair_id);
  end if;
end;
$$;

create index if not exists household_tasks_repair_id_idx on public.household_tasks (repair_id) where repair_id is not null;

-- 128's guard (as 129 left it), with repair_id added to what a staff
-- phone's copy of a repeat's day must carry over from its template. Its
-- UPDATE allowlist already keeps repair_id out of a staff phone's reach.
create or replace function public.household_tasks_owner_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_household uuid := coalesce(new.household_id, old.household_id);
  template public.household_tasks;
  staff_columns constant text[] := array[
    'assigned_to', 'status', 'completed_by', 'completed_at',
    'photo_url', 'before_photo_url', 'after_photo_url'
  ];
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  if exists (
    select 1 from public.household_members m
     where m.user_id = auth.uid() and m.household_id = target_household
  ) then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    raise exception 'chore_owner_only' using errcode = '42501';
  end if;

  if new.status is distinct from 'pending' and new.status is distinct from 'completed' then
    raise exception 'chore_owner_only' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - staff_columns) is distinct from (to_jsonb(old) - staff_columns) then
      raise exception 'chore_owner_only' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.parent_task_id is null then
    raise exception 'chore_owner_only' using errcode = '42501';
  end if;
  select * into template
    from public.household_tasks t
   where t.id = new.parent_task_id
     and t.household_id = new.household_id
     and t.parent_task_id is null
     and coalesce(t.recurrence, 'none') <> 'none';
  if not found then
    raise exception 'chore_owner_only' using errcode = '42501';
  end if;
  if (new.title, new.notes, new.category, new.due_time, new.requires_supervision, new.location_id, new.spot,
      new.repair_id)
     is distinct from
     (template.title, template.notes, template.category, template.due_time,
      coalesce(template.requires_supervision, false), template.location_id, template.spot,
      template.repair_id)
     or coalesce(new.recurrence, 'none') <> 'none'
     or new.recurrence_until is not null
     or not public.chore_occurs_on(template, new.due_date)
  then
    raise exception 'chore_owner_only' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.household_tasks_owner_guard() from public, anon, authenticated;
grant execute on function public.household_tasks_owner_guard() to service_role;

-- --- 6. Photos and records: kept 2 years after a repair closes (D3) ---------------
create or replace function public.repair_keep_cutoff()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select now() - interval '2 years';
$$;

revoke all on function public.repair_keep_cutoff() from public, anon, authenticated;
grant execute on function public.repair_keep_cutoff() to service_role;

-- 123's body, plus repairs: a visit's photos and a repair's own photo expire
-- 2 years after the repair closes, never while it is open; photos under
-- <household>/repairs/ that no repair points at are swept after a day.
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

-- Repairs closed more than 2 years ago go, once their photo is gone (the
-- photo clean-up at 20:00 UTC removes it first; a photo still there waits
-- for the next night, so nothing is left behind unreferenced). Their visits
-- keep their rows, with repair_id cleared, and follow the 30-day rule.
create or replace function public.prune_closed_repairs()
returns int
language plpgsql
set search_path = ''
as $$
declare
  removed int;
begin
  delete from public.repairs rp
   where rp.closed_at is not null
     and rp.closed_at < public.repair_keep_cutoff()
     and (
       rp.photo_url is null
       or public.photo_object_ref(rp.photo_url) is null
       or not exists (
         select 1 from storage.objects o
          where o.bucket_id = (public.photo_object_ref(rp.photo_url))[1]
            and o.name = (public.photo_object_ref(rp.photo_url))[2]
       )
     );
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.prune_closed_repairs() from public, anon, authenticated;
grant execute on function public.prune_closed_repairs() to service_role;

-- 20:30 UTC (03:30 in Jakarta), after the photo clean-up at 20:00.
select cron.unschedule('prune-closed-repairs')
where exists (select 1 from cron.job where jobname = 'prune-closed-repairs');

select cron.schedule('prune-closed-repairs', '30 20 * * *', $job$ select public.prune_closed_repairs(); $job$);

-- --- 7. The household export includes repairs (127's function, re-created) --------
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
