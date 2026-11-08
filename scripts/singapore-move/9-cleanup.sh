#!/usr/bin/env bash
# After the move is confirmed: delete the local dump (household data) and the
# connection file (passwords). Run only when Singapore is verified.
set -euo pipefail
rm -rf "$HOME/.miamus-move"
rm -f "$HOME/.miamus-move.env"
echo "local dump and connection file deleted"
