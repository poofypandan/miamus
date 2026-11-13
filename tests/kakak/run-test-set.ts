// The Kakak test set against the real API. Run by hand; costs money; never in CI.
//
//   ANTHROPIC_API_KEY=… npx tsx tests/kakak/run-test-set.ts --model opus --effort low
//   ANTHROPIC_API_KEY=… npx tsx tests/kakak/run-test-set.ts --all-variants --budget 15
//   npx tsx tests/kakak/run-test-set.ts --check        (no key, no cost: checks the test set)
//
// Options: --model opus|sonnet|haiku  --effort low|medium|high  --no-thinking (Sonnet only)
//          --split dev|holdout|all (default dev)  --cases K001,K002  --concurrency 4
//          --budget <dollars, default 20>  --all-variants
// See docs/kakak-eval.md.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { KakakHousehold } from "@/lib/kakak/household";
import { gradeCase } from "./grade";
import { summarise, tableRow, TABLE_HEADER, type CaseOutcome } from "./report";
import {
  checkVariant,
  DEFAULT_VARIANTS,
  makeClient,
  MODELS,
  playConversation,
  pool,
  variantLabel,
  type Effort,
  type Variant,
} from "./run-core";
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

  const split = arg("split") ?? "dev";
  const only = arg("cases")?.split(",").map((s) => s.trim());
  const cases = testSet.cases.filter((c) =>
    only ? only.includes(c.id) : split === "all" ? true : split === "holdout" ? c.holdout : !c.holdout,
  );
  if (cases.length === 0) throw new Error("No cases selected.");

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
  const concurrency = Number(arg("concurrency") ?? "4");
  const client = makeClient();
  let spentMicro = 0;
  const rows: string[] = [];
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync(join(here, "results"), { recursive: true });

  for (const variant of variants) {
    const label = variantLabel(variant);
    const outcomes: CaseOutcome[] = [];
    let stoppedForBudget = false;
    console.log(`\n${label}: ${cases.length} cases (${split}${only ? ", chosen" : ""})…`);
    await pool(cases, concurrency, async (kakakCase) => {
      // Stops starting new cases at the budget; cases already running finish
      // (a few cents each at most).
      if (spentMicro >= budgetUsd * 1_000_000) {
        stoppedForBudget = true;
        return;
      }
      const conversation = await playConversation(client, variant, household, kakakCase, kakakCase.sentence);
      spentMicro += conversation.calls.reduce((sum, c) => sum + c.costMicroUsd, 0);
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
    const summary = summarise(outcomes);
    const file = join(here, "results", `${stamp}-${label}.json`);
    writeFileSync(file, JSON.stringify({ variant, label, split, summary, outcomes }, null, 2));
    rows.push(tableRow(label, summary));
    console.log(`\n${label}: ${summary.passed}/${summary.cases} passed, ${summary.mustNeverCases.length} must-never (${summary.mustNeverCases.join(", ") || "none"}), $${summary.totalCostUsd.toFixed(2)}.`);
    for (const [category, entry] of Object.entries(summary.byCategory)) {
      console.log(`  ${category}: ${entry.passed}/${entry.cases}`);
    }
    if (summary.errors.length) console.log(`  errors: ${summary.errors.join("; ")}`);
    console.log(`  details: ${file}`);
    if (stoppedForBudget) {
      console.log(`Stopped: the $${budgetUsd} budget was reached.`);
      break;
    }
  }
  console.log(`\n${TABLE_HEADER}\n${rows.join("\n")}`);
  console.log(`\nTotal spent: $${(spentMicro / 1_000_000).toFixed(2)} of a $${budgetUsd} budget.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
