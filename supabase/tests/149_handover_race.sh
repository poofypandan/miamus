#!/bin/sh
# Migration 149 checks: a hand-over racing a Selesai never leaves a stretch
# open on a finished walk-in (Codex, PR #94). Two sessions, committed rows:
#   1. Selesai first (still open, row held for 5 s), hand-over 1 s in: the
#      hand-over waits, then is refused (supervision_visit_finished).
#   2. Hand-over first (still open), Selesai meanwhile: Selesai waits, then
#      closes the new person's stretch too.
# LOCAL DATABASE ONLY (supabase start). Needs 149 applied:
#   sh supabase/tests/149_handover_race.sh
# Prints "ok …" per check and stops at the first "FAIL". Cleans up after itself.
set -e
export PGPASSWORD=postgres
DB="psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t -A -v ON_ERROR_STOP=1"

case "$($DB -c "select inet_server_addr()")" in
  127.0.0.1|::1|172.*|"") ;;
  *) echo "refusing: not the local database"; exit 1 ;;
esac

HH="00000000-0000-0000-0000-0000000149f7"
OWNER="00000000-0000-0000-0000-0000000149a7"
PHONE="00000000-0000-0000-0000-0000000149b7"
ARI="00000000-0000-0000-0000-0000000149c7"
SYAM="00000000-0000-0000-0000-0000000149c8"
REPAIR="00000000-0000-0000-0000-0000000149d7"
V1="00000000-0000-0000-0000-00000149e701"
V2="00000000-0000-0000-0000-00000149e702"
PHOTO="http://x/storage/v1/object/public/household-logs/$HH/repairs/$REPAIR"
AS_PHONE="set local role authenticated; select set_config('request.jwt.claims', '{\"sub\":\"$PHONE\",\"role\":\"authenticated\"}', true);"

cleanup() {
  $DB -c "delete from public.repairs where household_id = '$HH';
          delete from public.device_sessions where household_id = '$HH';
          delete from public.staff_profiles where household_id = '$HH';
          delete from public.household_members where household_id = '$HH';
          delete from public.households where id = '$HH';
          delete from auth.users where id in ('$OWNER', '$PHONE');" >/dev/null
}
trap cleanup EXIT
cleanup

$DB >/dev/null <<SQL
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at) values
  ('$OWNER', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'race149@test.invalid', false, now(), now()),
  ('$PHONE', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now(), now());
insert into public.households (id, name, owner_auth_id) values ('$HH', 'race test 149', '$OWNER');
insert into public.household_members (household_id, user_id, role) values ('$HH', '$OWNER', 'owner');
insert into public.device_sessions (user_id, household_id) values ('$PHONE', '$HH');
insert into public.staff_profiles (id, household_id, name) values ('$ARI', '$HH', 'Ari'), ('$SYAM', '$HH', 'Syam');
insert into public.repairs (id, household_id, title, status) values ('$REPAIR', '$HH', 'Keran bocor', 'open');
SQL

# The first walk-in, logged by the phone in Ari's name: her stretch opens.
$DB >/dev/null <<SQL
begin;
$AS_PHONE
insert into public.repair_visits (id, household_id, repair_id, logged_by_staff, before_photo_url)
values ('$V1', '$HH', '$REPAIR', '$ARI', '$PHOTO/b-1.webp');
commit;
SQL

# ---- 1. Selesai first, hand-over meanwhile ----------------------------------------
( $DB <<SQL
begin;
$AS_PHONE
update public.repair_visits set after_photo_url = '$PHOTO/a-1.webp', left_phone_at = now(), outcome = 'fixed'
 where id = '$V1';
select pg_sleep(5);
commit;
SQL
) >/dev/null &
P1=$!
sleep 1
OUT=$($DB 2>&1 <<SQL || true
begin;
$AS_PHONE
insert into public.repair_supervision (household_id, visit_id, staff_id) values ('$HH', '$V1', '$SYAM');
commit;
SQL
)
wait $P1
case "$OUT" in
  *supervision_visit_finished*) echo "ok  a hand-over racing Selesai waits for it, then is refused" ;;
  *) echo "FAIL: the racing hand-over was not refused: $OUT"; exit 1 ;;
esac
[ "$($DB -c "select count(*) from public.repair_supervision where visit_id = '$V1' and ended_at is null")" = "0" ] \
  && echo "ok  ... and no stretch is left open on the finished walk-in" \
  || { echo "FAIL: a stretch is open on a finished walk-in"; exit 1; }

# ---- 2. Hand-over first, Selesai meanwhile ------------------------------------------
$DB >/dev/null <<SQL
begin;
$AS_PHONE
insert into public.repair_visits (id, household_id, repair_id, logged_by_staff, before_photo_url)
values ('$V2', '$HH', '$REPAIR', '$ARI', '$PHOTO/b-2.webp');
commit;
SQL
( $DB <<SQL
begin;
$AS_PHONE
insert into public.repair_supervision (household_id, visit_id, staff_id) values ('$HH', '$V2', '$SYAM');
select pg_sleep(5);
commit;
SQL
) >/dev/null &
P2=$!
sleep 1
$DB >/dev/null <<SQL
begin;
$AS_PHONE
update public.repair_visits set after_photo_url = '$PHOTO/a-2.webp', left_phone_at = now(), outcome = 'fixed'
 where id = '$V2';
commit;
SQL
wait $P2
[ "$($DB -c "select count(*) from public.repair_supervision where visit_id = '$V2' and ended_at is null")" = "0" ] \
  && echo "ok  Selesai racing a hand-over waits for it, then closes the new stretch too" \
  || { echo "FAIL: Selesai left the handed-over stretch open"; exit 1; }
[ "$($DB -c "select count(*) from public.repair_supervision s join public.repair_visits v on v.id = s.visit_id
             where s.visit_id = '$V2' and s.staff_id = '$SYAM' and s.ended_at = v.left_at")" = "1" ] \
  && echo "ok  ... Syam's stretch ends when the walk-in did" \
  || { echo "FAIL: Syam's stretch doesn't end at the walk-in's leaving time"; exit 1; }
