-- ============================================================================
-- 135 — Feedback ("Send feedback" / "Kirim masukan"; roadmap item 9)
-- ============================================================================
-- Owners and staff phones send a short note to the people who make Miamus:
-- what they'd like, what went wrong. The developer reads it in the database;
-- the evening and Sunday reviews hear real voices instead of guessing.
--
-- WHAT A ROW HOLDS
--   The message (required, up to 1,000 characters), an optional category
--   (idea / problem / other), and what the app attaches by itself: the
--   household, who sent it (created_by = the session's auth.uid(), always
--   stamped here; staff_id for a staff phone), the build it came from
--   (app_version, NEXT_PUBLIC_BUILD_ID) and the screen (page, a path with
--   only the app's own view parameters). Nothing about the device.
--
-- WHO MAY DO WHAT
--   Send: any session of the household (get_user_household_ids()) for that
--   household only, through the guard below:
--     * an owner (a household_members row) sends as themselves: staff_id is
--       cleared, created_by says who;
--     * a staff phone must name a person of this household who is still on
--       the roster and is not an admin's own profile (106), the same rule
--       work in a person's name follows (119, 130). A device_sessions row is
--       a phone, not a person (119): a shared kitchen phone serves several
--       staff, so the person is the one picked with their PIN on the phone.
--       The sign-in log (115) can't decide it: a new PIN is not logged and
--       the log is kept 30 days, so it would refuse real people.
--     * 20 per session per day, so a stuck button can't flood the table.
--   Read: owners of the household only (a household_members check, never
--   get_user_household_ids(), which includes every staff phone — AGENTS.md).
--   Staff phones read none, not even their own: one phone serves several
--   people.
--   Change or delete: nobody through the API. The household's deletion
--   (127) removes it with everything else.
--   Logged-out callers: nothing.
--
-- HOW LONG IT IS KEPT
--   2 years from when it was sent; a nightly job deletes older rows. No
--   photos, so nothing for the photo clean-up (Edge Function unchanged).
--
-- The household export (131's function, re-created) includes feedback.
--
-- Additive: one table, its policies, a guard trigger, two functions
-- (export_household_data re-created with the same signature and grants),
-- one cron job. The guard is SECURITY DEFINER (it counts rows a staff phone
-- can't read) and, like every function created or replaced here, revokes
-- EXECUTE from public and anon in this file.
-- ============================================================================

-- --- 1. The table -------------------------------------------------------------
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  message text not null,
  category text,
  staff_id uuid references public.staff_profiles (id) on delete set null,
  created_by uuid default auth.uid(),
  app_version text,
  page text,
  created_at timestamptz not null default now(),
  constraint feedback_message_length check (char_length(btrim(message)) between 1 and 1000),
  constraint feedback_category_check check (category is null or category in ('idea', 'problem', 'other')),
  constraint feedback_app_version_length check (app_version is null or char_length(app_version) <= 64),
  constraint feedback_page_length check (page is null or char_length(page) <= 200)
);

create index if not exists feedback_household_created_idx on public.feedback (household_id, created_at);
create index if not exists feedback_staff_id_idx on public.feedback (staff_id) where staff_id is not null;
create index if not exists feedback_created_by_idx on public.feedback (created_by, created_at);
create index if not exists feedback_created_at_idx on public.feedback (created_at);

-- --- 2. Row level security ------------------------------------------------------
alter table public.feedback enable row level security;

drop policy if exists "owner_select_feedback" on public.feedback;
create policy "owner_select_feedback" on public.feedback
  for select to authenticated
  using (exists (select 1 from public.household_members m
                  where m.user_id = (select auth.uid()) and m.household_id = feedback.household_id));

-- Owners and staff phones, for their own household; the guard decides who.
drop policy if exists "tenant_insert_feedback" on public.feedback;
create policy "tenant_insert_feedback" on public.feedback
  for insert to authenticated
  with check (household_id = any (public.get_user_household_ids()));

revoke all on table public.feedback from public, anon, authenticated;
grant select, insert on table public.feedback to authenticated;
grant select, insert, update, delete on table public.feedback to service_role;

-- --- 3. What the server decides, and who a staff phone may send as ---------------
create or replace function public.feedback_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  new.message := btrim(new.message);
  new.page := nullif(btrim(new.page), '');
  new.app_version := nullif(btrim(new.app_version), '');
  new.created_by := uid;
  new.created_at := now();

  -- No session (the service role, migrations): maintenance, trusted.
  if uid is null then
    return new;
  end if;

  if exists (select 1 from public.household_members m
              where m.user_id = uid and m.household_id = new.household_id) then
    -- An owner is themselves: created_by says who.
    new.staff_id := null;
  else
    -- A staff phone names the person on duty: this household's, still on
    -- the roster, and not an admin's own profile.
    if new.staff_id is null then
      raise exception 'feedback_staff_required' using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.staff_profiles s
       where s.id = new.staff_id
         and s.household_id = new.household_id
         and s.user_id is null
         and s.archived_at is null
    ) then
      raise exception 'feedback_not_this_staff' using errcode = '42501';
    end if;
  end if;

  if (select count(*) from public.feedback f
       where f.created_by = uid and f.created_at > now() - interval '1 day') >= 20 then
    raise exception 'feedback_daily_limit' using errcode = '54000';
  end if;
  return new;
end;
$$;

drop trigger if exists feedback_guard on public.feedback;
create trigger feedback_guard
  before insert on public.feedback
  for each row execute function public.feedback_guard();

revoke all on function public.feedback_guard() from public, anon, authenticated;

-- --- 4. Kept 2 years ---------------------------------------------------------------
create or replace function public.prune_old_feedback()
returns int
language plpgsql
set search_path = ''
as $$
declare
  removed int;
begin
  delete from public.feedback f where f.created_at < now() - interval '2 years';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.prune_old_feedback() from public, anon, authenticated;
grant execute on function public.prune_old_feedback() to service_role;

-- 20:40 UTC (03:40 in Jakarta), after the repairs clean-up at 20:30.
select cron.unschedule('prune-old-feedback')
where exists (select 1 from cron.job where jobname = 'prune-old-feedback');

select cron.schedule('prune-old-feedback', '40 20 * * *', $job$ select public.prune_old_feedback(); $job$);

-- --- 5. The export includes feedback (131's function, plus 'feedback') -------------
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
