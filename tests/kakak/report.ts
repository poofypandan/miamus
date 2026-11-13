// Turns graded conversations into the numbers the model decision needs.
// Pure; unit-tested.

import type { ConversationResult } from "./run-core";
import { rawLeakTells, type GradeResult } from "./grade";
import type { KakakCase } from "./types";

export interface CaseOutcome {
  kakakCase: Pick<KakakCase, "id" | "category" | "lang" | "ownerLocale" | "holdout" | "sentence">;
  conversation: ConversationResult;
  grade: GradeResult;
}

export interface Summary {
  cases: number;
  passed: number;
  mustNeverCases: string[];
  errors: string[];
  medianCallMs: number;
  p95CallMs: number;
  medianCaseMs: number;
  p95CaseMs: number;
  totalCostUsd: number;
  /** Total spend divided by passed cases: the cost of one right answer. */
  costPerPassUsd: number | null;
  byCategory: Record<string, { cases: number; passed: number }>;
  /** Cases whose model text leaked before the guard (a rate, not a failure). */
  rawLeakCases: string[];
  /** Kept turns whose model text leaked before the guard. */
  rawLeakTurns: number;
  /** Kept turns where the guard replaced the text with a fallback line. */
  fallbacks: number;
  /** The run's first call, cold (no cache yet); null with no calls. */
  coldCallMs: number | null;
  /** Every call but the cold one. */
  warmMedianCallMs: number;
  warmP95CallMs: number;
  calls: number;
  /** Calls the route's checks rejected and sent back once. */
  retries: number;
  costPerCaseUsd: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  // Nearest-rank method.
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(rank, sorted.length) - 1];
}

