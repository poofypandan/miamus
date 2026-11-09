-- ============================================================================
-- 128 — Staff phones can work on chores, not rewrite them
-- ============================================================================
-- Owners and staff phones are both `authenticated`, and the chore policies
-- (migrations/090, 097) let any session of the household insert, update and
-- delete household_tasks. The app only ever lets owners edit or delete a
-- chore, but through the API a staff phone could rename one, move it to
-- another room, change its repeat, create chores of its own or delete them.
-- Found by Codex while reviewing the Rooms plan (PR #27); shipped on its own
-- (docs/roadmap-2026-11-09.md, item 2).
--
-- The same shape as inventory_items_owner_guard (migrations/099): a caller
-- with a household_members row for the chore's household (an owner) passes;
-- auth.uid() null (the service role, cron jobs, migrations) passes. Anyone
-- else — a bound staff phone — may:
--
--   UPDATE  only who it's assigned to, its status, who finished it and when,
--           and the proof photos. An allowlist: every other column, including
--           ones added later (Rooms' spot, Repairs' repair_id), stays as it is.
--   INSERT  only one day of a repeating chore (FinishChoreSheet materialising
--           an occurrence): a copy of its template, which must be a repeat of
--           the same household, with the template's title, notes, category,
--           time, supervision and room, recurrence 'none' and no end date.
--           Never a chore of its own.
--   DELETE  nothing.
--
-- No change for owners, and none for anything staff screens do today.
-- Additive: one function, one trigger.
-- ============================================================================

create or replace function public.household_tasks_owner_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_household uuid := coalesce(new.household_id, old.household_id);
  template public.household_tasks;
  -- What a staff phone may change: claiming, finishing and its proof.
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

  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - staff_columns) is distinct from (to_jsonb(old) - staff_columns) then
      raise exception 'chore_owner_only' using errcode = '42501';
    end if;
    return new;
  end if;

  -- INSERT: one day of a repeat, copied from its template.
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
  if (new.title, new.notes, new.category, new.due_time, new.requires_supervision, new.location_id)
     is distinct from
     (template.title, template.notes, template.category, template.due_time,
      coalesce(template.requires_supervision, false), template.location_id)
     or coalesce(new.recurrence, 'none') <> 'none'
     or new.recurrence_until is not null
  then
    raise exception 'chore_owner_only' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- A trigger function: nothing calls it directly, and triggers fire without an
-- EXECUTE grant (as migrations/111 did for inventory_items_owner_guard).
revoke all on function public.household_tasks_owner_guard() from public, anon, authenticated;
grant execute on function public.household_tasks_owner_guard() to service_role;

drop trigger if exists household_tasks_owner_guard on public.household_tasks;
create trigger household_tasks_owner_guard
  before insert or update or delete on public.household_tasks
  for each row execute function public.household_tasks_owner_guard();
