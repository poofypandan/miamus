#!/bin/zsh
# One run of the Kakak test set against the real API, after a change to her
# instructions, her tools or the guide: the whole dev split (never the
# holdout) on the setup production uses, Opus at medium effort. Run by hand;
# costs money (about US$1.30 for 109 sentences; it stops starting new ones at
# US$2.50). See docs/kakak-eval.md, "After a change to her instructions".
#
#   zsh tests/kakak/run-check.sh              the whole dev split
#   zsh tests/kakak/run-check.sh K131,K146    only these sentences
#
# The key is read once without being shown. It lives only inside this
# script's process and is gone when the script ends: never written to disk,
# never printed, never in shell history.
set -u
cd "${0:A:h}/../.." || exit 1

print "Kakak's test run: the dev split on Opus, medium effort (about US\$1.30)."
print "Paste the eval key (it will not show on screen), then press Enter:"
read -rs ANTHROPIC_API_KEY
export ANTHROPIC_API_KEY
print ""
if [[ "$ANTHROPIC_API_KEY" != sk-ant-* ]]; then
  unset ANTHROPIC_API_KEY
  print "That does not look like an Anthropic key. Nothing was run."
  exit 1
fi
print "Key received. Running."

npx tsx tests/kakak/run-test-set.ts --check || { unset ANTHROPIC_API_KEY; exit 1; }
if [[ $# -gt 0 ]]; then
  npx tsx tests/kakak/run-test-set.ts --model opus --effort medium --budget 2.5 --cases "$1"
else
  npx tsx tests/kakak/run-test-set.ts --model opus --effort medium --budget 2.5
fi
run_status=$?

unset ANTHROPIC_API_KEY
print "Done. Every conversation is in tests/kakak/results/."
exit $run_status