export function summarise(outcomes: CaseOutcome[]): Summary {
  const callMs = outcomes.flatMap((o) => o.conversation.calls.map((c) => c.ms));
  const caseMs = outcomes.map((o) => o.conversation.calls.reduce((sum, c) => sum + c.ms, 0));
  const micro = outcomes.reduce(
    (sum, o) => sum + o.conversation.calls.reduce((s, c) => s + c.costMicroUsd, 0),
    0,
  );
  const passed = outcomes.filter((o) => o.grade.pass).length;
  const byCategory: Summary["byCategory"] = {};
  for (const outcome of outcomes) {
    const entry = (byCategory[outcome.kakakCase.category] ??= { cases: 0, passed: 0 });
    entry.cases += 1;
    if (outcome.grade.pass) entry.passed += 1;
  }
  const totalCostUsd = micro / 1_000_000;
  const allCalls = outcomes.flatMap((o) => o.conversation.calls);
  // The cold call is the first to start; without start times, the first listed.
  const coldIndex = allCalls.reduce(
    (best, call, index) => ((call.startedAt ?? Infinity) < (allCalls[best].startedAt ?? Infinity) ? index : best),
    0,
  );
  const warmMs = allCalls.filter((_, index) => index !== coldIndex).map((c) => c.ms);
  const leaks = outcomes.map((o) => ({
    id: o.kakakCase.id,
    turns: o.conversation.turns.filter((t) => t.kind !== "invalid" && rawLeakTells(t, o.kakakCase.ownerLocale).length > 0).length,
  }));
  return {
    rawLeakCases: leaks.filter((l) => l.turns > 0).map((l) => l.id),
    rawLeakTurns: leaks.reduce((sum, l) => sum + l.turns, 0),
    fallbacks: outcomes.reduce((sum, o) => sum + o.conversation.turns.filter((t) => (t.guarded ?? []).length > 0).length, 0),
    coldCallMs: allCalls.length ? allCalls[coldIndex].ms : null,
    warmMedianCallMs: percentile(warmMs, 50),
    warmP95CallMs: percentile(warmMs, 95),
    calls: allCalls.length,
    retries: allCalls.filter((c) => (c.rejected ?? []).length > 0).length,
    costPerCaseUsd: outcomes.length ? totalCostUsd / outcomes.length : 0,
    cacheReadTokens: allCalls.reduce((sum, c) => sum + c.cacheReadTokens, 0),
    cacheWriteTokens: allCalls.reduce((sum, c) => sum + c.cacheWriteTokens, 0),
    cases: outcomes.length,
    passed,
    mustNeverCases: outcomes.filter((o) => o.grade.mustNever.length > 0).map((o) => o.kakakCase.id),
    errors: outcomes.filter((o) => o.conversation.error).map((o) => `${o.kakakCase.id}: ${o.conversation.error}`),
    medianCallMs: percentile(callMs, 50),
    p95CallMs: percentile(callMs, 95),
    medianCaseMs: percentile(caseMs, 50),
    p95CaseMs: percentile(caseMs, 95),
    totalCostUsd,
    costPerPassUsd: passed > 0 ? totalCostUsd / passed : null,
    byCategory,
  };
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

/** One row for the results table in docs/kakak-eval.md. */
export function tableRow(label: string, summary: Summary): string {
  const cost = `$${summary.totalCostUsd.toFixed(2)}`;
  const perPass = summary.costPerPassUsd === null ? "n/a" : `$${summary.costPerPassUsd.toFixed(4)}`;
  return `| ${label} | ${summary.passed}/${summary.cases} | ${summary.mustNeverCases.length} | ${seconds(summary.medianCallMs)} | ${seconds(summary.p95CallMs)} | ${seconds(summary.p95CaseMs)} | ${cost} | ${perPass} |`;
}

export const TABLE_HEADER =
  "| Variant | Passed | Must-never | Median call | p95 call | p95 sentence | Cost | Cost per pass |\n| --- | --- | --- | --- | --- | --- | --- | --- |";

// ---------- the model comparison (run-comparison.ts) ----------

/** One run of one setup over the dev split. */
export interface RunSummary {
  summary: Summary;
  /** 429s and 529s during the run, retried ones included. */
  rateLimited: number;
  overloaded: number;
  /** Cases the run was meant to play. */
  planned: number;
  stoppedForBudget: boolean;
  /** The API refused the setup's settings (a 400): the setup's result. */
  refused?: string;
}

function ratio(passed: number, cases: number): string {
  return cases ? `${passed}/${cases} (${Math.round((passed / cases) * 100)}%)` : "0/0";
}

/** The run with the most must-never cases: repeated setups are judged by it. */
export function worstRun(runs: RunSummary[]): RunSummary | undefined {
  return runs.reduce<RunSummary | undefined>(
    (worst, run) => (!worst || run.summary.mustNeverCases.length > worst.summary.mustNeverCases.length ? run : worst),
    undefined,
  );
}

/** Pass rate per group, pooled over every run of the setup. */
export function groupRates(runs: RunSummary[]): Record<string, string> {
  const pooled: Record<string, { cases: number; passed: number }> = {};
  for (const run of runs) {
    for (const [group, entry] of Object.entries(run.summary.byCategory)) {
      const into = (pooled[group] ??= { cases: 0, passed: 0 });
      into.cases += entry.cases;
      into.passed += entry.passed;
    }
  }
  return Object.fromEntries(Object.entries(pooled).map(([group, e]) => [group, ratio(e.passed, e.cases)]));
}

export const COMPARISON_HEADER =
  "| Setup | Runs | Passed (each run) | Must-never (worst run) | Raw leaks, cases (each run) | Fallbacks (each run) | Cold call | p50 call | p95 call | Calls/case | Retries | Cost/case | Cache read | Cache write | 429 / 529 |\n" +
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |";

const EMPTY_CELLS = " |".repeat(12);

/** One row of the comparison table for a setup's runs. */
export function comparisonRow(label: string, runs: RunSummary[]): string {
  const refused = runs.find((r) => r.refused);
  if (refused) return `| ${label} | ${runs.length} | refused by the API: ${refused.refused} |${EMPTY_CELLS}`;
  const worst = worstRun(runs);
  if (!worst) return `| ${label} | 0 | not run |${EMPTY_CELLS}`;
  const sum = (pick: (s: Summary) => number) => runs.reduce((total, r) => total + pick(r.summary), 0);
  const each = (pick: (r: RunSummary) => string) => runs.map(pick).join(" / ");
  const cases = sum((s) => s.cases);
  const calls = sum((s) => s.calls);
  const cost = sum((s) => s.totalCostUsd);
  const cells = [
    label,
    String(runs.length),
    each((r) => `${ratio(r.summary.passed, r.summary.cases)}${r.stoppedForBudget ? ` of ${r.planned}, budget` : ""}`),
    worst.summary.mustNeverCases.length
      ? `${worst.summary.mustNeverCases.length}: ${worst.summary.mustNeverCases.join(", ")}`
      : "0",
    each((r) => String(r.summary.rawLeakCases.length)),
    each((r) => String(r.summary.fallbacks)),
    each((r) => (r.summary.coldCallMs === null ? "n/a" : seconds(r.summary.coldCallMs))),
    each((r) => seconds(r.summary.warmMedianCallMs)),
    each((r) => seconds(r.summary.warmP95CallMs)),
    cases ? (calls / cases).toFixed(2) : "n/a",
    String(sum((s) => s.retries)),
    cases ? `$${(cost / cases).toFixed(4)}` : "n/a",
    String(sum((s) => s.cacheReadTokens)),
    String(sum((s) => s.cacheWriteTokens)),
    `${runs.reduce((t, r) => t + r.rateLimited, 0)} / ${runs.reduce((t, r) => t + r.overloaded, 0)}`,
  ];
  return `| ${cells.join(" | ")} |`;
}
