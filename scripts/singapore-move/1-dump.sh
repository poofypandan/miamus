#!/usr/bin/env bash
# Runbook step 8: dump Tokyo (roles, schema, data) into ~/.miamus-move/.
# The dump holds household data: it stays outside the repo and is deleted
# after the move (see 9-cleanup.sh).
set -euo pipefail
source "$HOME/.miamus-move.env"
OUT="$HOME/.miamus-move"; mkdir -p "$OUT"; chmod 700 "$OUT"

supabase db dump --remote="$OLD_DB_URL" -f "$OUT/roles.sql" --role-only
supabase db dump --remote="$OLD_DB_URL" -f "$OUT/schema.sql"
# Excluded from the data:
#   storage.objects        photos are copied through the Storage API (4-copy-photos.mjs),
#                          which writes these rows itself
#   vault.secrets          encrypted per project; re-created by 3-vault-and-cron.sh
#   auth.sessions,
#   auth.refresh_tokens    sessions can't move (new project, new keys); everyone signs in again
supabase db dump --remote="$OLD_DB_URL" -f "$OUT/data.sql" --use-copy --data-only \
  -x storage.objects -x vault.secrets -x auth.sessions -x auth.refresh_tokens
chmod 600 "$OUT"/*.sql
ls -la "$OUT"
