-- ============================================================================
-- 137 — Longer repeats and reminders for chores (Phase 164, PR A)
-- ============================================================================
-- docs/phase-164-bills-upkeep-plan.md; owner decisions (2026-11-10): A for
-- D1–D9. Bills and upkeep are chores: this migration gives chores what they
-- need for them. Payments (amount and receipt) come later, in 138.
--
--   household_tasks.recurrence_interval  every N weeks or months (D1): read
--        with 'weekly' and 'monthly', 1–12, default 1. A year is 12 months.
--        AC service every 3 months, the water tank every 6, PBB every year.
--   household_tasks.remind_days_before   "Remind me" (D3): null = no reminder,
--        0 = on the day, or 1, 3 or 7 days before.
--
-- RE-CREATED
--   chore_occurs_on (128)   learns the interval, so a staff phone can still
--        finish a 3-monthly chore on its day, and only then.
--   household_tasks_owner_guard (128, as 130 left it)   a day a staff phone
--        writes is a one-off copy: interval 1 and no reminder, as the app
--        writes it. Staff can't change either column on any row (they are not
--        in the guard's staff columns, so the existing check refuses that).
--
-- NEW
--   chore_due_titles(titles, locale)  "A, B and C" / "A, B, dan C".
--   notify_chores_due(p_today)        the 07:00 reminder (D3, D4). For each
--        chore with a reminder, on the reminder day and again on the due day
--        if it isn't done: one push per owner per morning, in that owner's
--        language, listing what is due. A chore given to an owner reminds
--        that owner; given to staff or to anyone, every owner (staff phones
--        get no pushes). Not after the due day: a missed chore sits in
--        "From earlier" on Today, as missed chores already do.
--   cron job notify-chores-due        00:05 UTC, 07:05 in Jakarta, just after
--        the food reminder.
--
-- No new personal data: a reminder setting on a chore, and a push composed
-- from chore titles the household already stores. No privacy-policy change
-- (that comes with payments, 138).
--
-- Additive: two columns with defaults, one partial index, two re-created
-- functions, two new functions, one cron job. Old app builds don't send the new columns, so their
-- writes keep the defaults (and pass the guard). No SECURITY DEFINER function
-- a client can call; every function created or replaced revokes EXECUTE here.
-- ============================================================================

-- --- 1. The two columns ----------------------------------------------------------
alter table public.household_tasks
  add column if not exists recurrence_interval smallint not null default 1;
alter table public.household_tasks
  add column if not exists remind_days_before smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'household_tasks_recurrence_interval_check') then
    alter table public.household_tasks
      add constraint household_tasks_recurrence_interval_check check (recurrence_interval between 1 and 12);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'household_tasks_remind_days_before_check') then
    alter table public.household_tasks
      add constraint household_tasks_remind_days_before_check
      check (remind_days_before is null or remind_days_before in (0, 1, 3, 7));
  end if;
end;
$$;

-- The 07:05 job reads only the chores with a reminder: a small partial index
-- instead of a daily scan of every household's every written day.
create index if not exists household_tasks_reminders_idx
  on public.household_tasks (household_id)
  where parent_task_id is null and remind_days_before is not null;

-- --- 2. Which days a repeat falls on, with the interval -----------------------------
-- The SQL twin of occursOn (src/lib/chore-recurrence.ts). Weekly: the first
-- day's weekday, every N weeks from it. Monthly: the first day's day of the
-- month (clamped to the month's end), every N months from it. Daily ignores
-- the interval. Pure; no table access.
create or replace function public.chore_occurs_on(p_template public.household_tasks, p_day date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_template.recurrence, 'none') = 'none' then p_day = p_template.due_date
    when p_day < p_template.due_date then false
    when p_template.recurrence_until is not null and p_day > p_template.recurrence_until then false
    when p_template.recurrence = 'daily' then true
    when p_template.recurrence = 'weekly' then
      extract(dow from p_day) = extract(dow from p_template.due_date)
      and ((p_day - p_template.due_date) / 7) % greatest(coalesce(p_template.recurrence_interval, 1), 1) = 0
    when p_template.recurrence = 'monthly' then
      ((extract(year from p_day) - extract(year from p_template.due_date)) * 12
        + extract(month from p_day) - extract(month from p_template.due_date))::int
        % greatest(coalesce(p_template.recurrence_interval, 1), 1) = 0
      and extract(day from p_day) = least(
        extract(day from p_template.due_date),
        extract(day from (date_trunc('month', p_day) + interval '1 month - 1 day'))
      )
    else false
  end;
$$;

revoke all on function public.chore_occurs_on(public.household_tasks, date) from public, anon, authenticated;
grant execute on function public.chore_occurs_on(public.household_tasks, date) to service_role;

-- --- 3. The staff guard (128, as 130 left it) -----------------------------------------
-- One change: a staff phone's copy of a repeat's day must be a plain one-off,
-- with interval 1 and no reminder (what materialiseChoreOccurrence writes).
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
     or new.recurrence_interval is distinct from 1
     or new.remind_days_before is not null
     or not public.chore_occurs_on(template, new.due_date)
  then
    raise exception 'chore_owner_only' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.household_tasks_owner_guard() from public, anon, authenticated;
grant execute on function public.household_tasks_owner_guard() to service_role;

-- --- 4. The reminder ---------------------------------------------------------------
-- "A and B", "A, B and C", "A, B, C and 2 more"; Indonesian "A dan B",
-- "A, B, dan C", "A, B, C, dan 2 lagi" (as the food reminder, 124).
create or replace function public.chore_due_titles(p_titles text[], p_locale text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  total int := coalesce(array_length(p_titles, 1), 0);
  shown text[] := p_titles[1:3];
  k int := least(coalesce(array_length(p_titles, 1), 0), 3);
  id boolean := p_locale = 'id';
begin
  if k = 0 then
    return '';
  end if;
  if total > 3 then
    return array_to_string(shown, ', ')
      || case when id then ', dan ' || (total - 3) || ' lagi' else ' and ' || (total - 3) || ' more' end;
  end if;
  if k = 1 then
    return shown[1];
  end if;
  if k = 2 then
    return shown[1] || case when id then ' dan ' else ' and ' end || shown[2];
  end if;
  return shown[1] || ', ' || shown[2] || case when id then ', dan ' else ' and ' end || shown[3];
end;
$$;

revoke all on function public.chore_due_titles(text[], text) from public, anon, authenticated;
grant execute on function public.chore_due_titles(text[], text) to service_role;

-- Returns how many owners' pushes were queued. p_today is for tests; the cron job
-- passes nothing and gets today in Jakarta. Not SECURITY DEFINER: only the
-- cron job (as its owner) and the service role call it.
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
         and not public.chore_occurs_on(t, d.day)
    ),
    open_days as (
      -- That day's state, as expandChores reads it: a written row governs
      -- its day; otherwise the chore itself on its first day; otherwise the
      -- day is still to do. Who it's for follows the same rule.
      select d.household_id, d.title, d.due_time, d.ahead,
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
    routed as (
      -- An owner's chore goes to that owner; anyone else's to every owner.
      -- Owners only (household_members), and only those with a phone set up
      -- for notifications in this household.
      select o.household_id, o.title, o.due_time, o.ahead, m.user_id
        from open_days o
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

-- 00:05 UTC is 07:05 in Jakarta, just after the food reminder (124).
select cron.unschedule('notify-chores-due')
where exists (select 1 from cron.job where jobname = 'notify-chores-due');

select cron.schedule('notify-chores-due', '5 0 * * *', $job$ select public.notify_chores_due(); $job$);
