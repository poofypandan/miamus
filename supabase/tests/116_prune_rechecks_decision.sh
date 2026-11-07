#!/bin/sh
# Migration 116 checks: the 30-day clean-up of rejected household requests.
# LOCAL DATABASE ONLY (supabase start). Needs 113 and 116 applied:
#   sh supabase/tests/116_prune_rechecks_decision.sh
# Prints "ok …" per check and stops at the first "FAIL".
set -e
export PGPASSWORD=postgres
DB="psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t -A -v ON_ERROR_STOP=1"

case "$($DB -c "select inet_server_addr()")" in
  127.0.0.1|::1|172.*|"") ;;
  *) echo "refusing: not the local database"; exit 1 ;;
esac

OLD="00000000-0000-0000-0000-0000000116a1"   # rejected 31 days ago, nothing else  -> deleted
NEW="00000000-0000-0000-0000-0000000116a2"   # rejected 10 days ago                -> kept
MEM="00000000-0000-0000-0000-0000000116a3"   # rejected 31 days ago, now a member  -> request only
RACE="00000000-0000-0000-0000-0000000116a4"  # rejected 31 days ago, approved mid-run -> kept
HH="00000000-0000-0000-0000-0000000116f1"

cleanup() {
  $DB -c "delete from public.household_members where household_id = '$HH';
          delete from public.households where id = '$HH';
          delete from auth.users where id in ('$OLD','$NEW','$MEM','$RACE');" >/dev/null
}
cleanup

$DB >/dev/null <<SQL
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', id || '@test.invalid', false, now(), now()
  from unnest(array['$OLD','$NEW','$MEM','$RACE']::uuid[]) id;
insert into public.household_access_requests (user_id, status, requested_at, decided_at) values
  ('$OLD',  'rejected', now() - interval '40 days', now() - interval '31 days'),
  ('$NEW',  'rejected', now() - interval '20 days', now() - interval '10 days'),
  ('$MEM',  'rejected', now() - interval '40 days', now() - interval '31 days'),
  ('$RACE', 'rejected', now() - interval '40 days', now() - interval '31 days');
insert into public.households (id, name, owner_auth_id) values ('$HH', 'prune test', '$MEM');
insert into public.household_members (household_id, user_id, role) values ('$HH', '$MEM', 'owner');
SQL

# The race: an admin's approval of RACE is in progress (row locked, not yet
# committed) when the clean-up starts. The clean-up must wait for it, see
# "approved", and leave the account alone.
( $DB <<SQL
begin;
update public.household_access_requests
   set status = 'approved', decided_at = now()
 where user_id = '$RACE';
select pg_sleep(3);
commit;
SQL
) >/dev/null &
APPROVER=$!
sleep 1
START=$(date +%s)
$DB -c "select public.prune_household_access_requests();" >/dev/null
WAITED=$(( $(date +%s) - START ))
wait $APPROVER

check() { if [ "$($DB -c "$2")" = "t" ]; then echo "ok  $1"; else echo "FAIL: $1"; cleanup; exit 1; fi; }
check "old rejection: account deleted"            "select not exists (select 1 from auth.users where id = '$OLD')"
check "recent rejection: account and request kept" "select exists (select 1 from public.household_access_requests where user_id = '$NEW')"
check "now a member: account kept"                "select exists (select 1 from auth.users where id = '$MEM')"
check "now a member: request removed"             "select not exists (select 1 from public.household_access_requests where user_id = '$MEM')"
check "approved mid-run: account kept"            "select exists (select 1 from auth.users where id = '$RACE')"
check "approved mid-run: still approved"          "select exists (select 1 from public.household_access_requests where user_id = '$RACE' and status = 'approved')"
if [ "$WAITED" -ge 1 ]; then echo "ok  clean-up waited for the approval (${WAITED}s)"; else echo "FAIL: clean-up did not wait"; cleanup; exit 1; fi

cleanup
echo "all checks passed"
