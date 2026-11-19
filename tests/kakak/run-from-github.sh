#!/usr/bin/env bash
# The Kakak test run as GitHub starts it (.github/workflows/kakak-eval.yml),
# for when nobody is at the laptop: the dev split on the setup production
# uses (Opus, medium effort), as run-check.sh does it. Never the holdout,
# never photos or voice: only the made-up household and sentences.
#
# It reads these environment values and nothing else:
#
#   ANTHROPIC_API_KEY  the secret ANTHROPIC_EVAL_KEY
#   CASES              empty for the whole dev split, or K131,K146
#   BUDGET             dollars the run may not go past (5 at most)
#   KAKAK_UPLOAD_DIR   where the conversations to keep are put (optional)
#
# - What was typed into GitHub's form is checked before anything is spent,
#   and is only ever handed to the runner as an argument, never run.
# - The key is taken out of this script's own environment at once and given
#   to the runner alone. It is never printed.
# - The budget is a bound: the runner sends no request whose worst case does
#   not fit (budget.ts). The ceiling here keeps a slip of the finger small.
# - Nothing is kept for upload until the run's output has been searched for
#   the key. GitHub hides a secret in logs, but not in a file it uploads.
#
# Ends with 0 when the result is PASSED, 2 when it is NOT PASSED or
# INCOMPLETE, 1 when nothing was run or the output could not be kept.
# tests/unit/kakak-eval-workflow.test.ts plays this script with a stand-in
# for the runner.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

MAX_BUDGET=5

key="${ANTHROPIC_API_KEY:-}"
unset ANTHROPIC_API_KEY
cases="${CASES:-}"
budget="${BUDGET:-2.5}"

work="${RUNNER_TEMP:-$(mktemp -d)}"
log="$work/kakak-run.log"
before="$work/kakak-results.before"
upload="${KAKAK_UPLOAD_DIR:-$work/kakak-upload}"
: > "$log"

# The conversations a run saves, one path a line. Listed before and after,
# so only this run's files are ever looked at or kept.
mkdir -p tests/kakak/results
saved_conversations() {
  find tests/kakak/results -name '*.json' | LC_ALL=C sort
}
saved_conversations > "$before"

if [[ -n "$cases" ]]; then
  title="Kakak test run: chosen sentences only (not a full evaluation)"
else
  title="Kakak test run: the whole dev split"
fi

# The run's front page on GitHub. With an argument: that text and nothing
# from the log.
write_summary() {
  [[ -n "${GITHUB_STEP_SUMMARY:-}" ]] || return 0
  {
    echo "## $title"
    echo
    if [[ -n "${1:-}" ]]; then
      echo "$1"
    elif grep -qE '^RESULT \(' "$log"; then
      grep -E '^RESULT \(' "$log" | while IFS= read -r line; do echo "**${line}**"; done
      echo
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
      echo "**No result.** The run ended before one. Its last lines:"
      echo
      echo '```'
      tail -n 15 "$log"
      echo '```'
    fi
  } >> "$GITHUB_STEP_SUMMARY"
}

refuse() {
  echo "::error::$1 Nothing was run and nothing was spent."
  write_summary "**Nothing was run and nothing was spent.** $1"
  exit 1
}

# Whether a file holds the key. Done inside the shell, so the key is never
# an argument of another program.
holds_key() {
  local content
  content="$(<"$1")"
  [[ "$content" == *"$key"* ]]
}

cases_shape='^K[0-9]{3}(,K[0-9]{3})*$'
budget_shape='^[0-9]{1,2}(\.[0-9]{1,2})?$'

if [[ -z "$key" ]]; then
  refuse "The secret ANTHROPIC_EVAL_KEY is not set (docs/kakak-eval.md, From GitHub)."
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

# Always the dev split, said outright: the holdout stays out of tuning.
args=(--split dev --model opus --effort medium --budget "$budget" --bar)
if [[ -n "$cases" ]]; then
  args+=(--cases "$cases")
fi

status=0
ANTHROPIC_API_KEY="$key" npx tsx tests/kakak/run-test-set.ts "${args[@]}" 2>&1 | tee "$log" || status=$?

# Before anything is kept: the key must be in none of it.
leaked=0
if holds_key "$log"; then
  leaked=1
fi
kept=()
while IFS= read -r file; do
  if holds_key "$file"; then
    leaked=1
  else
    kept+=("$file")
  fi
done < <(saved_conversations | LC_ALL=C comm -13 "$before" -)

if [[ "$leaked" -eq 1 ]]; then
  echo "::error::The key was found in the run's output. Nothing was kept for upload. Delete this key in the Claude Console and make a new one."
  write_summary "**The key was found in the run's output, so nothing was kept or uploaded.** Delete this key in the Claude Console and make a new one."
  exit 1
fi

mkdir -p "$upload"
if [[ "${#kept[@]}" -gt 0 ]]; then
  cp "${kept[@]}" "$upload/"
fi
write_summary
exit "$status"
