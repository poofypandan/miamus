#!/usr/bin/env bash
# Runbook step 13: Tokyo and Singapore side by side. Prints counts only.
set -euo pipefail
source "$HOME/.miamus-move.env"
Q="
select 'public.' || table_name,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text
from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'
union all select 'auth.users', count(*)::text from auth.users
union all select 'auth.identities', count(*)::text from auth.identities
union all select 'storage.objects ' || bucket_id, count(*)::text from storage.objects group by bucket_id
union all select 'cron.job', count(*)::text from cron.job
union all select 'vault.secrets', count(*)::text from vault.secrets
union all select 'migrations', coalesce(max(version), 'none') from supabase_migrations.schema_migrations
order by 1"
# Each side must answer: an empty result from a failed query must never read
# as "identical" (Codex review, PR #16).
OLD_COUNTS="$(psql "$OLD_DB_URL" -At -F ' = ' -v ON_ERROR_STOP=1 -c "$Q")" || { echo "Tokyo query failed"; exit 1; }
NEW_COUNTS="$(psql "$NEW_DB_URL" -At -F ' = ' -v ON_ERROR_STOP=1 -c "$Q")" || { echo "Singapore query failed"; exit 1; }
[ -n "$OLD_COUNTS" ] && [ -n "$NEW_COUNTS" ] || { echo "a query returned nothing"; exit 1; }
if diff <(echo "$OLD_COUNTS") <(echo "$NEW_COUNTS"); then
  echo "IDENTICAL (counts)"
else
  echo "^ differences above (< Tokyo, > Singapore)"
  exit 1
fi
