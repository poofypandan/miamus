-- ============================================================================
-- 172 — Kakak's own voice: a daily character budget (read replies aloud)
-- ============================================================================
-- When the server has Kakak's ElevenLabs voice set up, POST /api/kakak/speak
-- turns one of her replies into speech. Each reply's length counts against
-- the household's day, so a busy home (or a stuck phone) can't run up the
-- ElevenLabs bill; over the budget the phone reads aloud itself, as before.
--
-- NUMBERS ONLY. One new column, kakak_usage.voice_chars: characters spoken
-- per household per Jakarta day. No text, no audio, nothing about what was
-- said. Same table, same retention: the nightly prune_finished_food (126)
-- already deletes kakak_usage rows older than 35 days.
--
-- WHO MAY CALL IT. kakak_voice_spend lets in exactly the people kakak_begin
-- (126) lets in: an admin of the household (a household_members row for
-- auth.uid(), never get_user_household_ids(), which also answers yes for
-- every staff phone), where Kakak is allowed and switched on. It answers in
-- jsonb like kakak_begin, so a refusal is never an error.
--
-- The budget itself comes from the server's env (KAKAK_VOICE_DAILY_CHARS),
-- passed in by the route. A caller who calls this directly with a bigger
-- budget only adds to their own count: audio comes from the route alone.
--
-- Additive: one column with a default, one new function. Rows written by
-- kakak_voice_spend can have calls = 0; kakak_status and kakak_begin read
-- calls only and are unchanged.
-- ============================================================================

alter table public.kakak_usage
  add column if not exists voice_chars int not null default 0 check (voice_chars >= 0);

--   {"ok":true,"chars_left":N}
--   {"ok":false,"reason":"not_admin"|"not_allowed"|"off"|"budget"}
create or replace function public.kakak_voice_spend(p_household uuid, p_chars int, p_daily_chars int)
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

  -- Counted only if it fits, in one statement, so two phones speaking at
  -- once can't both slip past the budget.
  insert into public.kakak_usage as u (household_id, day, voice_chars)
  values (p_household, v_today, p_chars)
  on conflict (household_id, day) do update
    set voice_chars = u.voice_chars + excluded.voice_chars
    where u.voice_chars + excluded.voice_chars <= p_daily_chars
  returning u.voice_chars into v_chars;

  if v_chars is null then
    return jsonb_build_object('ok', false, 'reason', 'budget');
  end if;

  return jsonb_build_object('ok', true, 'chars_left', p_daily_chars - v_chars);
end;
$$;

revoke all on function public.kakak_voice_spend(uuid, int, int) from public, anon;
grant execute on function public.kakak_voice_spend(uuid, int, int) to authenticated;
