// The model comparison: every setup over the whole dev split, back to back,
// within one total budget. Run by hand; costs money (about US$6); never in CI.
// The holdout split is never played here.
//
//   zsh tests/kakak/run-comparison.sh            (reads the key once, hidden)
//   ANTHROPIC_API_KEY=… npx tsx tests/kakak/run-comparison.ts [--budget 6] [--concurrency 4]
//
// Setups (the design lead's measurement rules, 2026-11-13): Opus low and
// medium once; Sonnet low, Haiku low and Haiku medium three times each. A
// setup the API refuses (a 400 for its thinking, effort or tool settings) is
// recorded as refused: settings are never changed to make it run. Repeated
// setups report the must-nevers of their worst run.
//
// Each case is graded on what the owner would see (after the route's guard);
// the model's own text before the guard is counted as raw leaks, a rate.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { KakakHousehold } from "@/lib/kakak/household";
import { gradeCase } from "./grade";
import {
  COMPARISON_HEADER,
  comparisonRow,
  groupRates,
  summarise,
  type CaseOutcome,
  type RunSummary,
} from "./report";
import { apiPressure, checkVariant, makeClient, MODELS, playConversation, pool, type Variant } from "./run-core";
import { checkTestSet } from "./test-set-check";
import type { KakakTestSet } from "./types";

const here = dirname(fileURLToPath(import.meta.url));

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

interface Setup {
  label: string;
  variant: Variant;
  runs: number;
  /** Share of the total budget for each run, in dollars at the default US$6. */
  budgetPerRunUsd: number;
}

/** About US$6 in all; Opus gets the most, as the demo runs on it. */
const SETUPS: Setup[] = [
  { label: "opus-low", variant: { model: MODELS.opus, effort: "low", thinking: "adaptive" }, runs: 1, budgetPerRunUsd: 1.75 },
  { label: "opus-medium", variant: { model: MODELS.opus, effort: "medium", thinking: "adaptive" }, runs: 1, budgetPerRunUsd: 2.0 },
  { label: "sonnet-low", variant: { model: MODELS.sonnet, effort: "low", thinking: "adaptive" }, runs: 3, budgetPerRunUsd: 0.55 },
  { label: "haiku-low", variant: { model: MODELS.haiku, effort: "low", thinking: "adaptive" }, runs: 3, budgetPerRunUsd: 0.1 },
  { label: "haiku-medium", variant: { model: MODELS.haiku, effort: "medium", thinking: "adaptive" }, runs: 3, budgetPerRunUsd: 0.1 },
];
const DEFAULT_TOTAL_USD = SETUPS.reduce((sum, s) => sum + s.runs * s.budgetPerRunUsd, 0);

