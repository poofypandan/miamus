-- ============================================================================
-- 145 — Features you switch on (Phase 171, PR A)
-- ============================================================================
-- docs/phase-171-features-plan.md; owner decisions (2026-11-10): A for
-- D1–D15. Household → Features switches the modules that exist (Repairs,
-- Bills and upkeep, Food at home; Pets stays households.has_pets, 133).
-- Off hides, never deletes: a switched-off feature's pill, Today lines,
-- staff buttons, Kakak tool and pushes go; its data stays and comes back
-- with the switch.
--
-- Numbered 145: the next free number above main (143) once PR #85 holds 144.
--
-- NEW
--   household_features            one row per household and feature that an
--        owner has switched; NO ROW = the feature's default, which is ON for
--        all three, so no household loses anything on deploy and nothing is
--        backfilled. Read by owners and the household's staff phones (a
--        switch isn't personal data, and staff phones must know what to
--        hide); written only by set_household_feature().
--   household_feature_defaults()  the defaults, one place (src/lib/features.ts
--        mirrors it; a unit test reads this file and checks they agree).
--   household_feature_on(h, f)    the row, else the default.
--   set_household_feature(h, f, on)  owners only (household_members; never
--        get_user_household_ids(), which staff phones pass).
--
-- The kind of home picked at sign-up needs nothing here: Phase 172 PR 0
-- (migration 142) already stores it, household_setup.home_type, written by
-- record_household_setup().
--
-- RE-CREATED (each from its newest definition, grants unchanged)
--   notify_chores_due (137)       skips category 'bill' chores while Bills and
--        upkeep is off; every other chore's reminder still goes.
--   notify_food_expiring (124)    skips households with Food at home off.
--   notify_food_from_staff (123)  likewise (the food is still saved).
--   notify_urgent_repair (130)    skips households with Repairs off (the
--        report is still saved and shows when Repairs is back).
--   chore_days_open (139)         the evening summary's chores: bill chores
--        leave it while Bills and upkeep is off (Codex, PR #87).
--   staff_push_chore_today (141)  likewise for staff task pushes (Codex, PR #87).
--
-- "Off" isn't enforced on writes: off hides, it doesn't lock (plan, D6).
-- Additive only: one table, new functions, four re-created functions.
-- Privacy policy and legal.ts updated in the same PR (which features a
-- household has switched on). No new service.
-- ============================================================================

-- --- 1. The switches ----------------------------------------------------------------
create table if not exists public.household_features (
  household_id uuid not null references public.households (id) on delete cascade,
  -- Each later feature adds its value here (a check change, additive).
  feature text not null check (feature in ('repairs', 'bills', 'food')),
  enabled boolean not null,
  set_at timestamptz not null default now(),
  set_by uuid references auth.users (id) on delete set null,
  primary key (household_id, feature)
);

alter table public.household_features enable row level security;
revoke all on public.household_features from public, anon, authenticated;
grant select on public.household_features to authenticated;
grant select, insert, update, delete on public.household_features to service_role;

drop policy if exists "tenant_select_household_features" on public.household_features;
create policy "tenant_select_household_features" on public.household_features
  for select to authenticated using (household_id = any (public.get_user_household_ids()));

-- --- 2. Defaults, and whether a feature is on --------------------------------------
-- Later features join OFF (plan D4); the three here are on.
create or replace function public.household_feature_defaults()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{"repairs": true, "bills": true, "food": true}'::jsonb
$$;

-- Security invoker: a client sees only its own household's rows (RLS), and
-- the push functions below run as the database owner.
create or replace function public.household_feature_on(p_household uuid, p_feature text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select f.enabled from public.household_features f
      where f.household_id = p_household and f.feature = p_feature),
    (public.household_feature_defaults() ->> p_feature)::boolean,
    false
  )
$$;

revoke all on function public.household_feature_defaults() from public, anon;
grant execute on function public.household_feature_defaults() to authenticated, service_role;
revoke all on function public.household_feature_on(uuid, text) from public, anon;
grant execute on function public.household_feature_on(uuid, text) to authenticated, service_role;

-- --- 3. The writer --------------------------------------------------------------------
create or replace function public.set_household_feature(p_household uuid, p_feature text, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.household_members m
     where m.user_id = auth.uid() and m.household_id = p_household
  ) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_on is null then
    raise exception 'bad_value' using errcode = '22023';
  end if;
  if p_feature is null or not (public.household_feature_defaults() ? p_feature) then
    raise exception 'unknown_feature' using errcode = '22023';
  end if;

  insert into public.household_features (household_id, feature, enabled, set_at, set_by)
  values (p_household, p_feature, p_on, now(), auth.uid())
  on conflict (household_id, feature)
  do update set enabled = excluded.enabled, set_at = excluded.set_at, set_by = excluded.set_by;
end;
$$;

revoke all on function public.set_household_feature(uuid, text, boolean) from public, anon;
grant execute on function public.set_household_feature(uuid, text, boolean) to authenticated, service_role;

-- --- 4. Pushes respect the switches ---------------------------------------------------
-- notify_chores_due (from 137): bill chores only, while Bills and upkeep is off.
create or replace function public.notify_chores_due(p_today date default null)
returns int
language plpgsql
set search_path = ''
as $$
declare
  today date := coalesce(p_today, (now() at time zone 'Asia/Jakarta')::date);
  person record;
  section record;
  locale text;
  body text;
  label text;
  sent int := 0;
begin
  for person in
    with due as (
      -- Each chore with a reminder, on its reminder day and on today.
      select t.id, t.household_id, t.title, t.due_time, t.due_date, t.status, t.assigned_to,
             d.day, d.ahead
        from public.household_tasks t
       cross join lateral (
         values (today, 0, 'due'), (today + t.remind_days_before, t.remind_days_before::int, 'ahead')
       ) as d(day, ahead, kind)
       where t.parent_task_id is null
         and t.remind_days_before is not null
         and t.status <> 'cancelled'
         -- Bills and upkeep switched off (Phase 171): its bills stay saved
         -- but send no reminder; every other chore still does.
         and (t.category is distinct from 'bill' or public.household_feature_on(t.household_id, 'bills'))
         and (d.kind = 'due' or t.remind_days_before > 0)
         -- Not "ahead" for a repeat that is also due today (a daily chore,
         -- a weekly one reminded a week before): today's line covers it.
         and (d.kind = 'due' or not public.chore_occurs_on(t, today))
         and public.chore_occurs_on(t, d.day)
      union all
      -- A written day off the repeat's pattern, which still shows and is
      -- owed: skipping a chore's first day on the 31st keeps 28 February as
      -- its own row and moves the start to 31 March (startAfterSkippingFirst;
      -- Codex, PR #60). It reminds with its repeat's setting; open_days
      -- below finds the row itself and reads its state and assignee.
      select t.id, t.household_id, x.title, x.due_time, t.due_date, t.status, t.assigned_to,
             d.day, d.ahead
        from public.household_tasks x
        join public.household_tasks t
          on t.id = x.parent_task_id and t.household_id = x.household_id and t.parent_task_id is null
       cross join lateral (
         values (today, 0, 'due'), (today + t.remind_days_before, t.remind_days_before::int, 'ahead')
       ) as d(day, ahead, kind)
       where t.remind_days_before is not null
         and t.status <> 'cancelled'
         and (d.kind = 'due' or t.remind_days_before > 0)
         and x.due_date = d.day
         and (t.category is distinct from 'bill' or public.household_feature_on(t.household_id, 'bills'))
         and not public.chore_occurs_on(t, d.day)
    ),
    open_days as (
      -- That day's state, as expandChores reads it: a written row governs
      -- its day; otherwise the chore itself on its first day; otherwise the
      -- day is still to do. Who it's for follows the same rule.
      select d.household_id, d.title, d.due_time, d.ahead, d.day,
             case when r.id is not null then r.assigned_to else d.assigned_to end as assignee
        from due d
        left join lateral (
          select x.id, x.status, x.assigned_to
            from public.household_tasks x
           where x.parent_task_id = d.id and x.due_date = d.day
           order by x.created_at
           limit 1
        ) r on true
       where coalesce(r.status, case when d.day = d.due_date then d.status else 'pending' end) = 'pending'
    ),
    covered as (
      -- Leave, as Today applies it (applyLeaveTriage, src/lib/leave.ts): on
      -- a day the person it's for is away (approved, or back early only
      -- before they returned), "pause" takes the day off the agenda, so no
      -- reminder; "reassign" hands it to the cover person; "unassign" makes
      -- it anyone's (Codex, PR #60).
      select o.household_id, o.title, o.due_time, o.ahead,
             case
               when lv.id is null then o.assignee
               when coalesce(lv.fallback_action, 'unassign') = 'reassign' and lv.fallback_assignee_id is not null
                 then lv.fallback_assignee_id
               else null
             end as assignee
        from open_days o
        left join lateral (
          select l.id, l.fallback_action, l.fallback_assignee_id
            from public.leave_requests l
           where o.assignee is not null
             and l.staff_id = o.assignee
             and l.household_id = o.household_id
             and l.status in ('approved', 'ended_early')
             and o.day between l.start_date and l.end_date
             and (l.ended_on is null or o.day < l.ended_on)
           order by l.created_at
           limit 1
        ) lv on true
       where lv.id is null or coalesce(lv.fallback_action, 'unassign') <> 'pause'
    ),
    routed as (
      -- An owner's chore goes to that owner; anyone else's to every owner.
      -- Owners only (household_members), and only those with a phone set up
      -- for notifications in this household.
      select o.household_id, o.title, o.due_time, o.ahead, m.user_id
        from covered o
        join public.household_members m on m.household_id = o.household_id
        left join public.staff_profiles p on p.id = o.assignee and p.household_id = o.household_id
        left join public.household_members am on am.household_id = o.household_id and am.user_id = p.user_id
       where (am.user_id is null or m.user_id = am.user_id)
         and exists (
           select 1 from public.push_subscriptions ps
            where ps.household_id = o.household_id and ps.user_id = m.user_id
         )
    ),
    grouped as (
      select household_id, user_id, ahead,
             array_agg(title order by due_time nulls first, title) as titles
        from routed
       group by household_id, user_id, ahead
    )
    select household_id, user_id,
           jsonb_agg(jsonb_build_object('ahead', ahead, 'titles', to_jsonb(titles)) order by ahead) as sections
      from grouped
     group by household_id, user_id
  loop
    begin
      locale := public.locale_of(person.user_id);
      body := '';
      for section in
        select (e ->> 'ahead')::int as ahead,
               array(select jsonb_array_elements_text(e -> 'titles')) as titles
          from jsonb_array_elements(person.sections) as e
         order by (e ->> 'ahead')::int
      loop
        label := case
          when locale = 'id' then case section.ahead
            when 0 then 'Hari ini' when 1 then 'Besok' when 7 then '1 minggu lagi'
            else section.ahead || ' hari lagi' end
          else case section.ahead
            when 0 then 'Due today' when 1 then 'Tomorrow' when 7 then 'In 1 week'
            else 'In ' || section.ahead || ' days' end
        end;
        body := body || case when body = '' then '' else ' ' end
          || label || ': ' || public.chore_due_titles(section.titles, locale) || '.';
      end loop;

      -- Counted only when queued (false when push isn't set up in Vault).
      if public.queue_push(
        person.household_id, 'owner',
        case when locale = 'id' then 'Pengingat' else 'Reminder' end,
        body,
        '/dashboard?module=agenda', 'chores-due-' || today::text,
        person.user_id, null
      ) then
        sent := sent + 1;
      end if;
    exception when others then
      raise warning 'Chore reminder not queued for user % in household %: %',
        person.user_id, person.household_id, sqlerrm;
    end;
  end loop;
  return sent;
end;
$$;

revoke all on function public.notify_chores_due(date) from public, anon, authenticated;
grant execute on function public.notify_chores_due(date) to service_role;

-- notify_food_expiring (from 124): not while Food at home is off.
create or replace function public.notify_food_expiring()
returns int
language plpgsql
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Jakarta')::date;
  household record;
  shown text;
  named_count int;
  extra int;
  message_en text;
  message_id text;
  sent int := 0;
begin
  for household in
    select f.household_id,
           array_agg(coalesce(f.name, '') order by f.expires_on, f.created_at) as names,
           count(*) as total
    from public.food_items f
    where f.outcome is null
      and f.expires_on between today and today + 1
      -- Food at home switched off (Phase 171): no morning push.
      and public.household_feature_on(f.household_id, 'food')
    group by f.household_id
  loop
    begin
      -- Up to two names; photo-only food is counted, not named. The count of
      -- names shown comes from the rows, not from splitting the text: a name
      -- may contain ", " (Codex review, PR #14).
      select string_agg(n, ', '), count(*) into shown, named_count
      from (select n from unnest(household.names) as n where n <> '' limit 2) named;
      extra := household.total - named_count;

      if shown is null then
        message_en := household.total || ' food' || case when household.total = 1 then '' else 's' end
                      || ' to eat today or tomorrow.';
        message_id := household.total || ' makanan perlu dimakan hari ini atau besok.';
      else
        message_en := 'To eat soon: ' || shown
                      || case when extra > 0 then ' and ' || extra || ' more' else '' end || '.';
        message_id := 'Perlu segera dimakan: ' || shown
                      || case when extra > 0 then ', dan ' || extra || ' lagi' else '' end || '.';
      end if;

      perform public.queue_owner_push(
        household.household_id,
        'Food to eat soon', message_en,
        'Makanan perlu segera dimakan', message_id,
        '/dashboard?module=inventory', 'food-soon-' || today::text,
        null
      );
      sent := sent + 1;
    exception when others then
      raise warning 'Morning food push not queued for household %: %', household.household_id, sqlerrm;
    end;
  end loop;
  return sent;
end;
$$;

revoke all on function public.notify_food_expiring() from public, anon, authenticated;
grant execute on function public.notify_food_expiring() to service_role;

-- notify_food_from_staff (from 123): likewise.
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
  -- Only a signed-in staff phone: no session at all is maintenance, and a
  -- household member is an owner, who knows what they just added.
  if auth.uid() is null or exists (select 1 from public.household_members m
              where m.user_id = auth.uid() and m.household_id = new.household_id) then
    return new;
  end if;
  -- Food at home switched off (Phase 171): saved from a stale screen, it
  -- waits quietly for the switch to come back.
  if not public.household_feature_on(new.household_id, 'food') then
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

revoke all on function public.notify_food_from_staff() from public, anon, authenticated;

-- notify_urgent_repair (from 130): not while Repairs is off.
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
  -- Repairs switched off (Phase 171): a report from a stale screen is saved
  -- and waits for Repairs to come back, without a push.
  if not public.household_feature_on(new.household_id, 'repairs') then
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

revoke all on function public.notify_urgent_repair() from public, anon, authenticated;

-- chore_days_open (from 139): the evening summary's chores. Bill chores leave
-- it while Bills and upkeep is off, so the summary never names a chore Today
-- hides, and a day whose only open items are hidden bills sends nothing
-- (Codex, PR #87). notify_evening_summary itself is unchanged.
create or replace function public.chore_days_open(p_day date)
returns table (household_id uuid, chore_id uuid, title text, due_time text, assignee uuid)
language sql
stable
set search_path = ''
as $$
  with due as (
    select t.id, t.household_id, t.title, t.due_time, t.due_date, t.status, t.assigned_to
      from public.household_tasks t
     where t.parent_task_id is null
       and t.status <> 'cancelled'
       -- Bills and upkeep switched off (Phase 171): its bills are hidden on
       -- Today, so the evening summary doesn't name them either.
       and (t.category is distinct from 'bill' or public.household_feature_on(t.household_id, 'bills'))
       and public.chore_occurs_on(t, p_day)
    union all
    -- A written day off the repeat's pattern still shows and is owed (137).
    select t.id, t.household_id, x.title, x.due_time, t.due_date, t.status, t.assigned_to
      from public.household_tasks x
      join public.household_tasks t
        on t.id = x.parent_task_id and t.household_id = x.household_id and t.parent_task_id is null
     where t.status <> 'cancelled'
       and (t.category is distinct from 'bill' or public.household_feature_on(t.household_id, 'bills'))
       and x.due_date = p_day
       and not public.chore_occurs_on(t, p_day)
  ),
  open_days as (
    -- A written day governs its own title, time and who it's for, as
    -- expandChores reads it: an owner may have moved today's to 21:00
    -- (Codex, PR #71).
    select d.household_id, d.id,
           case when r.id is not null then r.title else d.title end as title,
           case when r.id is not null then r.due_time else d.due_time end as due_time,
           case when r.id is not null then r.assigned_to else d.assigned_to end as assignee
      from due d
      left join lateral (
        select x.id, x.status, x.assigned_to, x.title, x.due_time
          from public.household_tasks x
         where x.parent_task_id = d.id and x.due_date = p_day
         order by x.created_at
         limit 1
      ) r on true
     where coalesce(r.status, case when p_day = d.due_date then d.status else 'pending' end) = 'pending'
  )
  select o.household_id, o.id, o.title, o.due_time,
         case
           when lv.id is null then o.assignee
           when coalesce(lv.fallback_action, 'unassign') = 'reassign' and lv.fallback_assignee_id is not null
             then lv.fallback_assignee_id
           else null
         end
    from open_days o
    left join lateral (
      select l.id, l.fallback_action, l.fallback_assignee_id
        from public.leave_requests l
       where o.assignee is not null
         and l.staff_id = o.assignee
         and l.household_id = o.household_id
         and l.status in ('approved', 'ended_early')
         and p_day between l.start_date and l.end_date
         and (l.ended_on is null or p_day < l.ended_on)
       order by l.created_at
       limit 1
    ) lv on true
   where lv.id is null or coalesce(lv.fallback_action, 'unassign') <> 'pause';
$$;

revoke all on function public.chore_days_open(date) from public, anon, authenticated;
grant execute on function public.chore_days_open(date) to service_role;

-- staff_push_chore_today (from 141): the test every staff task push uses
-- (the added and changed triggers, and the 30-minute roll-up of new chores).
-- A bill isn't "today's work" for a staff phone while Bills and upkeep is off
-- (Codex, PR #87).
create or replace function public.staff_push_chore_today(p_task public.household_tasks, p_day date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Bills and upkeep switched off (Phase 171): a bill is hidden on staff
  -- phones, so no push names it, alone or among other new chores.
  select (p_task.category is distinct from 'bill' or public.household_feature_on(p_task.household_id, 'bills'))
     and case
    when p_task.parent_task_id is not null or coalesce(p_task.recurrence, 'none') = 'none'
      then p_task.due_date = p_day and p_task.status = 'pending'
    else public.chore_occurs_on(p_task, p_day)
         and p_task.status <> 'cancelled'
         and (p_day <> p_task.due_date or p_task.status = 'pending')
         and not exists (
           select 1 from public.household_tasks x
            where x.parent_task_id = p_task.id and x.due_date = p_day
         )
  end;
$$;

revoke all on function public.staff_push_chore_today(public.household_tasks, date) from public, anon, authenticated;
grant execute on function public.staff_push_chore_today(public.household_tasks, date) to service_role;
