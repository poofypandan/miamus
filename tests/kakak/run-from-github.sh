#!/usr/bin/env bash
# The Kakak test run as GitHub starts it (.github/workflows/kakak-eval.yml),
# for when nobody is at the laptop: the dev split on the setup production
# uses (Opus, medium effort), never the holdout, as run-check.sh does it.
#
# It reads three environment values and nothing else:
#
#   ANTHROPIC_API_KEY  the repository secret ANTHROPIC_EVAL_KEY
#   CASES              empty for the whole dev split, or K131,K146
#   BUDGET             dollars at which it stops starting new sentences
#
# What was typed into GitHub's form is checked before anything is spent, and
# is only ever handed to the runner as an argument, never run as a command.
# The budget has a ceiling here, so a slip of the finger cannot spend more.
# The key is never printed.
#
# Ends with 0, with 2 when the pass mark was missed, or with 1 when nothing
# was run. tests/unit/kakak-eval-workflow.test.ts plays this script with a
# stand-in for the runner.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

MAX_BUDGET=5
log="${RUNNER_TEMP:-$(mktemp -d)}/kakak-run.log"
: > "$log"

# The run's front page on GitHub: the result, and the sentences that missed.
write_summary() {
  [[ -n "${GITHUB_STEP_SUMMARY:-}" ]] || return 0
  {
    echo "## Kakak test run"
    echo
    if [[ -n "${1:-}" ]]; then
      echo "$1"
    elif grep -q ' passed, ' "$log"; then
      echo '```'
      awk '/ passed, /{show=1} show' "$log"
      echo '```'
      if grep -qE '^  K[0-9]{3} (fail|MUST-NEVER)' "$log"; then
        echo
        echo "### Sentences that did not pass"
        echo
        echo '```'
        grep -E '^  K[0-9]{3} (fail|MUST-NEVER)' "$log"
        echo '```'
      fi
    else
      echo "The run ended before any result. The log has the reason."
    fi
  } >> "$GITHUB_STEP_SUMMARY"
}

refuse() {
  echo "::error::$1 Nothing was run and nothing was spent."
  write_summary "Nothing was run and nothing was spent. $1"
  exit 1
}

key="${ANTHROPIC_API_KEY:-}"
cases="${CASES:-}"
budget="${BUDGET:-2.5}"

cases_shape='^K[0-9]{3}(,K[0-9]{3})*$'
budget_shape='^[0-9]{1,2}(\.[0-9]{1,2})?$'

if [[ -z "$key" ]]; then
  refuse "The repository secret ANTHROPIC_EVAL_KEY is not set. Add it under Settings, Secrets and variables, Actions (docs/kakak-eval.md, From GitHub)."
fi
if [[ "$key" != sk-ant-* ]]; then
  refuse "ANTHROPIC_EVAL_KEY does not look like an Anthropic key."
fi
if [[ -n "$cases" && ! "$cases" =~ $cases_shape ]]; then
  refuse "The sentences must be written like K131,K146, with no spaces."
fi
if [[ ! "$budget" =~ $budget_shape ]] ||
  ! awk -v b="$budget" -v max="$MAX_BUDGET" 'BEGIN { exit !(b + 0 > 0 && b + 0 <= max + 0) }'; then
  refuse "The budget must be a number of dollars above 0 and at most ${MAX_BUDGET}."
fi

args=(--model opus --effort medium --budget "$budget" --bar)
if [[ -n "$cases" ]]; then
  args+=(--cases "$cases")
fi

status=0
npx tsx tests/kakak/run-test-set.ts "${args[@]}" 2>&1 | tee "$log" || status=$?
write_summary
exit "$status"
