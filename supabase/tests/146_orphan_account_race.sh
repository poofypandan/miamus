#!/bin/sh
# Migration 146 checks: the 30-day deletion of accounts with no household (M6)
# loses every race to the person coming back (Codex, PR #91).
# LOCAL DATABASE ONLY (supabase start). Needs 146 applied:
#   sh supabase/tests/146_orphan_account_race.sh
# Prints "ok …" per check and stops at the first "FAIL".
set -e
export PGPASSWORD=postgres
DB="psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t -A -v ON_ERROR_STOP=1"

case "$($DB -c "select inet_server_addr()")" in
  127.0.0.1|::1|172.*|"") ;;
  *) echo "refusing: not the local database"; exit 1 ;;
esac

GONE="00000000-0000-0000-0000-0000000146d1"   # due, nothing else                    -> deleted
ASKS="00000000-0000-0000-0000-0000000146d2"   # due, re-asks (update) mid-run          -> kept
NEW="00000000-0000-0000-0000-0000000146d3"    # due, first request (insert) mid-run    -> kept
JOINS="00000000-0000-0000-0000-0000000146d4"  # due, joins a household mid-run         -> kept
HH="00000000-0000-0000-0000-0000000146df"
OWNER="00000000-0000-0000-0000-0000000146de"

cleanup() {
  $DB -c "delete from public.household_members where household_id = '$HH';
          delete from public.households where id = '$HH';
          delete from auth.users where id in ('$GONE','$ASKS','$NEW','$JOINS','$OWNER');" >/dev/null
}
cleanup

$DB >/dev/null <<SQL
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', id || '@test.invalid', false, now(), now()
  from unnest(array['$GONE','$ASKS','$NEW','$JOINS','$OWNER']::uuid[]) id;
insert into public.households (id, name, owner_auth_id) values ('$HH', 'race test', '$OWNER');
insert into public.household_members (household_id, user_id, role) values ('$HH', '$OWNER', 'owner');
-- ASKS once had a household; its approved request is old.
insert into public.household_access_requests (user_id, status, requested_at, decided_at)
values ('$ASKS', 'approved', now() - interval '90 days', now() - interval '89 days');
-- All four lost their last household 31 days ago.
insert into public.account_deletions (user_id, since, due_at)
select id, now() - interval '31 days', now() - interval '1 day'
  from unnest(array['$GONE','$ASKS','$NEW','$JOINS']::uuid[]) id;
SQL

# Three people come back while the job runs, each in a transaction that is
# still open (locks held, nothing committed) when the job reaches them.
( $DB <<SQL
begin;
update public.household_access_requests set status = 'pending', requested_at = now(), decided_at = null
 where user_id = '$ASKS';
select pg_sleep(3);
commit;
SQL
) >/dev/null &
P1=$!
( $DB <<SQL
begin;
insert into public.household_access_requests (user_id, status, requested_at) values ('$NEW', 'pending', now());
select pg_sleep(3);
commit;
SQL
) >/dev/null &
P2=$!
( $DB <<SQL
begin;
insert into public.household_members (household_id, user_id, role) values ('$HH', '$JOINS', 'owner');
select pg_sleep(3);
commit;
SQL
) >/dev/null &
P3=$!
sleep 1
START=$(date +%s)
REMOVED=$($DB -c "select public.delete_orphaned_accounts();")
WAITED=$(( $(date +%s) - START ))
wait $P1 $P2 $P3

check() { if [ "$($DB -c "$2")" = "t" ]; then echo "ok  $1"; else echo "FAIL: $1"; cleanup; exit 1; fi; }

check "the job waited for the open transactions (${WAITED}s)" "select $WAITED >= 1"
check "only the account with nothing going on was deleted (removed $REMOVED)" "select $REMOVED = 1"
check "due, nothing else: deleted" "select not exists (select 1 from auth.users where id = '$GONE')"
check "re-asked mid-run (update): kept, with its pending request" \
  "select exists (select 1 from auth.users where id = '$ASKS')
      and exists (select 1 from public.household_access_requests where user_id = '$ASKS' and status = 'pending')"
check "first request mid-run (insert): kept, with its request" \
  "select exists (select 1 from auth.users where id = '$NEW')
      and exists (select 1 from public.household_access_requests where user_id = '$NEW')"
check "joined a household mid-run: kept, still a member" \
  "select exists (select 1 from auth.users where id = '$JOINS')
      and exists (select 1 from public.household_members where user_id = '$JOINS')"
check "the kept accounts are no longer marked for deletion" \
  "select not exists (select 1 from public.account_deletions where user_id in ('$ASKS','$NEW','$JOINS'))"

cleanup
echo "all checks passed"
