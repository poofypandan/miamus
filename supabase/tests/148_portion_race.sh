#!/bin/sh
# Migration 148 checks: "Ate 1 portion" from several phones at the same moment
# takes one portion per tap, and the same tap sent twice at once (a retry
# racing its own first try) takes one (Codex, PR #93).
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
RETRY_OP="00000000-0000-0000-0000-00000148e800"

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

# Each tap as its own session: the given user, its own op id.
tap() { # user op
  $DB >/dev/null <<SQL
select set_config('request.jwt.claims', json_build_object('sub', '$1', 'role', 'authenticated')::text, false);
set role authenticated;
select public.eat_food_portion('$FOOD', 1, '$2');
SQL
}

# Six taps at once, three from the owner's phone and three from the staff phone.
PIDS=""
for i in 1 2 3 4 5 6; do
  if [ $((i % 2)) -eq 0 ]; then who=$OWNER; else who=$PHONE; fi
  tap "$who" "00000000-0000-0000-0000-00000148e80$i" &
  PIDS="$PIDS $!"
done
for p in $PIDS; do wait "$p"; done

left=$($DB -c "select portions from public.food_items where id = '$FOOD'")
[ "$left" = "4" ] && echo "ok  six taps at once from two phones: 10 → 4, none lost" || { echo "FAIL: six taps left $left, not 4"; exit 1; }

# One tap and its retry, sent at the same moment: one portion.
tap "$PHONE" "$RETRY_OP" & A=$!
tap "$PHONE" "$RETRY_OP" & B=$!
wait $A; wait $B
left=$($DB -c "select portions from public.food_items where id = '$FOOD'")
[ "$left" = "3" ] && echo "ok  a tap and its retry racing each other take one portion: 4 → 3" || { echo "FAIL: retry race left $left, not 3"; exit 1; }

# A retry long after: nothing.
tap "$PHONE" "$RETRY_OP"
left=$($DB -c "select portions from public.food_items where id = '$FOOD'")
[ "$left" = "3" ] && echo "ok  the same tap replayed later changes nothing" || { echo "FAIL: replay left $left, not 3"; exit 1; }

# The last three at once: finished as Eaten exactly once, never below 0.
PIDS=""
for i in 7 8 9; do
  tap "$OWNER" "00000000-0000-0000-0000-00000148e80$i" &
  PIDS="$PIDS $!"
done
for p in $PIDS; do wait "$p"; done
row=$($DB -c "select portions || ' ' || coalesce(outcome, '-') from public.food_items where id = '$FOOD'")
[ "$row" = "0 eaten" ] && echo "ok  the last three at once: 0 portions, finished as Eaten" || { echo "FAIL: last taps left '$row'"; exit 1; }
