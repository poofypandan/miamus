// Turns graded conversations into the numbers the model decision needs.
// Pure; unit-tested.

import type { ConversationResult } from "./run-core";
import type { GradeResult } from "./grade";
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
  return {
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
