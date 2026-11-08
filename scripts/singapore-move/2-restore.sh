#!/usr/bin/env bash
# Runbook step 9: restore into Singapore, all or nothing (one transaction).
# Triggers are off while the data goes in (session_replication_role), so no
# push is sent and no server-set field is re-stamped.
set -euo pipefail
source "$HOME/.miamus-move.env"
OUT="$HOME/.miamus-move"
psql "$NEW_DB_URL" --single-transaction -v ON_ERROR_STOP=1 -q \
  -f "$OUT/roles.sql" \
  -f "$OUT/schema.sql" \
  -c "set session_replication_role = replica" \
  -f "$OUT/data.sql"
echo "restored"
