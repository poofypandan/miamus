// One setup played over the chosen sentences, with the three reasons a run
// ends early: the budget, a refused key, an API that has stopped answering.
// Used by run-test-set.ts; tests/unit/kakak-eval-run.test.ts plays it against
// a fake API.

import type Anthropic from "@anthropic-ai/sdk";
import type { KakakHousehold } from "@/lib/kakak/household";
import { stoppedByBudget, type Budget } from "./budget";
import { gradeCase } from "./grade";
import { keyWasRefused, type CaseOutcome, type RunStop } from "./report";
import { playConversation, pool, type Variant } from "./run-core";
import type { KakakCase } from "./types";

/** This many sentences in a row with no answer from the API ends the run: it would only fail the rest the same way. */
export const API_ERRORS_IN_A_ROW = 5;

export interface RunResult {
  /** The sentences that were played, in id order. One cut short by the budget is not among them. */
  outcomes: CaseOutcome[];
  /** Why the run ended before its last sentence, if it did. */
  stopped?: RunStop;
  /** The last error the API gave, for the report. */
  lastApiError?: string;
}

export async function playRun(options: {
  client: Anthropic;
  budget: Budget;
  variant: Variant;
  household: KakakHousehold;
  cases: KakakCase[];
  concurrency: number;
  /** One line per sentence, as it ends. */
  say?: (line: string) => void;
}): Promise<RunResult> {
  const { client, budget, variant, household, cases, concurrency, say = () => {} } = options;
  const outcomes: CaseOutcome[] = [];
  let stopped: RunStop | undefined;
  let lastApiError: string | undefined;
  let errorsInARow = 0;

  const play = async (kakakCase: KakakCase) => {
    if (stopped) return;
    if (budget.stopped) {
      stopped = "budget";
      return;
    }
    const conversation = await playConversation(client, variant, household, kakakCase, kakakCase.sentence);
    if (stoppedByBudget(conversation.error)) {
      // Cut short by the budget: not a played sentence, so not a result.
      stopped ??= "budget";
      return;
    }
    if (conversation.error?.startsWith("API error")) {
      lastApiError = conversation.error;
      errorsInARow += 1;
      if (keyWasRefused(conversation.apiStatus)) stopped ??= "key";
      else if (errorsInARow >= API_ERRORS_IN_A_ROW) stopped ??= "api";
    } else {
      errorsInARow = 0;
    }
    const grade = gradeCase(household, kakakCase, conversation.turns, conversation.rejected);
    outcomes.push({
      kakakCase: {
        id: kakakCase.id,
        category: kakakCase.category,
        lang: kakakCase.lang,
        ownerLocale: kakakCase.ownerLocale,
        holdout: kakakCase.holdout,
        sentence: kakakCase.sentence,
      },
      conversation,
      grade,
    });
    const mark = grade.pass ? "pass" : grade.mustNever.length ? "MUST-NEVER" : "fail";
    say(`  ${kakakCase.id} ${mark}${grade.pass ? "" : `: ${[...grade.mustNever, ...grade.failures].join(" · ")}`}`);
  };

  // The first sentence goes alone. A key that is refused shows after one
  // request instead of one per worker, and the cached instructions are
  // written once instead of several times side by side.
  const [first, ...rest] = cases;
  if (first) await play(first);
  await pool(rest, concurrency, play);
  if (!stopped && budget.stopped) stopped = "budget";
  outcomes.sort((a, b) => a.kakakCase.id.localeCompare(b.kakakCase.id));
  return { outcomes, stopped, lastApiError };
}