async function main() {
  const household = JSON.parse(readFileSync(join(here, "household.json"), "utf8")) as KakakHousehold;
  const testSet = JSON.parse(readFileSync(join(here, "test-set.json"), "utf8")) as KakakTestSet;
  const problems = checkTestSet(household, testSet);
  if (problems.length) throw new Error(`The test set has ${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  // The dev split only, in the test set's order, so a run stopped by its
  // budget covers the same first cases as the others.
  const cases = testSet.cases.filter((c) => !c.holdout);
  const totalUsd = Number(arg("budget") ?? DEFAULT_TOTAL_USD);
  const scale = totalUsd / DEFAULT_TOTAL_USD;
  const concurrency = Number(arg("concurrency") ?? "4");
  SETUPS.forEach((setup) => checkVariant(setup.variant));
  const client = makeClient();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync(join(here, "results"), { recursive: true });
  let spentMicro = 0;
  const results: { setup: Setup; runs: RunSummary[] }[] = [];

  for (const setup of SETUPS) {
    const runs: RunSummary[] = [];
    results.push({ setup, runs });
    for (let n = 1; n <= setup.runs; n += 1) {
      if (runs.some((r) => r.refused)) break; // refused once is the setup's result
      const capMicro = Math.min(setup.budgetPerRunUsd * scale * 1_000_000, totalUsd * 1_000_000 - spentMicro);
      const pressureBefore = { ...apiPressure };
      const outcomes: CaseOutcome[] = [];
      let runMicro = 0;
      let done = 0;
      let inFlight = 0;
      let stoppedForBudget = false;
      let refused: string | undefined;
      console.log(`\n${setup.label} run ${n}/${setup.runs}: ${cases.length} dev cases, up to $${(capMicro / 1_000_000).toFixed(2)}…`);
      await pool(cases, concurrency, async (kakakCase) => {
        if (refused) return;
        // Conversations still running count at the run's average so far (or
        // twice the planned average before the first one ends), so several
        // workers can't all start on the same last few cents (Codex, PR #138).
        const perCase = done > 0 ? runMicro / done : (2 * capMicro) / cases.length;
        if (runMicro + (inFlight + 1) * perCase > capMicro) {
          stoppedForBudget = true;
          return;
        }
        inFlight += 1;
        const conversation = await playConversation(client, setup.variant, household, kakakCase, kakakCase.sentence);
        inFlight -= 1;
        done += 1;
        const cost = conversation.calls.reduce((sum, c) => sum + c.costMicroUsd, 0);
        runMicro += cost;
        spentMicro += cost;
        if (conversation.apiStatus === 400) {
          refused = (conversation.error ?? "400").replace(/\s+/g, " ").slice(0, 200);
          return;
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
        console.log(`  ${kakakCase.id} ${mark}${grade.pass ? "" : `: ${[...grade.mustNever, ...grade.failures].join(" · ")}`}`);
      });
      outcomes.sort((a, b) => a.kakakCase.id.localeCompare(b.kakakCase.id));
      const run: RunSummary = {
        summary: summarise(outcomes),
        rateLimited: apiPressure.rateLimited - pressureBefore.rateLimited,
        overloaded: apiPressure.overloaded - pressureBefore.overloaded,
        planned: cases.length,
        stoppedForBudget,
        ...(refused ? { refused } : {}),
      };
      runs.push(run);
      const file = join(here, "results", `${stamp}-comparison-${setup.label}-run${n}.json`);
      writeFileSync(file, JSON.stringify({ setup, run: n, ...run, outcomes }, null, 2));
      console.log(
        refused
          ? `  refused by the API: ${refused}`
          : `  ${run.summary.passed}/${run.summary.cases} passed, ${run.summary.mustNeverCases.length} must-never, ${run.summary.rawLeakCases.length} raw leaks, $${run.summary.totalCostUsd.toFixed(2)}. Details: ${file}`,
      );
    }
    if (spentMicro >= totalUsd * 1_000_000) {
      console.log(`\nStopped: the $${totalUsd.toFixed(2)} total budget was reached.`);
      break;
    }
  }

  console.log(`\n${COMPARISON_HEADER}`);
  for (const { setup, runs } of results) console.log(comparisonRow(setup.label, runs));
  console.log("\nPass rate by group (all runs of a setup pooled):");
  for (const { setup, runs } of results) {
    if (runs.some((r) => r.refused) || runs.length === 0) continue;
    const rates = Object.entries(groupRates(runs)).map(([group, rate]) => `${group} ${rate}`);
    console.log(`  ${setup.label}: ${rates.join(" · ")}`);
  }
  console.log(
    "\nMust-never is judged on what the owner sees (after the guard). Raw leaks: cases whose model text had a reference, an ISO date, a tool or field name, or the wrong language before the guard. Fallbacks: turns where the guard replaced the text. Cold call: each run's first call; p50 and p95 leave it out.",
  );
  console.log(`\nTotal spent: $${(spentMicro / 1_000_000).toFixed(2)} of a $${totalUsd.toFixed(2)} budget.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
