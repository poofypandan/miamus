// The Kakak test set against the real API. Started by hand, from the laptop
// (run-check.sh) or from GitHub's Run workflow button (kakak-eval.yml); costs
// money; never on a push or a pull request.
//
//   ANTHROPIC_API_KEY=… npx tsx tests/kakak/run-test-set.ts --model opus --effort low
//   ANTHROPIC_API_KEY=… npx tsx tests/kakak/run-test-set.ts --all-variants --budget 15
//   npx tsx tests/kakak/run-test-set.ts --check        (no key, no cost: checks the test set)
//
// Options: --model opus|sonnet|haiku  --effort low|medium|high  --no-thinking (Sonnet only)
//          --split dev|holdout|all (default dev)  --cases K001,K002  --concurrency 4
//          --budget <dollars, default 20>  --all-variants
//          --bar  (exit 2 unless every setup's RESULT line says PASSED; the line is always printed)
//
// --cases plays sentences of the chosen split only: a held-out sentence is
// refused unless --split holdout (or all) is given, and never plays on GitHub.
// --budget is a bound, not a point of no return: no request is sent unless
// its worst case still fits (budget.ts).
// See docs/kakak-eval.md.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { KakakHousehold } from "@/lib/kakak/household";
import { Budget } from "./budget";
import { playRun } from "./play-run";
import { summarise, tableRow, TABLE_HEADER, unansweredCases, verdict } from "./report";
import {
  checkVariant,
  DEFAULT_VARIANTS,
  makeClient,
  MODELS,
  variantLabel,
  type Effort,
  type Variant,
} from "./run-core";
import { selectCases } from "./select";
import { checkTestSet } from "./test-set-check";
import type { KakakTestSet } from "./types";

const here = dirname(fileURLToPath(import.meta.url));

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}
const flag = (name: string) => process.argv.includes(`--${name}`);

export function loadHousehold(): KakakHousehold {
  return JSON.parse(readFileSync(join(here, "household.json"), "utf8")) as KakakHousehold;
}

function loadTestSet(): KakakTestSet {
  return JSON.parse(readFileSync(join(here, "test-set.json"), "utf8")) as KakakTestSet;
}

const dollars = (micro: number) => `$${(micro / 1_000_000).toFixed(2)}`;

async function main() {
  const household = loadHousehold();
  const testSet = loadTestSet();
  const problems = checkTestSet(household, testSet);
  if (problems.length) {
    console.error(`The test set has ${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  if (flag("check")) {
    console.log(`Test set OK: ${testSet.cases.length} cases (${testSet.cases.filter((c) => c.holdout).length} held out).`);
    return;
  }

  // Thrown before anything is spent: a split or an id that doesn't exist, a
  // held-out sentence picked by id, the holdout on GitHub (select.ts).
  const { cases, split, chosen } = selectCases(testSet, {
    split: arg("split"),
    only: arg("cases")?.split(","),
    onGitHub: process.env.GITHUB_ACTIONS === "true",
  });

  let variants: Variant[];
  if (flag("all-variants")) {
    variants = DEFAULT_VARIANTS;
  } else {
    const model = MODELS[arg("model") ?? "opus"];
    if (!model) throw new Error("--model must be opus, sonnet or haiku");
    const effort = (arg("effort") ?? "low") as Effort;
    if (!["low", "medium", "high"].includes(effort)) throw new Error("--effort must be low, medium or high");
    variants = [{ model, effort, thinking: flag("no-thinking") ? "between_tools" : "adaptive" }];
  }
  variants.forEach(checkVariant);

  const budgetUsd = Number(arg("budget") ?? "20");
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new Error("--budget must be a number of dollars above 0.");
  const concurrency = Number(arg("concurrency") ?? "4");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error("--concurrency must be a whole number from 1 to 8.");
  }
  // One budget for the whole run, held where every request passes (budget.ts).
  const budget = new Budget(Math.round(budgetUsd * 1_000_000));
  const client = makeClient(budget);
  let everyVerdictPassed = true;
  const rows: string[] = [];
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync(join(here, "results"), { recursive: true });

  for (const variant of variants) {
    const label = variantLabel(variant);
    console.log(`\n${label}: ${cases.length} cases (${split}${chosen ? ", chosen" : ""})…`);
    const run = await playRun({
      client,
      budget,
      variant,
      household,
      cases,
      concurrency,
      say: (line) => console.log(line),
    });
    const summary = summarise(run.outcomes);
    const result = verdict(
      summary,
      { planned: cases.length, chosen, split, stopped: run.stopped },
      unansweredCases(run.outcomes),
    );
    if (!result.passed) everyVerdictPassed = false;
    const file = join(here, "results", `${stamp}-${label}.json`);
    writeFileSync(
      file,
      JSON.stringify(
        {
          variant,
          label,
          split,
          chosen,
          planned: cases.length,
          stopped: run.stopped ?? null,
          verdict: result,
          summary,
          outcomes: run.outcomes,
        },
        null,
        2,
      ),
    );
    rows.push(tableRow(label, summary));
    console.log(`\n${label}: ${summary.passed}/${summary.cases} passed, ${summary.mustNeverCases.length} must-never (${summary.mustNeverCases.join(", ") || "none"}), $${summary.totalCostUsd.toFixed(2)}.`);
    for (const [category, entry] of Object.entries(summary.byCategory)) {
      console.log(`  ${category}: ${entry.passed}/${entry.cases}`);
    }
    // What a change to her instructions could move without failing a case.
    console.log(
      `  raw leaks: ${summary.rawLeakCases.length} case(s)${summary.rawLeakCases.length ? ` (${summary.rawLeakCases.join(", ")})` : ""}; fallbacks: ${summary.fallbacks}; retries: ${summary.retries}; calls: ${summary.calls}; warm p50 ${(summary.warmMedianCallMs / 1000).toFixed(1)} s, p95 ${(summary.warmP95CallMs / 1000).toFixed(1)} s`,
    );
    if (summary.errors.length) console.log(`  errors: ${summary.errors.join("; ")}`);
    console.log(`  details: ${file}`);
    if (run.stopped === "key") {
      console.log(
        "Stopped: Anthropic refused the key (wrong, deleted, expired, or not allowed to use this model). A refused request costs nothing.",
      );
    } else if (run.stopped === "api") {
      console.log(
        `Stopped: the API gave no answer to several sentences in a row. The last error: ${run.lastApiError ?? "unknown"}`,
      );
    } else if (run.stopped === "budget") {
      console.log(
        `Stopped: the $${budgetUsd} budget does not cover another request's worst case. Sentences not played are not results.`,
      );
    }
    // The line to read. An incomplete run never says PASSED (report.ts).
    console.log(`RESULT (${label}): ${result.line}`);
    if (run.stopped) break;
  }
  console.log(`\n${TABLE_HEADER}\n${rows.join("\n")}`);
  console.log(
    `\nCounted against the budget: ${dollars(budget.spentMicro)} of $${budgetUsd}, over ${budget.requests} request(s) sent${
      budget.unanswered
        ? `; ${budget.unanswered} got no answer and ${budget.unanswered === 1 ? "is" : "are"} counted at the worst case (${dollars(budget.unansweredMicro)})`
        : ""
    }.`,
  );
  if (budget.boundBroken) {
    console.error(
      "A request cost more than its worst case. The price table (src/lib/kakak/cost.ts) or the size rule (tests/kakak/budget.ts) is wrong: fix it before the next run.",
    );
    process.exitCode = 2;
  }
  // Only on request, so a tuning run that expects misses still ends cleanly.
  if (flag("bar") && !everyVerdictPassed) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
