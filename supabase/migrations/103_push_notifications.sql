-- ============================================================================
-- 103 — Web Push: device subscriptions and the sick-report alert (Phase 119)
-- ============================================================================
-- A sick dog is the one thing staff report that cannot wait for the owner to
-- open the app (Phase 99 gave it a WhatsApp handoff for exactly that reason).
-- This makes it a push notification on the owner's phone the moment the
-- report lands.
--
-- THE PIECES
--   push_subscriptions      one row per device that said yes. RLS: you see
--                           and delete only your own devices.
--   save_push_subscription  how a device registers (an upsert keyed on the
--                           push endpoint — see below for why not plain RLS).
--   get_push_public_key     the VAPID public key, read from Vault, so the app
--                           and the sender can never disagree about it.
--   send_test_push          "Send test" in the Access tab.
--   queue_push              internal: hands a message to the send-push Edge
--                           Function through pg_net.
--   notify_sick_report      the trigger: a "Muntah / Sakit" log alerts every
--                           owner of that household.
--   push_dispatch_plan /
--   push_forget_subscriptions
--                           what send-push itself calls: who to send to (with
--                           the VAPID keys), and which subscriptions are dead.
--
-- WHY A DATABASE TRIGGER, NOT THE STAFF PHONE. The report row is the event.
-- A trigger fires however the row arrives — straight away, or hours later
-- from the offline queue (use-offline-sync) — and the text is composed here
-- from the database, so no client can make an owner's phone say anything.
-- pg_net queues the request inside the inserting transaction and sends it
-- after commit: a report that rolls back alerts nobody, and the insert never
-- waits on the network.
--
-- WHO MAY CALL send-push. Nobody but this database. The function is deployed
-- with verify_jwt off and authorises the caller by the push_dispatch_secret
-- in Vault, checked inside push_dispatch_plan — the same shape as the photo
-- retention job (migrations/101). Until that secret and the VAPID keys are in
-- Vault (scripts/generate-vapid-keys.mjs prints the SQL), queue_push declines
-- quietly and the sick report saves exactly as before.
--
-- ENDPOINTS ARE ALLOW-LISTED. send-push POSTs to whatever endpoint a
-- subscription names. Unchecked, any household member could register
-- "http://169.254.169.254/..." and have our own server request it on their
-- behalf. Only the browser vendors' push services are accepted, here and
-- again in the function.
--
-- Additive only: one table, nine functions, one trigger.
-- ============================================================================

-- --- Endpoint allow-list -------------------------------------------------------
-- Chrome, Edge-on-Android, Samsung, Opera: FCM. Firefox: Mozilla autopush.
-- Safari (macOS and iOS 16.4+ home-screen apps): Apple. Edge on Windows: WNS.
create or replace function public.is_push_endpoint(endpoint text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/', false);
$$;

-- --- The table -------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  -- The browser's PushSubscription.toJSON(), trimmed to endpoint + keys.
  subscription jsonb not null,
  -- One row per device. A phone that changes hands (signed out, someone else
  -- signs in) is the same endpoint, and must stop alerting the first person.
  endpoint text generated always as (subscription ->> 'endpoint') stored unique,
  created_at timestamptz not null default now(),
  constraint push_subscriptions_shape check (
    public.is_push_endpoint(subscription ->> 'endpoint')
    and subscription -> 'keys' ? 'p256dh'
    and subscription -> 'keys' ? 'auth'
  )
);

