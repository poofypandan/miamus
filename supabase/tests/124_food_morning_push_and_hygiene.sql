-- Migration 124 checks: the morning food reminder and the hygiene fixes.
-- LOCAL DATABASE ONLY. One transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/124_food_morning_push_and_hygiene.sql
\set ON_ERROR_STOP on
\pset footer off
begin;

create function pg_temp.ok(cond boolean, label text) returns text language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  return 'ok  ' || label;
end $$;

-- Pushes captured instead of sent (replaced for this transaction only).
create temp table pushes (household uuid, title_en text, body_en text, title_id text, body_id text, tag text);
create or replace function public.queue_owner_push(
  p_household_id uuid, p_title_en text, p_body_en text, p_title_id text, p_body_id text,
  p_url text default '/', p_tag text default null, p_exclude_user_id uuid default null)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  insert into pg_temp.pushes values (p_household_id, p_title_en, p_body_en, p_title_id, p_body_id, p_tag);
  return true;
end $$;

insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000124a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a124@test.local', false, now(), now());
insert into public.households (id, name, owner_auth_id) values
  ('00000000-0000-0000-0000-0000000124f1', 'Rumah A', '00000000-0000-0000-0000-0000000124a1'),
  ('00000000-0000-0000-0000-0000000124f2', 'Rumah B', '00000000-0000-0000-0000-0000000124a1'),
  ('00000000-0000-0000-0000-0000000124f3', 'Rumah C', '00000000-0000-0000-0000-0000000124a1');

-- As the cron job sees "today": Jakarta's calendar day.
create temp table d as select (now() at time zone 'Asia/Jakarta')::date as today;

insert into public.food_items (household_id, name, photo_url, expires_on, outcome)
select h, n, p, (select today from d) + o, oc
from (values
  -- A: three named, one photo-only, one past, one later, one eaten.
  ('00000000-0000-0000-0000-0000000124f1'::uuid, 'Rendang', null, 0, null),
  ('00000000-0000-0000-0000-0000000124f1'::uuid, 'Lapis legit', null, 1, null),
  ('00000000-0000-0000-0000-0000000124f1'::uuid, 'Nasi kotak', null, 1, null),
  ('00000000-0000-0000-0000-0000000124f1'::uuid, null, 'http://x/p.webp', 1, null),
  ('00000000-0000-0000-0000-0000000124f1'::uuid, 'Basi', null, -1, null),
  ('00000000-0000-0000-0000-0000000124f1'::uuid, 'Dimsum', null, 9, null),
  ('00000000-0000-0000-0000-0000000124f1'::uuid, 'Habis', null, 0, 'eaten'),
  -- B: only a photo-only food tomorrow.
  ('00000000-0000-0000-0000-0000000124f2'::uuid, null, 'http://x/q.webp', 1, null),
  -- C: nothing due.
  ('00000000-0000-0000-0000-0000000124f3'::uuid, 'Kerupuk', null, 30, null)
) v(h, n, p, o, oc);

select pg_temp.ok(public.notify_food_expiring() = 2, 'two households have food due; the third is left alone');
select pg_temp.ok((select body_en = 'To eat soon: Rendang, Lapis legit and 2 more.'
                          and body_id = 'Perlu segera dimakan: Rendang, Lapis legit, dan 2 lagi.'
                          and title_id = 'Makanan perlu segera dimakan'
                          and tag = 'food-soon-' || (select today from d)::text
                     from pg_temp.pushes where household = '00000000-0000-0000-0000-0000000124f1'),
  'soonest first, two names, the rest counted; not food past its date, later, or eaten; both languages');
select pg_temp.ok((select body_en = '1 food to eat today or tomorrow.'
                          and body_id = '1 makanan perlu dimakan hari ini atau besok.'
                     from pg_temp.pushes where household = '00000000-0000-0000-0000-0000000124f2'),
  'photo-only food is counted, not named');

-- Grants and schedule.
select pg_temp.ok(not has_function_privilege(r, 'public.notify_food_expiring()', 'execute'), r || ' cannot call it')
from unnest(array['anon', 'authenticated']) r;
select pg_temp.ok((select count(*) = 1 from cron.job where jobname = 'notify-food-expiring' and schedule = '0 0 * * *'),
  'scheduled for 07:00 in Jakarta');

-- Hygiene.
select pg_temp.ok((select proconfig @> array['search_path=""'] from pg_proc
                    where oid = 'public.storage_object_household(text)'::regprocedure),
  'storage_object_household has a fixed search_path');
select pg_temp.ok(public.storage_object_household('00000000-0000-0000-0000-0000000124f1/food/x.webp')
                  = '00000000-0000-0000-0000-0000000124f1'::uuid,
  'and still reads the household out of a key');
select pg_temp.ok((select count(*) = 12 from pg_indexes where schemaname = 'public' and indexname in (
  'household_tasks_completed_by_idx', 'household_tasks_location_household_idx', 'households_owner_auth_id_idx',
  'inventory_alerts_pet_id_idx', 'inventory_audit_logs_audited_by_idx', 'leave_requests_decided_by_idx',
  'leave_requests_fallback_assignee_id_idx', 'owner_invites_created_by_idx', 'push_subscriptions_user_id_idx',
  'staff_profiles_user_id_idx', 'staff_sign_in_attempts_household_id_idx', 'staff_sign_in_attempts_staff_id_idx')),
  'all twelve foreign keys have an index');

rollback;
