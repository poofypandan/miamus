-- ============================================================================
-- 104 — A chore is completed with both proof photos, or not at all (Phase 127)
-- ============================================================================
-- "LT2 Master Lounge - Lap ambalan meja TV dan rak2" was completed on
-- 2026-10-04 with one photo, in photo_url only — no before shot, and not even
-- the after_photo_url every completion since Phase 100 writes. The app's only
-- completion path (FinishChoreSheet) cannot produce that row, so it came from
-- a phone still running a bundle from before Phase 100: an installed PWA can
-- sit suspended for days without reloading its JavaScript.
--
-- That is why the rule lives here as well as on the button. The sheet now
-- refuses to submit without both photos, but a client is only as current as
-- the last time it reloaded; the database is the one place every version of
-- the app has to pass through.
--
-- WHAT IS ENFORCED. Becoming completed — an insert as completed, or an
-- update from any other status to completed — needs both before_photo_url and
-- after_photo_url. Deliberately not a CHECK constraint: every chore finished
-- before before/after existed has photo_url alone, and a CHECK would be
-- re-tested on any later update of those rows (renaming one, say) and refuse
-- it. This looks only at the transition, so history stays as it was.
--
-- What the stale phone sees: its "Selesai" fails with its usual "Gagal
-- menyimpan" toast, and reopening the app loads the current version.
--
-- Additive only: one function, one trigger.
-- ============================================================================

create or replace function public.require_chore_proof_photos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'completed'
     and (tg_op = 'INSERT' or old.status is distinct from 'completed')
     and (new.before_photo_url is null or new.after_photo_url is null)
  then
    raise exception 'A chore is completed with both a before and an after photo'
      using errcode = '23514',
            hint = 'Reload the app: this version may predate before/after photos.';
  end if;
  return new;
end;
$$;

drop trigger if exists household_tasks_require_proof_photos on public.household_tasks;
create trigger household_tasks_require_proof_photos
  before insert or update of status on public.household_tasks
  for each row execute function public.require_chore_proof_photos();