create index if not exists push_subscriptions_household_idx
  on public.push_subscriptions (household_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;

-- Your own devices, nobody else's. No UPDATE policy: re-registering goes
-- through save_push_subscription, which is the only path that may move an
-- endpoint from one account to another.
drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert to authenticated with check (
    user_id = auth.uid() and household_id = any (public.get_user_household_ids())
  );

drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

-- --- Registering a device ---------------------------------------------------------
-- An upsert on the endpoint, as the caller. Plain RLS cannot express it: when
-- a shared phone's endpoint already belongs to the previous account, the new
-- one may neither see nor update that row — but holding the live
-- subscription is proof enough that the device is now theirs.
create or replace function public.save_push_subscription(p_household_id uuid, p_subscription jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  -- v_-prefixed: a variable named `endpoint` would collide with the column
  -- in ON CONFLICT (endpoint), which PL/pgSQL rejects as ambiguous.
  v_endpoint text := p_subscription ->> 'endpoint';
  v_p256dh text := p_subscription -> 'keys' ->> 'p256dh';
  v_auth text := p_subscription -> 'keys' ->> 'auth';
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not (p_household_id = any (public.get_user_household_ids())) then
    raise exception 'not a member of this household' using errcode = '42501';
  end if;
  if not public.is_push_endpoint(v_endpoint) or v_p256dh is null or v_auth is null then
    raise exception 'not a push subscription this server will send to' using errcode = '22023';
  end if;

  insert into public.push_subscriptions (user_id, household_id, subscription)
  values (
    uid,
    p_household_id,
    jsonb_build_object('endpoint', v_endpoint, 'keys', jsonb_build_object('p256dh', v_p256dh, 'auth', v_auth))
  )
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        household_id = excluded.household_id,
        subscription = excluded.subscription;
end;
$$;

-- The public half of the VAPID pair. Not a secret — every subscribed browser
-- holds it — but kept beside the private half in Vault so a rotation is one
-- edit, not an edit plus a frontend redeploy. Null until the keys are stored.
create or replace function public.get_push_public_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'push_vapid_public_key';
$$;

-- --- Sending -------------------------------------------------------------------------
-- Internal. Returns false, without raising, while push is not configured, so
-- a caller in a trigger never fails the insert it is reacting to.
create or replace function public.queue_push(
  p_household_id uuid,
  p_target_role text,
  p_title text,
  p_body text,
  p_url text default '/',
  p_tag text default null,
  p_user_id uuid default null,
  p_exclude_user_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_url text;
  dispatch_secret text;
begin
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into dispatch_secret from vault.decrypted_secrets where name = 'push_dispatch_secret';
  if base_url is null or dispatch_secret is null then
    raise notice 'Push is not configured (Vault secrets missing); nothing sent';
    return false;
  end if;

  perform net.http_post(
    url := base_url || '/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', dispatch_secret),
    body := jsonb_build_object(
      'household_id', p_household_id,
      'target_role', p_target_role,
      'title', p_title,
      'body', p_body,
      'url', p_url,
      'tag', p_tag,
      'user_id', p_user_id,
      'exclude_user_id', p_exclude_user_id
    ),
    timeout_milliseconds := 10000
  );
  return true;
end;
$$;

-- The Access tab's "Send test": this device's own account, every device it
-- has registered. Returns how many devices that is, so the button can say
-- "no device registered" rather than send into the void. Delivery itself is
-- asynchronous; the phone buzzing is the confirmation.
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
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  for target in
    select household_id, count(*) as n
    from public.push_subscriptions
    where user_id = uid and household_id = any (public.get_user_household_ids())
    group by household_id
  loop
    if not public.queue_push(
      target.household_id, 'all', '🔔 Test notification',
      'Push notifications are working on this device.', '/dashboard?module=access',
      'test-' || uid::text, uid, null
    ) then
      raise exception 'Push is not configured on the server yet' using errcode = '55000';
    end if;
    devices := devices + target.n;
  end loop;
  return devices;
end;
$$;

-- --- What send-push calls ---------------------------------------------------------------
create or replace function public.assert_push_dispatch_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected text;
begin
  select decrypted_secret into expected from vault.decrypted_secrets where name = 'push_dispatch_secret';
  if expected is null or p_secret is null or p_secret <> expected then
    raise exception 'Not authorised to send push notifications' using errcode = '42501';
  end if;
end;
$$;

-- The VAPID keys and every subscription the message should reach.
--   owner — an account with a household_members row for this household;
--   staff — an anonymous staff device bound to it (device_sessions);
--   all   — either.
-- Membership is checked at send time, not stored on the subscription, so a
-- co-owner whose access is removed stops being alerted that instant, with no
-- clean-up to forget.
create or replace function public.push_dispatch_plan(
  p_secret text,
  p_household_id uuid,
  p_target_role text,
  p_user_id uuid default null,
  p_exclude_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_push_dispatch_secret(p_secret);
  if p_target_role not in ('owner', 'staff', 'all') then
    raise exception 'target_role must be owner, staff or all' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'vapid', (
      select jsonb_build_object(
        'public_key', max(decrypted_secret) filter (where name = 'push_vapid_public_key'),
        'private_key', max(decrypted_secret) filter (where name = 'push_vapid_private_key'),
        'subject', max(decrypted_secret) filter (where name = 'push_vapid_subject')
      )
      from vault.decrypted_secrets
      where name in ('push_vapid_public_key', 'push_vapid_private_key', 'push_vapid_subject')
    ),
    'targets', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'subscription', s.subscription))
      from public.push_subscriptions s
      where s.household_id = p_household_id
        and (p_user_id is null or s.user_id = p_user_id)
        and (p_exclude_user_id is null or s.user_id <> p_exclude_user_id)
        and (
          (p_target_role in ('owner', 'all') and exists (
            select 1 from public.household_members m
            where m.household_id = s.household_id and m.user_id = s.user_id
          ))
          or (p_target_role in ('staff', 'all') and exists (
            select 1 from public.device_sessions d
            where d.household_id = s.household_id and d.user_id = s.user_id
          ))
        )
    ), '[]'::jsonb)
  );
