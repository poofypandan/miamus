#!/bin/zsh
# The Kakak model comparison against the real API, run by hand; costs money
# (a US$6 total budget across every setup). The whole dev split for each
# setup, never the holdout: Opus low and medium once, Sonnet low, Haiku low
# and Haiku medium three times each, then one summary table.
# See tests/kakak/run-comparison.ts.
#
#   zsh tests/kakak/run-comparison.sh
#
# The key is read once without being shown. It lives only inside this
# script's process and is gone when the script ends: never written to disk,
# never printed, never in shell history.
set -u
cd "${0:A:h}/../.." || exit 1

print "Paste the eval key (it will not show on screen), then press Enter:"
read -rs ANTHROPIC_API_KEY
export ANTHROPIC_API_KEY
print ""
if [[ "$ANTHROPIC_API_KEY" != sk-ant-* ]]; then
  unset ANTHROPIC_API_KEY
  print "That does not look like an Anthropic key. Nothing was run."
  exit 1
fi
print "Key received. Running every setup back to back (US\$6 total budget)."

npx tsx tests/kakak/run-test-set.ts --check || { unset ANTHROPIC_API_KEY; exit 1; }
npx tsx tests/kakak/run-comparison.ts --budget 6
run_status=$?

unset ANTHROPIC_API_KEY
print "Done. Details are in tests/kakak/results/."
exit $run_status
