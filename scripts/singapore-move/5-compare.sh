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
diff <(psql "$OLD_DB_URL" -At -F ' = ' -c "$Q") <(psql "$NEW_DB_URL" -At -F ' = ' -c "$Q") \
  && echo "IDENTICAL (counts)" || echo "^ differences above (< Tokyo, > Singapore)"