end;
$$;

-- Subscriptions the push service answered 404/410 for: the browser dropped
-- them (permission revoked, site data cleared, app uninstalled).
create or replace function public.push_forget_subscriptions(p_secret text, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  perform public.assert_push_dispatch_secret(p_secret);
  delete from public.push_subscriptions where id = any (p_ids);
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- --- The trigger ------------------------------------------------------------------------
-- A sick report is an ad-hoc pet log (no schedule) whose notes begin with the
-- label AdHocSheet writes: "Muntah / Sakit", or "Muntah / Sakit — <note>".
-- That label is the contract; adhoc-sheet.tsx points back here.
--
-- Older than a day is skipped: a report that sat in a phone's offline queue
-- overnight still alerts, but a bulk restore of history does not ring every
-- owner's phone once per old report.
--
-- The reporter's own devices are excluded (auth.uid() is whoever inserted),
-- so an owner filing a report from their own phone is not alerted about it.
-- Any failure is swallowed with a warning: an alert that cannot be sent must
-- never cost the report itself.
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
  message text;
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

    message := coalesce(pet_name, 'A pet') || ' has been reported sick'
      || coalesce(' by ' || staff_name, '')
      || coalesce(E'\n“' || left(note, 140) || '”', '');

    perform public.queue_push(
      household, 'owner', '🚨 Pet Alert', message,
      '/dashboard?module=agenda', 'sick-' || new.id::text,
      null, auth.uid()
    );
  exception when others then
    raise warning 'Sick-report push not queued for log %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists task_logs_notify_sick_report on public.task_logs;
create trigger task_logs_notify_sick_report
  after insert on public.task_logs
  for each row execute function public.notify_sick_report();

-- --- Who may call what ---------------------------------------------------------------------
revoke all on function public.save_push_subscription(uuid, jsonb) from public, anon;
revoke all on function public.get_push_public_key() from public, anon;
revoke all on function public.send_test_push() from public, anon;
grant execute on function public.save_push_subscription(uuid, jsonb) to authenticated;
grant execute on function public.get_push_public_key() to authenticated;
grant execute on function public.send_test_push() to authenticated;

revoke all on function public.queue_push(uuid, text, text, text, text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.notify_sick_report() from public, anon, authenticated;
revoke all on function public.assert_push_dispatch_secret(text) from public, anon, authenticated;
revoke all on function public.push_dispatch_plan(text, uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.push_forget_subscriptions(text, uuid[]) from public, anon, authenticated;
grant execute on function public.push_dispatch_plan(text, uuid, text, uuid, uuid) to service_role;
grant execute on function public.push_forget_subscriptions(text, uuid[]) to service_role;
