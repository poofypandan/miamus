-- ============================================================================
-- 173 — Kakak's own voice: check the budget without counting
-- ============================================================================
-- POST /api/kakak/speak used to count a reply's characters (kakak_voice_spend,
-- 172) before asking ElevenLabs, so a reply that was refused upstream, or that
-- the phone gave up waiting for, still used the household's day. The route now
-- asks this function first (who may ask, and whether the reply still fits),
-- calls ElevenLabs, and counts with kakak_voice_spend only once the first
-- audio has arrived.
--
-- READ ONLY. No table, no column, no write: the same checks as
-- kakak_voice_spend, answered in the same jsonb shape.
--
-- WHO MAY CALL IT. Exactly the people kakak_voice_spend lets in: an admin of
-- the household (a household_members row for auth.uid(), never
-- get_user_household_ids(), which also answers yes for every staff phone),
-- where Kakak is allowed and switched on.
--
-- Additive: one new function. Deploy before the code that calls it; without
-- it the route keeps the voice off (the phone reads aloud, as before 172).
-- ============================================================================

--   {"ok":true,"chars_left":N}
--   {"ok":false,"reason":"not_admin"|"not_allowed"|"off"|"budget"}
create or replace function public.kakak_voice_check(p_household uuid, p_chars int, p_daily_chars int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_settings public.kakak_settings%rowtype;
  v_used int;
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

  select coalesce(u.voice_chars, 0) into v_used
    from public.kakak_usage u
   where u.household_id = p_household and u.day = v_today;
  v_used := coalesce(v_used, 0);

  if v_used + p_chars > p_daily_chars then
    return jsonb_build_object('ok', false, 'reason', 'budget');
  end if;

  return jsonb_build_object('ok', true, 'chars_left', p_daily_chars - v_used - p_chars);
end;
$$;

revoke all on function public.kakak_voice_check(uuid, int, int) from public, anon;
grant execute on function public.kakak_voice_check(uuid, int, int) to authenticated;
