-- Migration 127: "Download my household's data" and "Delete my household"
-- for admins (R7, docs/plan-household-data-rights.md).
--
-- * export_household_data(): everything a household has recorded, as one
--   JSON object, for its admins. Never PIN hashes, invite links, the house
--   code or push endpoints.
-- * Deletion is scheduled, not immediate: the founder schedules it with the
--   household's name, every admin can cancel for 7 days, then an hourly job
--   deletes the household and Postgres cascades the rest. The founder rule
--   matches remove_household_member (the founder can't be removed either).
-- * Photos can't be deleted from SQL (that orphans the bytes), so
--   orphaned_household_photos() lists the files of households that no
--   longer exist, and the nightly prune-task-photos Edge Function removes
--   them through the Storage API.
--
-- Every function is SECURITY DEFINER with an empty search_path, revoked from
-- public and anon, and granted only to the role that needs it (AGENTS.md).
-- Admin checks use caller_admin_household() (a household_members row), never
-- get_user_household_ids(), which also lets staff phones in.

-- ---------------------------------------------------------------------------
-- The schedule. One row per household; it goes with the household.
-- ---------------------------------------------------------------------------
create table if not exists public.household_deletions (
  household_id uuid primary key references public.households (id) on delete cascade,
  requested_by uuid references auth.users (id) on delete set null,
  requested_at timestamptz not null default now(),
  delete_after timestamptz not null
);

comment on table public.household_deletions is
  'Households their founder asked to delete (migration 127). Deleted by delete_scheduled_households() after delete_after; any admin can cancel before then.';

alter table public.household_deletions enable row level security;
-- No policies: only the functions below read or write it.
revoke all on table public.household_deletions from public, anon, authenticated;
grant select, insert, update, delete on table public.household_deletions to service_role;

-- "15 Nov" in the household's own words, for the push.
create or replace function public.household_deletion_date_label(p_at timestamptz, p_locale text)
returns text
language sql
immutable
set search_path = ''
as $$
  select extract(day from (p_at at time zone 'Asia/Jakarta'))::int || ' ' ||
         case when p_locale = 'id'
           then (array['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'])
                [extract(month from (p_at at time zone 'Asia/Jakarta'))::int]
           else (array['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'])
                [extract(month from (p_at at time zone 'Asia/Jakarta'))::int]
         end;
$$;

revoke all on function public.household_deletion_date_label(timestamptz, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Status, for the Household tab.
-- ---------------------------------------------------------------------------
create or replace function public.household_deletion_status()
returns table (
  household_name text,
  scheduled boolean,
  delete_after timestamptz,
  requested_by_me boolean,
  can_schedule boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
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

  return query
  select
    h.name,
    d.household_id is not null,
    d.delete_after,
    coalesce(d.requested_by = uid, false),
    -- The founder; or any admin once no founder is a member any more.
    h.owner_auth_id = uid
      or h.owner_auth_id is null
      or not exists (
        select 1 from public.household_members m
         where m.household_id = h.id and m.user_id = h.owner_auth_id
      )
  from public.households h
  left join public.household_deletions d on d.household_id = h.id
  where h.id = hh;
end;
$$;

revoke all on function public.household_deletion_status() from public, anon;
grant execute on function public.household_deletion_status() to authenticated;

-- ---------------------------------------------------------------------------
-- Schedule: the founder, with the household's name typed out.
-- ---------------------------------------------------------------------------
create or replace function public.schedule_household_deletion(p_confirm_name text)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  hh uuid := public.caller_admin_household();
  status record;
  existing timestamptz;
  due timestamptz := now() + interval '7 days';
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if hh is null then
    raise exception 'admins_only' using errcode = '42501';
  end if;

  select * into status from public.household_deletion_status();
  if not status.can_schedule then
    raise exception 'founder_only' using errcode = '42501';
  end if;
  if lower(btrim(coalesce(p_confirm_name, ''))) <> lower(btrim(status.household_name)) then
    raise exception 'name_mismatch' using errcode = '22023';
  end if;

  -- Asking twice keeps the first date: a second tap must not push it back.
  select d.delete_after into existing from public.household_deletions d where d.household_id = hh;
  if existing is not null then
    return existing;
  end if;

  insert into public.household_deletions (household_id, requested_by, delete_after)
  values (hh, uid, due);

  perform public.queue_owner_push(
    hh,
    'Household will be deleted',
    format('An admin asked to delete “%s” on %s. Open Household to cancel.',
           status.household_name, public.household_deletion_date_label(due, 'en')),
    'Rumah tangga akan dihapus',
    format('Admin meminta “%s” dihapus pada %s. Buka Rumah untuk membatalkan.',
           status.household_name, public.household_deletion_date_label(due, 'id')),
    '/dashboard?module=access&page=data',
    'household-deletion',
    uid
  );

  return due;
end;
$$;

revoke all on function public.schedule_household_deletion(text) from public, anon;
grant execute on function public.schedule_household_deletion(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Cancel: any admin.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_household_deletion()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  hh uuid := public.caller_admin_household();
  hh_name text;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if hh is null then
    raise exception 'admins_only' using errcode = '42501';
  end if;

  delete from public.household_deletions where household_id = hh;
  if not found then
    return false;
  end if;

  select h.name into hh_name from public.households h where h.id = hh;
  perform public.queue_owner_push(
    hh,
    'Household deletion cancelled',
    format('“%s” will stay. Nothing was deleted.', hh_name),
    'Penghapusan rumah tangga dibatalkan',
    format('“%s” tetap ada. Tidak ada yang dihapus.', hh_name),
    '/dashboard?module=access',
    'household-deletion',
    uid
  );
  return true;
end;
$$;

revoke all on function public.cancel_household_deletion() from public, anon;
grant execute on function public.cancel_household_deletion() to authenticated;

-- ---------------------------------------------------------------------------
-- The job: delete households past their date. Every household table
-- cascades from households (the 127 SQL test checks that stays true).
-- ---------------------------------------------------------------------------
create or replace function public.delete_scheduled_households()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.households h
   using public.household_deletions d
   where d.household_id = h.id
     and d.delete_after <= now();
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.delete_scheduled_households() from public, anon, authenticated;
grant execute on function public.delete_scheduled_households() to service_role;

select cron.unschedule('delete-scheduled-households')
where exists (select 1 from cron.job where jobname = 'delete-scheduled-households');

select cron.schedule('delete-scheduled-households', '5 * * * *', $job$ select public.delete_scheduled_households(); $job$);

-- ---------------------------------------------------------------------------
-- Photos of households that no longer exist, for prune-task-photos.
-- ---------------------------------------------------------------------------
create or replace function public.orphaned_household_photos(p_secret text, p_limit int default 100)
returns table (bucket_id text, name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_task_photo_retention_secret(p_secret);

  return query
  with candidates as (
    select o.bucket_id, o.name, o.created_at
    from storage.objects o
    where o.bucket_id in ('household-logs', 'inventory_audits')
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

-- ---------------------------------------------------------------------------
-- The download.
-- ---------------------------------------------------------------------------
create or replace function public.export_household_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
