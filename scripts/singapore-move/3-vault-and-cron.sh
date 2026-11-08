#!/usr/bin/env bash
# Runbook steps 10-11: Vault secrets and nightly jobs on Singapore.
#   project_url                   the new project's URL
#   push_vapid_* (3)              copied from Tokyo, so phones already
#                                 subscribed keep receiving notifications
#   push_dispatch_secret,
#   task_photo_retention_secret   new random values (only the database and
#                                 its own functions use them)
# Values travel through environment variables and psql's \getenv, never as
# command-line arguments, and are never printed.
set -euo pipefail
source "$HOME/.miamus-move.env"

secret_from_old() {
  local value
  # A failed query or a missing secret must stop the move, not write an
  # empty value over the target's (Codex review, PR #16).
  value="$(psql "$OLD_DB_URL" -At -v ON_ERROR_STOP=1 -c "select decrypted_secret from vault.decrypted_secrets where name = '$1'")" \
    || { echo "could not read $1 from Tokyo" >&2; exit 1; }
  [ -n "$value" ] || { echo "$1 is empty or missing in Tokyo" >&2; exit 1; }
  printf '%s' "$value"
}

put_secret() { # name, value (via SECRET_VALUE)
  SECRET_NAME="$1" SECRET_VALUE="$2" psql "$NEW_DB_URL" -q -v ON_ERROR_STOP=1 <<'SQL'
\getenv n SECRET_NAME
\getenv v SECRET_VALUE
delete from vault.secrets where name = :'n';
select vault.create_secret(:'v', :'n') \g /dev/null
SQL
}

put_secret project_url "$NEW_URL"
for name in push_vapid_public_key push_vapid_private_key push_vapid_subject; do
  value="$(secret_from_old "$name")" || exit 1
  put_secret "$name" "$value"
done
put_secret push_dispatch_secret "$(openssl rand -hex 32)"
put_secret task_photo_retention_secret "$(openssl rand -hex 32)"
echo "vault: $(psql "$NEW_DB_URL" -At -c "select string_agg(name, ', ' order by name) from vault.secrets")"

# Nightly jobs: the same names, schedules and commands as Tokyo.
JOBS="$(psql "$OLD_DB_URL" -At -c "select json_agg(json_build_object('n', jobname, 's', schedule, 'c', command)) from cron.job")"
JOBS="$JOBS" psql "$NEW_DB_URL" -q -v ON_ERROR_STOP=1 <<'SQL'
\getenv j JOBS
select cron.unschedule(jobname) from cron.job \g /dev/null
select cron.schedule(x->>'n', x->>'s', x->>'c') from json_array_elements(:'j'::json) x \g /dev/null
SQL
echo "cron: $(psql "$NEW_DB_URL" -At -c "select string_agg(jobname || ' @ ' || schedule, '; ' order by jobname) from cron.job")"
