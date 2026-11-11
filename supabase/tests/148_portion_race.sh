#!/bin/sh
# Migration 148 checks: "Ate 1 portion" from several phones at the same moment
# takes one portion per tap, the same tap sent twice at once (a retry racing
# its own first try) takes one, the last portion is finished once, and an
# undo puts back exactly what its tap took (Codex, PR #93).
# LOCAL DATABASE ONLY (supabase start). Needs 148 applied:
#   sh supabase/tests/148_portion_race.sh
# Prints "ok …" per check and stops at the first "FAIL". Cleans up after itself.
set -e
export PGPASSWORD=postgres
DB="psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t -A -v ON_ERROR_STOP=1"

case "$($DB -c "select inet_server_addr()")" in
  127.0.0.1|::1|172.*|"") ;;
  *) echo "refusing: not the local database"; exit 1 ;;
esac

HH="00000000-0000-0000-0000-0000000148f8"
OWNER="00000000-0000-0000-0000-0000000148a8"
PHONE="00000000-0000-0000-0000-0000000148b8"
FOOD="00000000-0000-0000-0000-0000000148d8"

cleanup() {
  $DB -c "delete from public.households where id = '$HH';
          delete from auth.users where id in ('$OWNER','$PHONE');" >/dev/null
}
cleanup
trap cleanup EXIT

$DB >/dev/null <<SQL
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at) values
  ('$OWNER', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'race148@test.invalid', false, now(), now()),
  ('$PHONE', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now(), now());
insert into public.households (id, name, owner_auth_id) values ('$HH', 'portion race', '$OWNER');
insert into public.household_members (household_id, user_id, role) values ('$HH', '$OWNER', 'owner');
insert into public.device_sessions (user_id, household_id) values ('$PHONE', '$HH');
insert into public.food_items (id, household_id, name, kept_in, portions) values ('$FOOD', '$HH', 'Rendang', 'fridge', 10);
SQL

# Each call as its own session: the given user, the given op id.
tap() { # user op
  $DB >/dev/null <<SQL
select set_config('request.jwt.claims', json_build_object('sub', '$1', 'role', 'authenticated')::text, false);
set role authenticated;
select public.eat_food_portion('$FOOD', '$2');
SQL
}
undo() { # user op
  $DB >/dev/null <<SQL
select set_config('request.jwt.claims', json_build_object('sub', '$1', 'role', 'authenticated')::text, false);
set role authenticated;
select public.undo_food_portion('$FOOD', '$2');
SQL
}
portions() { $DB -c "select portions || ' ' || coalesce(outcome, '-') from public.food_items where id = '$FOOD'"; }
op() { echo "00000000-0000-0000-0000-00000148e8$1"; }

# Six taps at once, three from the owner's phone and three from the staff phone.
PIDS=""
for i in 01 02 03 04 05 06; do
  case $i in 0[246]) who=$OWNER ;; *) who=$PHONE ;; esac
  tap "$who" "$(op $i)" &
  PIDS="$PIDS $!"
done
for p in $PIDS; do wait "$p"; done
[ "$(portions)" = "4 -" ] && echo "ok  six taps at once from two phones: 10 → 4, none lost" || { echo "FAIL: six taps left '$(portions)'"; exit 1; }

# One tap and its retry, sent at the same moment: one portion.
tap "$PHONE" "$(op 07)" & A=$!
tap "$PHONE" "$(op 07)" & B=$!
wait $A; wait $B
[ "$(portions)" = "3 -" ] && echo "ok  a tap and its retry racing each other take one portion: 4 → 3" || { echo "FAIL: retry race left '$(portions)'"; exit 1; }

# Two undos of that tap at once: one portion back.
undo "$PHONE" "$(op 07)" & A=$!
undo "$OWNER" "$(op 07)" & B=$!
wait $A; wait $B
[ "$(portions)" = "4 -" ] && echo "ok  two undos of the same tap at once put back one portion: 3 → 4" || { echo "FAIL: undo race left '$(portions)'"; exit 1; }

# Down to 1, then three phones tap the last portion at once.
tap "$OWNER" "$(op 08)"; tap "$OWNER" "$(op 09)"; tap "$OWNER" "$(op 10)"
PIDS=""
for i in 11 12 13; do
  tap "$PHONE" "$(op $i)" &
  PIDS="$PIDS $!"
done
for p in $PIDS; do wait "$p"; done
[ "$(portions)" = "0 eaten" ] && echo "ok  three phones on the last portion: finished as Eaten once, never below 0" || { echo "FAIL: last portion left '$(portions)'"; exit 1; }
took=$($DB -c "select string_agg(consumed::text, '' order by op_id) from public.food_portion_ops where op_id in ('$(op 11)','$(op 12)','$(op 13)')")
[ "$(echo "$took" | tr -cd 1 | wc -c | tr -d ' ')" = "1" ] && echo "ok  ... exactly one of the three took it" || { echo "FAIL: consumed was '$took'"; exit 1; }

# All three undo at once: only the one that took it puts it back.
PIDS=""
for i in 11 12 13; do
  undo "$PHONE" "$(op $i)" &
  PIDS="$PIDS $!"
done
for p in $PIDS; do wait "$p"; done
[ "$(portions)" = "1 -" ] && echo "ok  their three undos at once: one portion back, not finished, nothing invented" || { echo "FAIL: undos left '$(portions)'"; exit 1; }

# A tap and its undo racing: either order, they cancel out.
tap "$PHONE" "$(op 14)" & A=$!
undo "$PHONE" "$(op 14)" & B=$!
wait $A; wait $B
[ "$(portions)" = "1 -" ] && echo "ok  a tap and its own undo racing cancel out, whichever lands first" || { echo "FAIL: tap/undo race left '$(portions)'"; exit 1; }

# Phone A takes the last portion; phone B then chooses Eaten itself (its own
# transaction); A's undo must keep B's choice (Codex, PR #93).
tap "$PHONE" "$(op 15)"
[ "$(portions)" = "0 eaten" ] || { echo "FAIL: last portion left '$(portions)'"; exit 1; }
$DB >/dev/null <<SQL
select set_config('request.jwt.claims', json_build_object('sub', '$OWNER', 'role', 'authenticated')::text, false);
set role authenticated;
update public.food_items set outcome = 'eaten', finished_by = null where id = '$FOOD';
SQL
undo "$PHONE" "$(op 15)"
[ "$(portions)" = "0 eaten" ] && echo "ok  an explicit Eaten after the last portion wins over that tap's undo" || { echo "FAIL: undo after explicit Eaten left '$(portions)'"; exit 1; }
