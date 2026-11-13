#!/bin/zsh
# The 26 demo-critical dev cases against the real API, run by hand; costs
# money (at most US$2 per run, four runs). Opus at low and medium effort for
# the demo, then Sonnet and Haiku at low effort for a cost comparison only.
#
#   zsh tests/kakak/run-demo-check.sh
#
# The key is read once without being shown. It lives only inside this
# script's process and is gone when the script ends: never written to disk,
# never printed, never in shell history.
set -u
cd "${0:A:h}/../.." || exit 1

CASES=K001,K004,K018,K021,K027,K032,K038,K039,K086,K091,K101,K102,K103,K104,K105,K106,K107,K108,K109,K110,K111,K112,K113,K114,K115,K116

print "Paste the eval key (it will not show on screen), then press Enter:"
read -rs ANTHROPIC_API_KEY
export ANTHROPIC_API_KEY
print ""
if [[ "$ANTHROPIC_API_KEY" != sk-ant-* ]]; then
  unset ANTHROPIC_API_KEY
  print "That does not look like an Anthropic key. Nothing was run."
  exit 1
fi
print "Key received. Running four passes of 26 cases."

npx tsx tests/kakak/run-test-set.ts --check || { unset ANTHROPIC_API_KEY; exit 1; }

npx tsx tests/kakak/run-test-set.ts --model opus --effort low --cases "$CASES" --budget 2
npx tsx tests/kakak/run-test-set.ts --model opus --effort medium --cases "$CASES" --budget 2
# Cost comparison only: the demo stays on Opus.
npx tsx tests/kakak/run-test-set.ts --model sonnet --effort low --cases "$CASES" --budget 2
npx tsx tests/kakak/run-test-set.ts --model haiku --effort low --cases "$CASES" --budget 2

unset ANTHROPIC_API_KEY
print "Done. Each pass prints its table; details are in tests/kakak/results/."
