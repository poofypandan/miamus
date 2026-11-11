-- ============================================================================
-- 149 — Walk-in repairs and supervising (Phase 174, PR A)
-- ============================================================================
-- docs/phase-174-repairs-walkin-plan.md; owner decisions (2026-11-11): A for
-- D1–D12. Built on 146 (staff writes owner-only on old tables,
-- is_household_admin), 147 and 148, in that order; nothing here depends on
-- 147 or 148 beyond the order.
--
-- A walk-in is a repair person who turned up unscheduled. Staff log it at
-- the gate (what, an optional name, a live-camera before photo) and close it
-- with Selesai (an after photo, an optional chip and note). It always
-- belongs to a repair (D2): an existing one, or a new staff report made in
-- the same step. Scheduled visits stay chores (130).
--
-- Whoever logs a walk-in supervises it until Selesai; "Ganti yang
-- mengawasi" hands it over (D11). Each person's stretch is kept, so a task
-- they missed meanwhile can explain itself on the owners' screens (D10 A:
-- the app reads the stretches at display time; nothing is written for the
-- staff).
--
-- NEW
--   repair_visits         the walk-ins. Server times (arrived_at, left_at)
--        stamped by the guard; the phone's (arrived_phone_at, left_phone_at)
--        kept for a save sent later, refused when more than 48 hours old or
--        in the future. Read by every session of the household. Staff
--        phones insert (an active staff profile of the household, on a
--        repair that isn't fixed or dismissed) and finish once; they may
--        take back their own walk-in within 5 minutes (Undo), and the phone
--        that sent Selesai may take it back within 5 minutes (finished_by). Owners edit any column but the stamped ones and
--        the before photo, and delete. Kept with the repair (D8): deleting
--        a repair cascades.
--   repair_supervision    who supervised which walk-in, from when to when.
--        Opened and closed by triggers only: inserting a walk-in opens its
--        logger's stretch, finishing it closes the open one, inserting a
--        stretch (the hand-over) closes the previous one at the same time.
--        One open stretch per visit and per person (supervision_busy).
--        Clients read and insert; no update or delete policy. Kept 90 days
--        (prune_old_repair_supervision + cron), like couldn't-do records.
--   task_exceptions       reason 'supervising_repair' (no note needed) and
--        repair_visit_id, a composite foreign key to repair_visits (so a
--        visit of another household can't be named), set null when the
--        visit goes.
--
-- RE-CREATED (each from its newest definition)
--   exception_reason_label (139)        the new reason, in both languages.
--   task_photos_due_for_pruning (139)   walk-in photos follow their repair:
--        kept while it is open and 2 years after it closes. Its repairs_due
--        pass (any file under <household>/repairs/ that no repair points at,
--        once a day old) now also skips any file a walk-in points at:
--        without it, every walk-in photo would be listed the night after it
--        was taken. Same signature, definer and grant (service_role).
--   orphaned_household_photos (139)     a walk-in's photos are live refs.
--   export_household_data (144)         includes walk-ins and stretches.
--
-- SECURITY. No client-callable SECURITY DEFINER function. The trigger
-- functions are definer with an empty search_path and EXECUTE revoked from
-- public, anon and authenticated (triggers fire without it). Admin-only
-- paths check is_household_admin() (146), never get_user_household_ids()
-- alone, which every staff phone passes. Every re-created definer function
-- repeats its revoke and grant.
--
-- Privacy policy and legal.ts change in the same PR: worker names and visit
-- times are new third-party data; supervising times are new staff data.
-- No new service.
-- ============================================================================

-- --- 1. Walk-ins -------------------------------------------------------------------------
create table if not exists public.repair_visits (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  repair_id uuid not null,
  worker_name text,
  logged_by_staff uuid references public.staff_profiles (id) on delete set null,
  created_by uuid default auth.uid(),
  arrived_at timestamptz not null default now(),
  arrived_phone_at timestamptz,
  before_photo_url text not null,
  left_at timestamptz,
  left_phone_at timestamptz,
  after_photo_url text,
  -- The session whose Selesai reached the server: only it may take it back.
  finished_by uuid,
  outcome text,
  note text,
  constraint repair_visits_id_household_key unique (id, household_id),
  constraint repair_visits_repair_fkey foreign key (repair_id, household_id)
    references public.repairs (id, household_id) on delete cascade,
  constraint repair_visits_worker_name_length
    check (worker_name is null or char_length(btrim(worker_name)) between 1 and 60),
  constraint repair_visits_note_length check (note is null or char_length(note) <= 300),
  constraint repair_visits_outcome_check check (outcome is null or outcome in ('fixed', 'come_back', 'check')),
  -- Finished means both: the server's leaving time and the after photo.
  constraint repair_visits_finish_shape check ((left_at is null) = (after_photo_url is null)),
  -- The chip and the note belong to Selesai.
  constraint repair_visits_finish_fields check (left_at is not null or (outcome is null and note is null and left_phone_at is null)),
  constraint repair_visits_times check (left_at is null or left_at >= arrived_at)
);

create index if not exists repair_visits_household_arrived_idx on public.repair_visits (household_id, arrived_at);
create index if not exists repair_visits_repair_idx on public.repair_visits (repair_id);
create index if not exists repair_visits_logged_by_staff_idx on public.repair_visits (logged_by_staff)
  where logged_by_staff is not null;
create index if not exists repair_visits_open_idx on public.repair_visits (household_id) where left_at is null;

alter table public.repair_visits enable row level security;
revoke all on table public.repair_visits from public, anon, authenticated;
grant select, insert, update, delete on table public.repair_visits to authenticated;
grant select, insert, update, delete on table public.repair_visits to service_role;

-- Every session of the household reads them, as repairs (130).
drop policy if exists "household_select_repair_visits" on public.repair_visits;
create policy "household_select_repair_visits" on public.repair_visits
  for select to authenticated using (household_id = any (public.get_user_household_ids()));

-- Owners and staff phones log a walk-in; the guard decides what it may say.
drop policy if exists "household_insert_repair_visits" on public.repair_visits;
create policy "household_insert_repair_visits" on public.repair_visits
  for insert to authenticated with check (household_id = any (public.get_user_household_ids()));

-- Staff phones finish (and take back a Selesai); the guard keeps them to
-- that. Owners edit.
drop policy if exists "household_update_repair_visits" on public.repair_visits;
create policy "household_update_repair_visits" on public.repair_visits
  for update to authenticated
  using (household_id = any (public.get_user_household_ids()))
  with check (household_id = any (public.get_user_household_ids()));

-- Owners; or the phone that logged it, within 5 minutes, before Selesai (Undo).
drop policy if exists "owner_or_recent_logger_delete_repair_visits" on public.repair_visits;
create policy "owner_or_recent_logger_delete_repair_visits" on public.repair_visits
  for delete to authenticated
  using (
    public.is_household_admin(household_id)
    or (
      household_id = any (public.get_user_household_ids())
      and created_by = (select auth.uid())
      and arrived_at > now() - interval '5 minutes'
      and left_at is null
    )
  );

-- --- 2. What a walk-in may say, and what the server decides ----------------------------
-- A walk-in's photo: the household's own folder for repairs, in household-logs.
create or replace function public.repair_visit_photo_ok(p_url text, p_household_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (public.photo_object_ref(p_url))[1] = 'household-logs'
    and public.storage_object_household((public.photo_object_ref(p_url))[2]) is not distinct from p_household_id
    and (public.photo_object_ref(p_url))[2] like p_household_id::text || '/repairs/%',
    false
  );
$$;

revoke all on function public.repair_visit_photo_ok(text, uuid) from public, anon, authenticated;
grant execute on function public.repair_visit_photo_ok(text, uuid) to service_role;

create or replace function public.repair_visits_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_admin boolean;
  repair_status text;
  finishing boolean;
  reopening boolean;
  staff_columns constant text[] := array['after_photo_url', 'left_phone_at', 'outcome', 'note', 'left_at', 'finished_by'];
begin
  -- A session of another household learns nothing here: refused before any
  -- check that reads this household's rows (the policy would refuse it too,
  -- but row triggers run before it).
  if auth.uid() is not null and not (new.household_id = any (public.get_user_household_ids())) then
    raise exception 'repair_visit_household' using errcode = '42501';
  end if;
  -- No session (the service role, cron, migrations): maintenance, trusted.
  is_admin := auth.uid() is null or public.is_household_admin(new.household_id);
  new.worker_name := nullif(btrim(new.worker_name), '');
  new.note := nullif(btrim(new.note), '');

  if tg_op = 'INSERT' then
    -- A resend of a walk-in that already landed: let the primary key say
    -- "already saved" (23505), whatever has changed since.
    if exists (select 1 from public.repair_visits v where v.id = new.id) then
      return new;
    end if;
    new.created_by := auth.uid();
    new.arrived_at := now();
    -- A walk-in starts open: Selesai is its own save.
    new.left_at := null;
    new.left_phone_at := null;
    new.after_photo_url := null;
    new.finished_by := null;
    new.outcome := null;
    new.note := null;
    if new.arrived_phone_at is not null
       and (new.arrived_phone_at > now() + interval '5 minutes' or new.arrived_phone_at < now() - interval '48 hours') then
      raise exception 'repair_visit_phone_time' using errcode = '22023';
    end if;

    select r.status into repair_status
      from public.repairs r
     where r.id = new.repair_id and r.household_id = new.household_id;
    if not found then
      raise exception 'repair_visit_repair' using errcode = '42501';
    end if;
    if repair_status in ('fixed', 'dismissed') then
      raise exception 'repair_visit_closed' using errcode = '23514';
    end if;

    if auth.uid() is not null then
      if not is_admin then
        -- A staff phone names the staff member holding it: an active staff
        -- profile of this household (119's rule), never an admin's row.
        if new.logged_by_staff is null or not exists (
          select 1 from public.staff_profiles s
           where s.id = new.logged_by_staff and s.household_id = new.household_id and s.user_id is null
        ) then
          raise exception 'repair_visit_staff' using errcode = '42501';
        end if;
        if public.is_archived_staff(new.logged_by_staff) then
          raise exception 'staff_archived' using errcode = '42501',
            hint = 'This person was removed from the household; work is no longer recorded in their name.';
        end if;
      elsif new.logged_by_staff is not null and not exists (
        -- An owner logs as themself: their own roster row (106), or none.
        select 1 from public.staff_profiles s
         where s.id = new.logged_by_staff and s.household_id = new.household_id and s.user_id = auth.uid()
           and s.archived_at is null
      ) then
        raise exception 'repair_visit_staff' using errcode = '42501';
      end if;
    end if;

    if not public.repair_visit_photo_ok(new.before_photo_url, new.household_id) then
      raise exception 'repair_visit_photo' using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE ------------------------------------------------------------------------------
  -- Stamped, or the evidence: nobody changes them.
  if (new.id, new.household_id, new.repair_id, new.created_by, new.arrived_at, new.arrived_phone_at,
      new.logged_by_staff, new.before_photo_url)
     is distinct from
     (old.id, old.household_id, old.repair_id, old.created_by, old.arrived_at, old.arrived_phone_at,
      old.logged_by_staff, old.before_photo_url) then
    raise exception 'repair_visit_fixed_fields' using errcode = '42501';
  end if;

  finishing := old.after_photo_url is null and new.after_photo_url is not null;
  reopening := old.after_photo_url is not null and new.after_photo_url is null;

  if not is_admin then
    -- A staff phone: Selesai, or taking it back, and nothing else.
    if (to_jsonb(new) - staff_columns) is distinct from (to_jsonb(old) - staff_columns) then
      raise exception 'repair_visit_staff_finish_only' using errcode = '42501';
    end if;
    if old.after_photo_url is not null then
      if reopening then
        -- Batalkan: the phone that sent Selesai, within 5 minutes of it
        -- reaching the server.
        if old.left_at < now() - interval '5 minutes' or old.finished_by is distinct from auth.uid() then
          raise exception 'repair_visit_finished' using errcode = '23514';
        end if;
      elsif new.after_photo_url = old.after_photo_url
            and (new.outcome, new.note, new.left_phone_at) is not distinct from (old.outcome, old.note, old.left_phone_at) then
        -- The same Selesai sent again (the save queue): nothing changes.
        new.left_at := old.left_at;
        new.finished_by := old.finished_by;
        return new;
      else
        raise exception 'repair_visit_finished' using errcode = '23514';
      end if;
    elsif new.after_photo_url is null then
      raise exception 'repair_visit_finish_photo' using errcode = '23514';
    end if;
  end if;

  if finishing then
    if not public.repair_visit_photo_ok(new.after_photo_url, new.household_id) then
      raise exception 'repair_visit_photo' using errcode = '42501';
    end if;
    if new.left_phone_at is not null
       and (new.left_phone_at > now() + interval '5 minutes' or new.left_phone_at < now() - interval '48 hours') then
      raise exception 'repair_visit_phone_time' using errcode = '22023';
    end if;
    new.left_at := now();
    new.finished_by := auth.uid();
  elsif reopening then
    new.left_at := null;
    new.finished_by := null;
    new.left_phone_at := null;
    new.outcome := null;
    new.note := null;
  else
    -- An owner's edit of a finished walk-in (the chip, the note, the name,
    -- a better after photo): the times stay.
    new.left_at := old.left_at;
    new.left_phone_at := old.left_phone_at;
    new.finished_by := old.finished_by;
    if new.after_photo_url is distinct from old.after_photo_url
       and not public.repair_visit_photo_ok(new.after_photo_url, new.household_id) then
      raise exception 'repair_visit_photo' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.repair_visits_guard() from public, anon, authenticated;
grant execute on function public.repair_visits_guard() to service_role;

drop trigger if exists repair_visits_guard on public.repair_visits;
create trigger repair_visits_guard
  before insert or update on public.repair_visits
  for each row execute function public.repair_visits_guard();

-- --- 3. Supervising ----------------------------------------------------------------------
create table if not exists public.repair_supervision (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  visit_id uuid not null,
  staff_id uuid references public.staff_profiles (id) on delete set null,
  -- An owner with no roster row (every admin has one since 106; kept for safety).
  user_id uuid,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint repair_supervision_visit_fkey foreign key (visit_id, household_id)
    references public.repair_visits (id, household_id) on delete cascade,
  constraint repair_supervision_times check (ended_at is null or ended_at >= started_at)
);

-- One open stretch per visit, and per person.
create unique index if not exists repair_supervision_open_visit_key
  on public.repair_supervision (visit_id) where ended_at is null;
create unique index if not exists repair_supervision_open_staff_key
  on public.repair_supervision (staff_id) where ended_at is null and staff_id is not null;
create index if not exists repair_supervision_household_started_idx on public.repair_supervision (household_id, started_at);
create index if not exists repair_supervision_visit_idx on public.repair_supervision (visit_id);
create index if not exists repair_supervision_staff_idx on public.repair_supervision (staff_id) where staff_id is not null;
create index if not exists repair_supervision_ended_idx on public.repair_supervision (ended_at) where ended_at is not null;

alter table public.repair_supervision enable row level security;
revoke all on table public.repair_supervision from public, anon, authenticated;
-- No update or delete for clients: only the triggers below change ended_at.
grant select, insert on table public.repair_supervision to authenticated;
grant select, insert, update, delete on table public.repair_supervision to service_role;

drop policy if exists "household_select_repair_supervision" on public.repair_supervision;
create policy "household_select_repair_supervision" on public.repair_supervision
  for select to authenticated using (household_id = any (public.get_user_household_ids()));

drop policy if exists "household_insert_repair_supervision" on public.repair_supervision;
create policy "household_insert_repair_supervision" on public.repair_supervision
  for insert to authenticated with check (household_id = any (public.get_user_household_ids()));

-- A new stretch: the person is checked, the server sets the time, and the
-- visit's previous stretch closes at that same time (the hand-over).
create or replace function public.repair_supervision_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  visit public.repair_visits;
  -- A phone's own insert fires this at depth 1; the stretch a walk-in opens
  -- (repair_visits_supervision) at depth 2. current_user can't tell them
  -- apart inside a definer function.
  from_client boolean := pg_trigger_depth() = 1 and auth.uid() is not null;
begin
  -- Another household's session learns nothing (as repair_visits_guard).
  if auth.uid() is not null and not (new.household_id = any (public.get_user_household_ids())) then
    raise exception 'supervision_household' using errcode = '42501';
  end if;
  -- A resend of a hand-over that already landed: the primary key answers.
  if exists (select 1 from public.repair_supervision s where s.id = new.id) then
    return new;
  end if;
  new.started_at := now();
  new.ended_at := null;

  select * into visit from public.repair_visits v
   where v.id = new.visit_id and v.household_id = new.household_id;
  if not found then
    raise exception 'supervision_visit' using errcode = '42501';
  end if;
  if visit.after_photo_url is not null then
    raise exception 'supervision_visit_finished' using errcode = '23514';
  end if;

  if (new.staff_id is null) = (new.user_id is null) then
    raise exception 'supervision_person' using errcode = '23514';
  end if;
  if new.staff_id is not null and not exists (
    select 1 from public.staff_profiles s
     where s.id = new.staff_id and s.household_id = new.household_id and s.archived_at is null
  ) then
    raise exception 'supervision_person' using errcode = '42501';
  end if;
  if new.user_id is not null then
    if not exists (
      select 1 from public.household_members m where m.user_id = new.user_id and m.household_id = new.household_id
    ) then
      raise exception 'supervision_person' using errcode = '42501';
    end if;
    -- From a phone, an owner takes over only as themself.
    if from_client and new.user_id is distinct from auth.uid() then
      raise exception 'supervision_person' using errcode = '42501';
    end if;
  end if;

  -- One walk-in at a time per person: hand the other over or finish it.
  if new.staff_id is not null and exists (
    select 1 from public.repair_supervision s
     where s.staff_id = new.staff_id and s.ended_at is null and s.visit_id <> new.visit_id
  ) then
    raise exception 'supervision_busy' using errcode = '23514';
  end if;
  -- Handing over to the person already holding it changes nothing.
  if exists (
    select 1 from public.repair_supervision s
     where s.visit_id = new.visit_id and s.ended_at is null
       and ((new.staff_id is not null and s.staff_id = new.staff_id)
            or (new.user_id is not null and s.user_id = new.user_id))
  ) then
    raise exception 'supervision_same' using errcode = '23514';
  end if;

  update public.repair_supervision s
     set ended_at = now()
   where s.visit_id = new.visit_id and s.ended_at is null;
  return new;
end;
$$;

revoke all on function public.repair_supervision_guard() from public, anon, authenticated;
grant execute on function public.repair_supervision_guard() to service_role;

drop trigger if exists repair_supervision_guard on public.repair_supervision;
create trigger repair_supervision_guard
  before insert on public.repair_supervision
  for each row execute function public.repair_supervision_guard();

-- A walk-in opens its logger's stretch; Selesai closes the open one; taking
-- Selesai back reopens the stretch it closed.
create or replace function public.repair_visits_supervision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  last_id uuid;
begin
  if tg_op = 'INSERT' then
    if new.logged_by_staff is not null then
      insert into public.repair_supervision (household_id, visit_id, staff_id)
      values (new.household_id, new.id, new.logged_by_staff);
    elsif auth.uid() is not null and public.is_household_admin(new.household_id) then
      insert into public.repair_supervision (household_id, visit_id, user_id)
      values (new.household_id, new.id, auth.uid());
    end if;
    return new;
  end if;

  if old.after_photo_url is null and new.after_photo_url is not null then
    update public.repair_supervision s
       set ended_at = new.left_at
     where s.visit_id = new.id and s.ended_at is null;
  elsif old.after_photo_url is not null and new.after_photo_url is null then
    select s.id into last_id
      from public.repair_supervision s
     where s.visit_id = new.id and s.ended_at = old.left_at
     order by s.started_at desc
     limit 1;
    if last_id is not null then
      -- The person may have started another walk-in meanwhile: then the
      -- one-open-per-person index refuses, and so does the Undo.
      update public.repair_supervision s set ended_at = null where s.id = last_id;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.repair_visits_supervision() from public, anon, authenticated;
grant execute on function public.repair_visits_supervision() to service_role;

drop trigger if exists repair_visits_supervision on public.repair_visits;
create trigger repair_visits_supervision
  after insert or update of after_photo_url on public.repair_visits
  for each row execute function public.repair_visits_supervision();

-- Stretches older than 90 days go (they explain a day's work, not a record
-- of staff time). An open one stays while its walk-in is open.
create or replace function public.prune_old_repair_supervision()
returns int
language plpgsql
set search_path = ''
as $$
declare
  removed int;
begin
  delete from public.repair_supervision where ended_at < now() - interval '90 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function public.prune_old_repair_supervision() from public, anon, authenticated;
grant execute on function public.prune_old_repair_supervision() to service_role;

-- 19:58 UTC (02:58 in Jakarta), beside the other nightly prunes.
select cron.unschedule('prune-old-repair-supervision')
where exists (select 1 from cron.job where jobname = 'prune-old-repair-supervision');
select cron.schedule('prune-old-repair-supervision', '58 19 * * *', $job$ select public.prune_old_repair_supervision(); $job$);

-- --- 4. "Mengawasi perbaikan" as a couldn't-do reason (D10) -------------------------------
alter table public.task_exceptions add column if not exists repair_visit_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'task_exceptions_repair_visit_fkey') then
    alter table public.task_exceptions
      add constraint task_exceptions_repair_visit_fkey foreign key (repair_visit_id, household_id)
      references public.repair_visits (id, household_id) on delete set null (repair_visit_id);
  end if;
