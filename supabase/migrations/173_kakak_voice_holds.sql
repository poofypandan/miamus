-- ============================================================================
-- 173 — Kakak's own voice: hold the characters, give them back if no audio
-- ============================================================================
-- POST /api/kakak/speak used to count a reply's characters (kakak_voice_spend,
-- 172) before asking ElevenLabs and never gave them back, so a reply that was
-- refused upstream, or that the phone gave up waiting for, still used the
-- household's day.
--
-- Now the route RESERVES the characters before asking ElevenLabs (atomic, so
-- two phones at once can't both pass the budget, and nothing is generated
-- past it) and RELEASES them when no audio came. The reservation is a hold
-- row whose random id goes back to the server only, never to the phone; the
-- release needs that id, so a phone can't hand itself its budget back.
--
-- NUMBERS ONLY. kakak_voice_holds keeps a household id, a day, a count of
-- characters and when: no text, no audio, nothing about what was said. A
-- hold is deleted when released, and every hold older than a day is deleted
-- by the next reservation. No policies: only these functions read it.
--
-- WHO MAY CALL THEM. Exactly the people kakak_voice_spend lets in: an admin
-- of the household (a household_members row for auth.uid(), never
-- get_user_household_ids(), which also answers yes for every staff phone),
-- where Kakak is allowed and switched on. A release also needs the hold to
-- be that household's, unreleased, and under ten minutes old.
--
-- Additive: one new table, two new functions; 172 is unchanged. Deploy
-- before the code that calls them; without them the route keeps the voice
-- off (the phone reads aloud, as before 172).
-- ============================================================================

create table if not exists public.kakak_voice_holds (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  day date not null,
  chars int not null check (chars > 0),
  created_at timestamptz not null default now()
);

create index if not exists kakak_voice_holds_created_idx on public.kakak_voice_holds (created_at);

alter table public.kakak_voice_holds enable row level security;
revoke all on table public.kakak_voice_holds from public, anon, authenticated;

--   {"ok":true,"hold":"<uuid>","chars_left":N}
--   {"ok":false,"reason":"not_admin"|"not_allowed"|"off"|"budget"}
create or replace function public.kakak_voice_reserve(p_household uuid, p_chars int, p_daily_chars int)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_settings public.kakak_settings%rowtype;
  v_chars int;
  v_hold uuid;
begin
  if v_uid is null or not exists (select 1 from public.household_members m
                                   where m.user_id = v_uid and m.household_id = p_household) then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;
  if p_chars is null or p_chars < 1 or p_chars > 5000
     or p_daily_chars is null or p_daily_chars < 0 or p_daily_chars > 1000000 then
    raise exception 'bad_value' using errcode = '22023';
  end if;

  select * into v_settings from public.kakak_settings s where s.household_id = p_household;
  if not found or not v_settings.allowed then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;
  if not v_settings.enabled then
    return jsonb_build_object('ok', false, 'reason', 'off');
  end if;
  if p_chars > p_daily_chars then
    return jsonb_build_object('ok', false, 'reason', 'budget');
  end if;

  -- Counted only if it fits, in one statement (as kakak_voice_spend).
  insert into public.kakak_usage as u (household_id, day, voice_chars)
  values (p_household, v_today, p_chars)
  on conflict (household_id, day) do update
    set voice_chars = u.voice_chars + excluded.voice_chars
    where u.voice_chars + excluded.voice_chars <= p_daily_chars
  returning u.voice_chars into v_chars;

  if v_chars is null then
    return jsonb_build_object('ok', false, 'reason', 'budget');
  end if;

  delete from public.kakak_voice_holds where created_at < now() - interval '1 day';
  insert into public.kakak_voice_holds (household_id, day, chars)
  values (p_household, v_today, p_chars)
  returning id into v_hold;

  return jsonb_build_object('ok', true, 'hold', v_hold, 'chars_left', p_daily_chars - v_chars);
end;
$$;

--   {"ok":true}  or  {"ok":false}
create or replace function public.kakak_voice_release(p_household uuid, p_hold uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_hold public.kakak_voice_holds%rowtype;
begin
  if v_uid is null or not exists (select 1 from public.household_members m
                                   where m.user_id = v_uid and m.household_id = p_household) then
    return jsonb_build_object('ok', false);
  end if;

  delete from public.kakak_voice_holds h
   where h.id = p_hold and h.household_id = p_household
     and h.created_at > now() - interval '10 minutes'
  returning * into v_hold;
  if not found then
    return jsonb_build_object('ok', false);
  end if;

  update public.kakak_usage u
     set voice_chars = greatest(0, u.voice_chars - v_hold.chars)
   where u.household_id = v_hold.household_id and u.day = v_hold.day;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.kakak_voice_reserve(uuid, int, int) from public, anon;
grant execute on function public.kakak_voice_reserve(uuid, int, int) to authenticated;
revoke all on function public.kakak_voice_release(uuid, uuid) from public, anon;
grant execute on function public.kakak_voice_release(uuid, uuid) to authenticated;
