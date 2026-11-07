-- ============================================================================
-- 123 — Food at home, by hand (Phase 156, step 1)
-- ============================================================================
-- docs/phase-156-step1-food-plan.md (approved 2026-11-07). Indonesian homes
-- receive a lot of food — hantaran, parcel, oleh-oleh, nasi kotak, kue
-- Lebaran — and it gets forgotten. The household lists it by hand: what it
-- is, an optional photo, where it is kept, when it expires (or no date), who
-- gave it, and whether their container goes back. When it is finished it is
-- marked eaten, given away or thrown away. No AI here; that comes later.
--
-- WHO MAY DO WHAT
--   Read, add, edit, finish, mark the container returned: any session of the
--   household — owners and staff phones alike (get_user_household_ids()).
--   Food is everybody's job in the kitchen.
--   Delete (for something added by mistake): admins only. The policy asks
--   caller_admin_household() — never get_user_household_ids() alone, which
--   includes every staff phone (AGENTS.md).
--   Staff phones cannot move a row to another household: the update policy's
--   WITH CHECK only accepts their own household.
--
-- WHAT THE SERVER DECIDES, NOT THE PHONE
--   created_by            the session that added it (auth.uid()).
--   finished_at           stamped when an outcome is set; cleared on undo,
--                         together with finished_by.
--   container_returned_at stamped with the server's clock when ticked.
--   added_by/finished_by  must be this household's people, and not someone
--                         who has been removed (119's rule).
--
-- PHOTOS (household-logs bucket, <household>/food/...)
--   Kept while the food is on the list. The app removes the photo through
--   the Storage API the moment the food is finished or deleted. Safety net:
--   the nightly clean-up from migrations/101–102 now also lists any object
--   under <household>/food/ that is more than a day old and that no listed
--   food (or food finished less than a day ago) points at — a delete that
--   failed for lack of signal, an abandoned form's upload. Only its two SQL
--   functions change; the Edge Function and its secret are untouched.
--
-- STAFF RECEIVE THE FOOD (owner, 2026-11-07)
--   A photo is enough: the name may be left empty when there is a photo
--   (the app shows "Food" / "Makanan"). "Don't know" is an answer for the
--   expiry (expiry_unknown): owners see "Check the date" until one is set.
--   Where it came from (source): cooked at home (leftovers), from someone,
--   or bought. When a staff phone adds food, the household's owners get a
--   push in their own language (notify_food_from_staff, same path as 114's
--   sick-report alert: composed here, so no phone can make it say anything).
--
-- HOW LONG ROWS ARE KEPT
--   Finished food stays 90 days without its photo (for a later "what got
--   eaten, given away, wasted" view), then a nightly job deletes it.
--
-- Additive: one table, its policies and triggers, five functions (two of them
-- replaced), one cron job. No SECURITY DEFINER function a client can call.
-- ============================================================================

-- --- 1. The table ------------------------------------------------------------
create table if not exists public.food_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text,
  photo_url text,
  kept_in text not null default 'fridge',
  expires_on date,
  expiry_unknown boolean not null default false,
  source text,
  from_whom text,
  return_container boolean not null default false,
  container_returned_at timestamptz,
  notes text,
  added_by uuid references public.staff_profiles (id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  outcome text,
  finished_at timestamptz,
  finished_by uuid references public.staff_profiles (id) on delete set null,
  constraint food_items_name_length check (name is null or char_length(btrim(name)) between 1 and 80),
  constraint food_items_source_check check (source is null or source in ('home', 'gift', 'bought')),
  constraint food_items_kept_in_check check (kept_in in ('fridge', 'freezer', 'pantry', 'counter')),
  constraint food_items_from_whom_length check (from_whom is null or char_length(from_whom) <= 60),
  constraint food_items_notes_length check (notes is null or char_length(notes) <= 200),
  constraint food_items_outcome_check check (outcome is null or outcome in ('eaten', 'given_away', 'thrown_away'))
);

create index if not exists food_items_household_idx on public.food_items (household_id, finished_at);
create index if not exists food_items_added_by_idx on public.food_items (added_by);
create index if not exists food_items_finished_by_idx on public.food_items (finished_by);

-- --- 2. Row level security -----------------------------------------------------
alter table public.food_items enable row level security;

drop policy if exists "tenant_select_food_items" on public.food_items;
create policy "tenant_select_food_items" on public.food_items
  for select to authenticated using (household_id = any (public.get_user_household_ids()));

drop policy if exists "tenant_insert_food_items" on public.food_items;
create policy "tenant_insert_food_items" on public.food_items
  for insert to authenticated with check (household_id = any (public.get_user_household_ids()));

drop policy if exists "tenant_update_food_items" on public.food_items;
create policy "tenant_update_food_items" on public.food_items
  for update to authenticated
  using (household_id = any (public.get_user_household_ids()))
  with check (household_id = any (public.get_user_household_ids()));

-- Admins only: a staff phone holds the `authenticated` role too.
drop policy if exists "admin_delete_food_items" on public.food_items;
create policy "admin_delete_food_items" on public.food_items
  for delete to authenticated using (household_id = public.caller_admin_household());

-- PostgREST reaches the table through these grants; RLS decides the rows.
revoke all on table public.food_items from anon;
grant select, insert, update, delete on table public.food_items to authenticated;

-- --- 3. What the server decides --------------------------------------------------
create or replace function public.food_items_server_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
    new.container_returned_at := null;
    if new.outcome is not null then
      new.finished_at := now();
    else
      new.finished_at := null;
      new.finished_by := null;
    end if;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if new.outcome is distinct from old.outcome then
      if new.outcome is null then
        new.finished_at := null;
        new.finished_by := null;
      else
        new.finished_at := now();
      end if;
    else
      new.finished_at := old.finished_at;
    end if;
    if new.container_returned_at is distinct from old.container_returned_at then
      new.container_returned_at := case when new.container_returned_at is null then null else now() end;
    end if;
  end if;
  new.updated_at := now();
  new.name := nullif(btrim(new.name), '');
  -- A name or a photo: one of them says what it is.
  if tg_op = 'INSERT' and new.name is null and new.photo_url is null then
    raise exception 'food_needs_name_or_photo' using errcode = '23514';
  end if;
  -- A date, once known, answers "don't know".
  if new.expires_on is not null then
    new.expiry_unknown := false;
  end if;
  return new;
end;
$$;

drop trigger if exists food_items_server_fields on public.food_items;
create trigger food_items_server_fields
  before insert or update on public.food_items
  for each row execute function public.food_items_server_fields();

-- The people named on a row are this household's, and still on the roster.
-- Applies to client sessions only (current_user 'authenticated'), like 119:
-- the archive function itself and maintenance run as other roles.
create or replace function public.food_items_check_people()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if new.added_by is not null
     and (tg_op = 'INSERT' or new.added_by is distinct from old.added_by) then
    if not exists (select 1 from public.staff_profiles s
                    where s.id = new.added_by and s.household_id = new.household_id) then
      raise exception 'staff_not_in_household' using errcode = '42501';
    end if;
    if public.is_archived_staff(new.added_by) then
      raise exception 'staff_archived' using errcode = '42501',
        hint = 'This person was removed from the household; work is no longer recorded in their name.';
    end if;
  end if;
  if new.finished_by is not null
     and (tg_op = 'INSERT' or new.finished_by is distinct from old.finished_by) then
    if not exists (select 1 from public.staff_profiles s
                    where s.id = new.finished_by and s.household_id = new.household_id) then
      raise exception 'staff_not_in_household' using errcode = '42501';
    end if;
    if public.is_archived_staff(new.finished_by) then
      raise exception 'staff_archived' using errcode = '42501',
        hint = 'This person was removed from the household; work is no longer recorded in their name.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists food_items_check_people on public.food_items;
create trigger food_items_check_people
  before insert or update of added_by, finished_by, household_id on public.food_items
  for each row execute function public.food_items_check_people();

-- Trigger functions are never called directly.
revoke all on function public.food_items_server_fields() from public, anon, authenticated;
revoke all on function public.food_items_check_people() from public, anon, authenticated;

-- --- 3b. Owners hear when staff log food ------------------------------------------
-- After insert, from a staff phone only: a session that is a member of the
-- household is an owner, who knows what they just added. Bilingual through
-- 114's queue_owner_push; never blocks the insert.
create or replace function public.notify_food_from_staff()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  staff_name text;
  days int;
  place_en text;
  place_id text;
  what_en text;
  what_id text;
  when_en text;
  when_id text;
  message_en text;
  message_id text;
begin
  if exists (select 1 from public.household_members m
              where m.user_id = auth.uid() and m.household_id = new.household_id) then
    return new;
  end if;

  begin
    if new.added_by is not null then
      select s.name into staff_name from public.staff_profiles s where s.id = new.added_by;
    end if;

    place_en := case new.kept_in when 'fridge' then 'in the fridge' when 'freezer' then 'in the freezer'
                                 when 'pantry' then 'in the cupboard' else 'on the counter' end;
    place_id := case new.kept_in when 'fridge' then 'di kulkas' when 'freezer' then 'di freezer'
                                 when 'pantry' then 'di lemari' else 'di meja' end;
    what_en := coalesce(new.name, 'Food (photo)') || coalesce(' from ' || new.from_whom, '');
    what_id := coalesce(new.name, 'Makanan (foto)') || coalesce(' dari ' || new.from_whom, '');

    if new.expires_on is not null then
      days := new.expires_on - (now() at time zone 'Asia/Jakarta')::date;
      when_en := case when days < 0 then 'already past its date'
                      when days = 0 then 'expires today'
                      when days = 1 then 'expires tomorrow'
                      else 'expires in ' || days || ' days' end;
      when_id := case when days < 0 then 'sudah lewat tanggal'
                      when days = 0 then 'kedaluwarsa hari ini'
                      when days = 1 then 'kedaluwarsa besok'
                      else 'kedaluwarsa ' || days || ' hari lagi' end;
    elsif new.expiry_unknown then
      when_en := 'check the date';
      when_id := 'cek tanggalnya';
    end if;

    message_en := coalesce(staff_name || ': ', '') || what_en || ', ' || place_en || coalesce(', ' || when_en, '') || '.';
    message_id := coalesce(staff_name || ': ', '') || what_id || ', ' || place_id || coalesce(', ' || when_id, '') || '.';

    perform public.queue_owner_push(
      new.household_id,
      'Food came in', message_en,
      'Makanan masuk', message_id,
      '/dashboard?module=inventory', 'food-' || new.id::text,
      auth.uid()
    );
  exception when others then
    raise warning 'Food push not queued for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists food_items_notify_owners on public.food_items;
create trigger food_items_notify_owners
  after insert on public.food_items
  for each row execute function public.notify_food_from_staff();

revoke all on function public.notify_food_from_staff() from public, anon, authenticated;

-- --- 4. Photo clean-up, extended to food (replaces 101's two functions) ---------
-- A food photo is due when it is under <household>/food/, over a day old,
-- and no food row that is still listed — or was finished less than a day ago
-- — points at it. "Over a day old" spares an upload whose row is still being
-- saved; "less than a day ago" spares an Undo.
create or replace function public.food_photo_keep_cutoff()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select now() - interval '1 day';
$$;

revoke all on function public.food_photo_keep_cutoff() from public, anon, authenticated;
grant execute on function public.food_photo_keep_cutoff() to service_role;

-- 101's body unchanged, plus the food objects (union all, then one order and
-- one limit), so the Edge Function needs no change.
create or replace function public.task_photos_due_for_pruning(p_secret text, p_limit int default 100)
returns table (name text, size bigint, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  cutoff timestamptz := public.task_photo_retention_cutoff();
  food_cutoff timestamptz := public.food_photo_keep_cutoff();
begin
  perform public.assert_task_photo_retention_secret(p_secret);

  return query
  with refs as (
    select public.photo_object_ref(l.photo_url) as r, l.completed_at < cutoff as expired
    from public.task_logs l
    where l.photo_url is not null
    union all
    select public.photo_object_ref(u), coalesce(t.completed_at < cutoff, false)
    from public.household_tasks t,
         unnest(array[t.photo_url, t.before_photo_url, t.after_photo_url]) as u
    where u is not null
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
  task_due as (
    select o.name, (o.metadata->>'size')::bigint as size, o.created_at
    from due d
    join storage.objects o on o.bucket_id = 'household-logs' and o.name = d.object_name
    where not exists (
      select 1 from permanent pm
      where pm.r is not null and pm.r[1] = 'household-logs' and pm.r[2] = d.object_name
    )
  ),
  food_kept as (
    select (public.photo_object_ref(f.photo_url))[2] as object_name
    from public.food_items f
    where f.photo_url is not null
      and (f.finished_at is null or f.finished_at >= food_cutoff)
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
  )
  select x.name, x.size, x.created_at
  from (select * from task_due union all select * from food_due) x
  order by x.created_at
  limit greatest(p_limit, 0);
end;
$$;

create or replace function public.forget_missing_task_photos(p_secret text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  cutoff timestamptz := public.task_photo_retention_cutoff();
  food_cutoff timestamptz := public.food_photo_keep_cutoff();
  logs_cleared int;
  tasks_cleared int;
  food_cleared int;
begin
  perform public.assert_task_photo_retention_secret(p_secret);

  update public.task_logs l
  set photo_url = null
  where l.completed_at < cutoff
    and (public.photo_object_ref(l.photo_url))[1] = 'household-logs'
    and not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'household-logs'
        and o.name = (public.photo_object_ref(l.photo_url))[2]
    );
  get diagnostics logs_cleared = row_count;

  -- One pass per column would be three scans; this nulls whichever of the
  -- three point at a missing object and leaves the rest as they are.
  update public.household_tasks t
  set photo_url = case when public.photo_object_ref(t.photo_url) is not null
                        and not exists (select 1 from storage.objects o where o.bucket_id = 'household-logs'
                                        and o.name = (public.photo_object_ref(t.photo_url))[2])
                       then null else t.photo_url end,
      before_photo_url = case when public.photo_object_ref(t.before_photo_url) is not null
                        and not exists (select 1 from storage.objects o where o.bucket_id = 'household-logs'
                                        and o.name = (public.photo_object_ref(t.before_photo_url))[2])
                       then null else t.before_photo_url end,
      after_photo_url = case when public.photo_object_ref(t.after_photo_url) is not null
                        and not exists (select 1 from storage.objects o where o.bucket_id = 'household-logs'
                                        and o.name = (public.photo_object_ref(t.after_photo_url))[2])
                       then null else t.after_photo_url end
  where t.completed_at < cutoff
    and exists (
      select 1
      from unnest(array[t.photo_url, t.before_photo_url, t.after_photo_url]) u
      where (public.photo_object_ref(u))[1] = 'household-logs'
        and not exists (select 1 from storage.objects o where o.bucket_id = 'household-logs'
                        and o.name = (public.photo_object_ref(u))[2])
    );
  get diagnostics tasks_cleared = row_count;

  -- Finished food whose photo is gone. Listed food is never touched, even if
  -- its object went missing some other way.
  update public.food_items f
  set photo_url = null
  where f.finished_at < food_cutoff
    and (public.photo_object_ref(f.photo_url))[1] = 'household-logs'
    and not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'household-logs'
        and o.name = (public.photo_object_ref(f.photo_url))[2]
    );
  get diagnostics food_cleared = row_count;

  return logs_cleared + tasks_cleared + food_cleared;
end;
$$;

-- As in 101: none of these is for a client.
revoke all on function public.task_photos_due_for_pruning(text, int) from public, anon, authenticated;
revoke all on function public.forget_missing_task_photos(text) from public, anon, authenticated;
grant execute on function public.task_photos_due_for_pruning(text, int) to service_role;
grant execute on function public.forget_missing_task_photos(text) to service_role;

-- --- 5. Finished food is forgotten after 90 days ----------------------------------
create or replace function public.prune_finished_food()
returns int
language plpgsql
set search_path = ''
as $$
declare
  removed int;
begin
  delete from public.food_items
   where finished_at is not null
     and finished_at < now() - interval '90 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.prune_finished_food() from public, anon, authenticated;
grant execute on function public.prune_finished_food() to service_role;

-- 20:15 UTC (03:15 in Jakarta), just after the photo clean-up at 20:00.
select cron.unschedule('prune-finished-food')
where exists (select 1 from cron.job where jobname = 'prune-finished-food');

select cron.schedule('prune-finished-food', '15 20 * * *', $job$ select public.prune_finished_food(); $job$);