end;
$$;

create index if not exists task_exceptions_repair_visit_idx on public.task_exceptions (repair_visit_id)
  where repair_visit_id is not null;

alter table public.task_exceptions drop constraint if exists task_exceptions_reason_check;
alter table public.task_exceptions add constraint task_exceptions_reason_check
  check (reason in ('out_of_stock', 'pet_refused', 'done_by_other', 'other', 'supervising_repair'));
-- A visit is named only by this reason.
alter table public.task_exceptions drop constraint if exists task_exceptions_visit_reason;
alter table public.task_exceptions add constraint task_exceptions_visit_reason
  check (repair_visit_id is null or reason = 'supervising_repair');

-- 139's labels, with the new reason.
create or replace function public.exception_reason_label(p_reason text, p_refused_medicine boolean, p_locale text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_reason
    when 'out_of_stock' then case when p_locale = 'id' then 'barang habis' else 'out of stock' end
    when 'pet_refused' then case
      when p_refused_medicine then case when p_locale = 'id' then 'tidak mau minum obat' else 'wouldn''t take medicine' end
      else case when p_locale = 'id' then 'tidak mau makan' else 'wouldn''t eat' end end
    when 'done_by_other' then case when p_locale = 'id' then 'sudah dikerjakan orang lain' else 'done by someone else' end
    when 'other' then case when p_locale = 'id' then 'lainnya' else 'other' end
    when 'supervising_repair' then case when p_locale = 'id' then 'mengawasi perbaikan' else 'supervising a repair' end
  end;
$$;
revoke all on function public.exception_reason_label(text, boolean, text) from public, anon, authenticated;
grant execute on function public.exception_reason_label(text, boolean, text) to service_role;

-- --- 5. Photos: kept with the repair (D8) ----------------------------------------------------
-- 139's body, plus walk-ins: their photos are kept while the repair is open
-- and listed 2 years after it closes, and the repairs_due pass never lists
-- a file a walk-in points at.
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
    union all
    -- A walk-in's before and after (migrations/149): kept as long as its repair.
    select public.photo_object_ref(u), coalesce(rp.closed_at < repair_cutoff, false)
    from public.repair_visits v
    join public.repairs rp on rp.id = v.repair_id
    cross join lateral unnest(array[v.before_photo_url, v.after_photo_url]) as u
    where u is not null
    union all
    -- A couldn't-do photo (migrations/139): 30 days, like proof photos.
    select public.photo_object_ref(x.photo_url), x.created_at < cutoff
    from public.task_exceptions x
    where x.photo_url is not null
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
  -- Photos under <household>/repairs/ that no repair and no walk-in points
  -- at any more — a repair deleted while the Storage delete failed, or an
  -- abandoned report's upload — once over a day old, like food's. A walk-in
  -- photo is never listed here: it is the repair's, and goes with it
  -- through task_due (migrations/149).
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
      and not exists (
        select 1 from public.repair_visits v
         cross join lateral unnest(array[v.before_photo_url, v.after_photo_url]) as u
         where u is not null
           and (public.photo_object_ref(u))[1] = 'household-logs'
           and (public.photo_object_ref(u))[2] = o.name
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

-- 139's body, with walk-in photos as live references.
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
      select x.photo_url from public.task_exceptions x
      union all
      select unnest(array[v.before_photo_url, v.after_photo_url]) from public.repair_visits v
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

-- --- 6. The export (144's body, plus walk-ins and supervising) -------------------------------
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
