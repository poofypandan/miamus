// The comparison's measurements (tests/kakak/run-comparison.ts), without a
// key or any cost: raw leaks before the guard against what is shown, the
// fallback count, the cold call, retries, cache tokens, 429s and the table.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import type { KakakHousehold } from "@/lib/kakak/household";
import { gradeCase, leakViolation, rawLeakTells, type ActualTurn } from "../kakak/grade";
import { comparisonRow, groupRates, summarise, worstRun, type CaseOutcome, type RunSummary } from "../kakak/report";
import { apiPressure, countingFetch, playConversation, type CallRecord, type Variant } from "../kakak/run-core";
import type { KakakTestSet } from "../kakak/types";

const root = join(__dirname, "..", "kakak");
const household = JSON.parse(readFileSync(join(root, "household.json"), "utf8")) as KakakHousehold;
const testSet = JSON.parse(readFileSync(join(root, "test-set.json"), "utf8")) as KakakTestSet;
const caseById = (id: string) => {
  const found = testSet.cases.find((c) => c.id === id);
  if (!found) throw new Error(id);
  return found;
};

const K114 = "Eggs I1 already in fridge; set expiry 2026-11-25.";

function fakeApi(replies: { content: unknown[]; stop_reason: string }[]) {
  let calls = 0;
  const fetch = async () => {
    const reply = replies[calls];
    calls += 1;
    if (!reply) throw new Error("unexpected extra call");
    return new Response(
      JSON.stringify({
        id: `msg_${calls}`,
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: reply.content,
        stop_reason: reply.stop_reason,
        stop_sequence: null,
        usage: { input_tokens: 900, output_tokens: 300, cache_read_input_tokens: 2500, cache_creation_input_tokens: 100 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  return new Anthropic({ apiKey: "test-key", authToken: null, baseURL: "http://fake.test", maxRetries: 0, fetch });
}

const opus: Variant = { model: "claude-opus-5-5", effort: "low", thinking: "adaptive" };

describe("the runner grades what the owner sees", () => {
  it("guards a card's text, keeps the model's words as raw, and passes the shown must-never", async () => {
    const k114 = caseById("K114");
    const expected = k114.paths[0][0];
    if (expected.kind !== "suggestions") throw new Error("K114 should start with a card");
    // A put-away card for the eggs, with K114's real note beside it.
    const card = {
      type: "tool_use",
      id: "toolu_i",
      name: "put_away_ingredient",
      input: { item: "I1", kept_in: "fridge", expiry: "set", expires_on: "2026-11-25", expiry_is_guess: false },
    };
    const client = fakeApi([{ content: [{ type: "text", text: K114 }, card], stop_reason: "tool_use" }]);
    const result = await playConversation(client, opus, household, k114, k114.sentence);
    expect(result.turns).toHaveLength(1);
    const turn = result.turns[0];
    expect(turn.text).toBe("");
    expect(turn.rawText).toBe(K114);
    expect(turn.guarded).toEqual(["reference", "date"]);
    expect(result.calls[0].startedAt).toEqual(expect.any(Number));
    expect(rawLeakTells(turn, "en")).toEqual(["reference", "date"]);
    const grade = gradeCase(household, k114, result.turns, result.rejected);
    expect(grade.mustNever.join(" ")).not.toMatch(/note to self|language/);
  });

  it("records a refused setting as a 400", async () => {
    const fetch = async () =>
      new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "effort is not supported on this model" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    const client = new Anthropic({ apiKey: "test-key", authToken: null, baseURL: "http://fake.test", maxRetries: 0, fetch });
    const k001 = caseById("K001");
    const result = await playConversation(client, opus, household, k001, k001.sentence);
    expect(result.apiStatus).toBe(400);
    expect(result.error).toMatch(/effort is not supported/);
  });

  it("counts 429s and 529s, retried or not", async () => {
    const before = { ...apiPressure };
    const statuses = [429, 529, 200];
    const counted = countingFetch(async () => new Response("{}", { status: statuses.shift() ?? 200 }));
    for (let i = 0; i < 3; i += 1) await counted("http://fake.test");
    expect(apiPressure.rateLimited - before.rateLimited).toBe(1);
    expect(apiPressure.overloaded - before.overloaded).toBe(1);
  });
});

describe("leaks: shown is the must-never, raw is a rate", () => {
  const question = (text: string, q: string): ActualTurn => ({
    kind: "question",
    calls: [{ name: "ask_question", input: { question: q, answers: ["16.00", "17.00"], allow_typing: true } }],
    text: "",
    ...(text ? { rawText: text } : {}),
  });

  it("counts a question turn's dropped text as raw only", () => {
    const turn = question("Need time: ask. P1 has no walk.", "Jam berapa?");
    expect(rawLeakTells(turn, "id")).toEqual(["reference"]);
    expect(leakViolation(turn, "id", "turn 1")).toBeNull();
  });

  it("flags the wrong language on screen, in a question too", () => {
    expect(leakViolation(question("", "Which time should Syam do it? Pick one."), "id", "turn 1")).toMatch(/not in the owner's language/);
    expect(leakViolation({ kind: "message", calls: [], text: "Baik, Bu. Sari mengepel teras jam 09.00." }, "id", "turn 1")).toBeNull();
  });

  it("no longer fails a case for a rejected reply's language: it is never shown", () => {
    const k001 = caseById("K001");
    const english: ActualTurn = { kind: "message", calls: [], text: "Which day should Budi do it? You can pick one." };
    const grade = gradeCase(household, k001, [], [{ beforeTurn: 0, turn: english }]);
    expect(grade.mustNever.join(" ")).not.toMatch(/language/);
  });
});

const call = (ms: number, startedAt: number, extra: Partial<CallRecord> = {}): CallRecord => ({
  startedAt,
  ms,
  costMicroUsd: 10_000,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 2000,
  cacheWriteTokens: 0,
  stopReason: "tool_use",
  ...extra,
});

function outcome(id: string, category: string, calls: CallRecord[], turns: ActualTurn[], pass: boolean, mustNever: string[] = []): CaseOutcome {
  return {
    kakakCase: { id, category: category as CaseOutcome["kakakCase"]["category"], lang: "id", ownerLocale: "id", holdout: false, sentence: "" },
    conversation: { turns, rejected: [], calls },
    grade: { pass, mustNever, failures: [], pathIndex: 0 },
  };
}

describe("the comparison's numbers", () => {
  const leaked: ActualTurn = { kind: "suggestions", calls: [], text: "", rawText: "Untuk S1.", guarded: ["reference"] };
  const clean: ActualTurn = { kind: "suggestions", calls: [], text: "Baik." };
  const summary = summarise([
    // The cold call starts first and takes longest; it is left out of p50 and p95.
    outcome("K001", "chore_repeat", [call(9000, 100, { cacheReadTokens: 0, cacheWriteTokens: 4000 })], [clean], true),
    outcome("K002", "chore_repeat", [call(1000, 200, { rejected: ["create_chore: bad"] }), call(2000, 300)], [leaked], false, ["x"]),
    outcome("K003", "pet_routine", [call(3000, 250)], [clean], true),
  ]);

  it("sets the cold call apart and counts retries, cache, fallbacks and raw leaks", () => {
    expect(summary.coldCallMs).toBe(9000);
    expect(summary.warmMedianCallMs).toBe(2000);
    expect(summary.warmP95CallMs).toBe(3000);
    expect(summary.calls).toBe(4);
    expect(summary.retries).toBe(1);
    expect(summary.cacheReadTokens).toBe(6000);
    expect(summary.cacheWriteTokens).toBe(4000);
    expect(summary.fallbacks).toBe(1);
    expect(summary.rawLeakCases).toEqual(["K002"]);
    expect(summary.rawLeakTurns).toBe(1);
    expect(summary.costPerCaseUsd).toBeCloseTo(0.04 / 3);
  });

  const run = (s = summary, extra: Partial<RunSummary> = {}): RunSummary => ({
    summary: s,
    rateLimited: 0,
    overloaded: 0,
    planned: 86,
    stoppedForBudget: false,
    ...extra,
  });

  it("reports a repeated setup by its worst run, and pools the groups", () => {
    const better = summarise([outcome("K001", "chore_repeat", [call(1000, 1)], [clean], true)]);
    const runs = [run(better), run(summary, { rateLimited: 2 }), run(better, { overloaded: 1 })];
    expect(worstRun(runs)?.summary).toBe(summary);
    expect(groupRates(runs)).toEqual({ chore_repeat: "3/4 (75%)", pet_routine: "1/1 (100%)" });
    const row = comparisonRow("haiku-low", runs);
    expect(row).toContain("| 1: K002 |");
    expect(row).toContain("| 2 / 1 |");
    expect(row.split("|")).toHaveLength(17);
  });

  it("shows a refused setup as its result, and a budget stop", () => {
    expect(comparisonRow("haiku-medium", [run(summarise([]), { refused: "API error: 400 effort is not supported" })])).toContain(
      "refused by the API: API error: 400 effort is not supported",
    );
    expect(comparisonRow("opus-low", [run(summary, { stoppedForBudget: true })])).toContain("of 86, budget");
  });
});
