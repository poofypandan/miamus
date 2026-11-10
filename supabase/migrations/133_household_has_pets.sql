-- ============================================================================
-- 133 — "Who lives here?": does the household have pets (Phase 162)
-- ============================================================================
-- docs/phase-162-who-lives-here-plan.md. Not every home has pets, and a
-- pet-first app confuses the ones that don't. New households answer at sign-up;
-- owners change it under Household → Who lives here. With pets off the app
-- hides the Pets tab, the pet lines on Today, the pet shelf in supplies and
-- Kakak's pet routines.
--
-- THE PIECES
--   households.has_pets          true / false = answered; NULL = not answered
--                                yet, which the app treats as ON (today's
--                                behaviour), so no household loses anything.
--   households.has_pets_set_at   when it was last answered.
--   households.has_pets_set_by   which account answered (set null if deleted).
--   create_household(name, has_pets default null)
--                                113's function with the sign-up answer. Old
--                                app builds still call it with p_name only.
--   set_household_has_pets(household, on)
--                                owners only (a household_members row; never
--                                get_user_household_ids(), which staff phones
--                                pass). Turning pets off is refused with
--                                'has_live_pets' while a pet isn't archived
--                                (owner decision D4: archive first).
--
-- BACKFILL. Every household with a pet row (archived ones included: their
-- history lives under the Pets tab) is set to true. The rest stay NULL and
-- the app asks them once, on Today (D3).
--
-- READS. households_select_own already lets members and bound staff phones
-- read the row (098/125), so no policy changes. Still no direct UPDATE on
-- households: the function is the only door.
--
-- Additive: three nullable columns, one function re-created with an extra
-- defaulted argument (dropped first so no overload is left), one new
-- function. No privacy-policy change (plan, "Privacy policy").
-- ============================================================================

-- --- 1. Columns ------------------------------------------------------------------------
alter table public.households
  add column if not exists has_pets boolean,
  add column if not exists has_pets_set_at timestamptz,
  add column if not exists has_pets_set_by uuid references auth.users (id) on delete set null;

-- --- 2. Backfill -----------------------------------------------------------------------
update public.households h
   set has_pets = true
 where h.has_pets is null
   and exists (
     select 1 from public.task_entities e
      where e.household_id = h.id and e.entity_type = 'pet'
   );

-- --- 3. create_household with the sign-up answer ---------------------------------------
-- 113's body, unchanged apart from the answer. Dropped first: create or replace
-- with a new argument would leave create_household(text) beside it.
drop function if exists public.create_household(text);

create or replace function public.create_household(p_name text, p_has_pets boolean default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  anonymous boolean;
  clean text := btrim(coalesce(p_name, ''));
  new_id uuid;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select u.is_anonymous into anonymous from auth.users u where u.id = uid;
  if coalesce(anonymous, true) then
    raise exception 'anonymous_cannot_create_household' using errcode = '42501';
  end if;

  -- The onboarding field's own limit (maxLength 60).
  if char_length(clean) = 0 or char_length(clean) > 60 then
    raise exception 'invalid_household_name' using errcode = '22023';
  end if;

  -- One at a time per account, so a double tap (or two tabs) cannot slip two
  -- households past the "no household yet" check below.
  perform pg_advisory_xact_lock(hashtext('create_household:' || uid::text));

  if not public.is_platform_admin() then
    if not exists (
      select 1 from public.household_access_requests r
       where r.user_id = uid and r.status = 'approved'
    ) then
      raise exception 'household_not_approved' using errcode = '42501';
    end if;
    -- Approval is for one household. More is a conversation, not an API call.
    if exists (select 1 from public.household_members m where m.user_id = uid) then
      raise exception 'already_has_household' using errcode = '42501';
    end if;
  end if;

  -- The answer, when given: who answered and when, as the setter records it.
  insert into public.households (name, owner_auth_id, has_pets, has_pets_set_at, has_pets_set_by)
  values (
    clean, uid, p_has_pets,
    case when p_has_pets is not null then now() end,
    case when p_has_pets is not null then uid end
  )
  returning id into new_id;

  -- Fires household_members_create_profile (106), which gives the new owner
  -- their roster row, exactly as the client insert did.
  insert into public.household_members (household_id, user_id, role)
  values (new_id, uid, 'owner');

  return new_id;
end;
$$;

-- --- 4. set_household_has_pets ---------------------------------------------------------
create or replace function public.set_household_has_pets(p_household uuid, p_on boolean)
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

  -- D4: a pet that isn't archived keeps the switch on. The client says how
  -- many; this is the guarantee.
  if not p_on and exists (
    select 1 from public.task_entities e
     where e.household_id = p_household
       and e.entity_type = 'pet'
       -- jsonb comparison, not a cast: a stray non-boolean value must not
       -- turn the switch into an error.
       and not coalesce(e.metadata -> 'archived' = 'true'::jsonb, false)
  ) then
    raise exception 'has_live_pets' using errcode = '23514';
  end if;

  update public.households
     set has_pets = p_on, has_pets_set_at = now(), has_pets_set_by = auth.uid()
   where id = p_household;
end;
$$;

-- --- 5. Who may call what --------------------------------------------------------------
revoke all on function public.create_household(text, boolean) from public, anon;
grant execute on function public.create_household(text, boolean) to authenticated, service_role;
revoke all on function public.set_household_has_pets(uuid, boolean) from public, anon;
grant execute on function public.set_household_has_pets(uuid, boolean) to authenticated, service_role;
