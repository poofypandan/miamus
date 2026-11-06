-- ============================================================================
-- 114 — Owners choose English or Bahasa Indonesia (Phase 149)
-- ============================================================================
-- Owner screens were English only; staff screens are Bahasa Indonesia only
-- and stay that way. An owner now picks a language when they first sign in,
-- and can change it in Access. The choice belongs to the account, not the
-- phone, so it follows them to every device and decides the language of the
-- push notifications the database writes for them.
--
-- THE PIECES
--   user_preferences      one row per Google account that has chosen: its
--                         locale ('en' or 'id'). No row = not chosen yet.
--   my_locale()           the caller's choice, or null. Null for a staff
--                         phone's anonymous session too.
--   set_my_locale(locale) saves it. Never for an anonymous session: staff
--                         phones are Bahasa Indonesia, full stop.
--   locale_of(user)       internal: what a push to that account is written
--                         in. Anonymous → 'id', no choice → 'en'.
--   queue_owner_push(...) internal: queue_push (103) once per owner who has a
--                         device registered, each in their own language. The
--                         send-push Edge Function is unchanged.
--   send_test_push() / notify_sick_report()
--                         replaced, same signatures, to write in the
--                         recipient's language. Nothing else about them
--                         changes.
--
-- BACKFILL. Every account that already belongs to a household is recorded as
-- English, which is what they have been using (owner decision, 2026-11-06):
-- nobody existing is asked. An account with no row — a new owner at
-- /onboarding, or a co-owner joining through an invite — is asked once.
--
-- NOT CHANGED: the household-request push (113). Its only recipients are the
-- platform admins, and they use English.
--
-- Additive: one table, four new functions, two replaced in place.
-- ============================================================================

-- --- The choice ---------------------------------------------------------------------
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  locale text not null check (locale in ('en', 'id')),
  updated_at timestamptz not null default now()
);

-- Read and written only through the definer functions below. 107's default
-- privileges would otherwise grant `authenticated` the table, so say so here.
alter table public.user_preferences enable row level security;
revoke all on public.user_preferences from public, anon, authenticated;
grant select, insert, update, delete on public.user_preferences to service_role;

-- Accounts that already have a household keep English, as they have it today.
insert into public.user_preferences (user_id, locale)
select distinct m.user_id, 'en'
from public.household_members m
join auth.users u on u.id = m.user_id
where not coalesce(u.is_anonymous, false)
on conflict (user_id) do nothing;

-- What an account's notifications are written in. Anonymous sessions are
-- staff phones (Bahasa Indonesia); an account that has not chosen gets
-- English, the language owner screens had until now.
create or replace function public.locale_of(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when coalesce((select u.is_anonymous from auth.users u where u.id = p_user_id), false) then 'id'
    else coalesce((select p.locale from public.user_preferences p where p.user_id = p_user_id), 'en')
  end;
$$;

create or replace function public.my_locale()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  anonymous boolean;
begin
  if uid is null then
    return null;
  end if;
  select u.is_anonymous into anonymous from auth.users u where u.id = uid;
  if coalesce(anonymous, true) then
    return null;
  end if;
  return (select p.locale from public.user_preferences p where p.user_id = uid);
end;
$$;

create or replace function public.set_my_locale(p_locale text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  anonymous boolean;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select u.is_anonymous into anonymous from auth.users u where u.id = uid;
  if coalesce(anonymous, true) then
    raise exception 'staff_devices_use_indonesian' using errcode = '42501';
  end if;
  if p_locale is null or p_locale not in ('en', 'id') then
    raise exception 'locale must be en or id' using errcode = '22023';
  end if;

  insert into public.user_preferences (user_id, locale, updated_at)
  values (uid, p_locale, now())
  on conflict (user_id) do update set locale = excluded.locale, updated_at = excluded.updated_at;
  return p_locale;
end;
$$;

-- --- Owner notifications in the owner's language ------------------------------------
-- One queue_push per owner with a device in this household, so each gets the
-- copy in their language; send-push still checks membership at send time
-- (push_dispatch_plan, 103). A household has a handful of owners, so this is
-- a handful of requests where there used to be one. True if any was queued.
create or replace function public.queue_owner_push(
  p_household_id uuid,
  p_title_en text,
  p_body_en text,
  p_title_id text,
  p_body_id text,
  p_url text default '/',
  p_tag text default null,
  p_exclude_user_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_row record;
  queued boolean := false;
begin
  for owner_row in
    select distinct m.user_id
    from public.household_members m
    where m.household_id = p_household_id
      and (p_exclude_user_id is null or m.user_id <> p_exclude_user_id)
      and exists (
        select 1 from public.push_subscriptions s
        where s.household_id = p_household_id and s.user_id = m.user_id
      )
  loop
    if public.locale_of(owner_row.user_id) = 'id' then
      queued := public.queue_push(
        p_household_id, 'owner', p_title_id, p_body_id, p_url, p_tag, owner_row.user_id, null
      ) or queued;
    else
      queued := public.queue_push(
        p_household_id, 'owner', p_title_en, p_body_en, p_url, p_tag, owner_row.user_id, null
      ) or queued;
    end if;
  end loop;
  return queued;
end;
$$;

-- 103's send_test_push, in the caller's language. Unchanged otherwise.
create or replace function public.send_test_push()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  devices integer := 0;
  target record;
  indonesian boolean;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  indonesian := public.locale_of(uid) = 'id';
  for target in
    select household_id, count(*) as n
    from public.push_subscriptions
    where user_id = uid and household_id = any (public.get_user_household_ids())
    group by household_id
  loop
    if not public.queue_push(
      target.household_id, 'all',
      case when indonesian then '🔔 Tes notifikasi' else '🔔 Test notification' end,
      case when indonesian then 'Notifikasi sudah berfungsi di perangkat ini.'
           else 'Push notifications are working on this device.' end,
      '/dashboard?module=access',
      'test-' || uid::text, uid, null
    ) then
      raise exception 'Push is not configured on the server yet' using errcode = '55000';
    end if;
    devices := devices + target.n;
  end loop;
  return devices;
end;
$$;

-- 103's notify_sick_report, with both languages. The staff's note is quoted
-- as they wrote it (Bahasa Indonesia) in either.
create or replace function public.notify_sick_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pet_name text;
  household uuid;
  staff_name text;
  note text;
  quoted text;
  message_en text;
  message_id text;
begin
  if new.schedule_id is not null or new.notes is null or new.notes not like 'Muntah / Sakit%' then
    return new;
  end if;
  if new.completed_at < now() - interval '1 day' then
    return new;
  end if;

  begin
    select e.name, e.household_id into pet_name, household
    from public.task_entities e
    where e.id = new.entity_id;
    if household is null then
      return new;
    end if;

    if new.staff_id is not null then
      select s.name into staff_name from public.staff_profiles s where s.id = new.staff_id;
    end if;

    -- "Muntah / Sakit — muntah sedikit setelah makan" → the staff's own words.
    note := nullif(btrim(regexp_replace(substring(new.notes from char_length('Muntah / Sakit') + 1), '^\s*—\s*', '')), '');
    quoted := coalesce(E'\n“' || left(note, 140) || '”', '');

    message_en := coalesce(pet_name, 'A pet') || ' has been reported sick'
      || coalesce(' by ' || staff_name, '') || quoted;
    message_id := coalesce(pet_name, 'Hewan peliharaan') || ' dilaporkan sakit'
      || coalesce(' oleh ' || staff_name, '') || quoted;

    perform public.queue_owner_push(
      household,
      '🚨 Pet Alert', message_en,
      '🚨 Hewan Sakit', message_id,
      '/dashboard?module=agenda', 'sick-' || new.id::text,
      auth.uid()
    );
  exception when others then
    raise warning 'Sick-report push not queued for log %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

-- --- Who may call what ---------------------------------------------------------------------
revoke all on function public.my_locale() from public, anon;
revoke all on function public.set_my_locale(text) from public, anon;
grant execute on function public.my_locale() to authenticated, service_role;
grant execute on function public.set_my_locale(text) to authenticated, service_role;

revoke all on function public.locale_of(uuid) from public, anon, authenticated;
revoke all on function public.queue_owner_push(uuid, text, text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.locale_of(uuid) to service_role;
grant execute on function public.queue_owner_push(uuid, text, text, text, text, text, text, uuid) to service_role;

-- Replaced in place: create or replace keeps 103's grants, restated so this
-- file reads on its own.
revoke all on function public.send_test_push() from public, anon;
grant execute on function public.send_test_push() to authenticated;
revoke all on function public.notify_sick_report() from public, anon, authenticated;
