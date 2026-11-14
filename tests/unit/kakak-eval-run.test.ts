// A whole Kakak test run against a fake API (tests/kakak/play-run.ts), the
// sentences it may play (select.ts) and how its result is said (report.ts):
// a refused key ends it after one request, the budget ends it before a
// request that could go past it, a part is never reported as the whole, and
// the held-out sentences stay out of tuning.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import type { KakakHousehold } from "@/lib/kakak/household";
import { Budget, budgetFetch, stoppedByBudget, worstCaseMicroUsd } from "../kakak/budget";
import { API_ERRORS_IN_A_ROW, playRun } from "../kakak/play-run";
import { keyWasRefused, PASS_MARK_PERCENT, summarise, unansweredCases, verdict } from "../kakak/report";
import type { Variant } from "../kakak/run-core";
import { selectCases } from "../kakak/select";
import type { KakakTestSet } from "../kakak/types";

const root = join(__dirname, "..", "kakak");
const household = JSON.parse(readFileSync(join(root, "household.json"), "utf8")) as KakakHousehold;
const testSet = JSON.parse(readFileSync(join(root, "test-set.json"), "utf8")) as KakakTestSet;
const dev = testSet.cases.filter((c) => !c.holdout);
const heldOut = testSet.cases.filter((c) => c.holdout);
const opus: Variant = { model: "claude-opus-5-5", effort: "medium", thinking: "adaptive" };

/** A fake API: `reply` decides each request's answer; it records how many were in flight as each began. */
function fakeApi(reply: (n: number) => Response) {
  const api = { calls: 0, inFlight: 0, overlaps: [] as number[], bodies: [] as string[] };
  const fetch = async (_url: unknown, init?: { body?: unknown }) => {
    api.calls += 1;
    const n = api.calls;
    api.inFlight += 1;
    api.overlaps.push(api.inFlight);
    api.bodies.push(String(init?.body));
    try {
      await new Promise((resolve) => setTimeout(resolve, 2));
      return reply(n);
    } finally {
      api.inFlight -= 1;
    }
  };
  return { api, fetch };
}

/** One plain sentence from Kakak: the conversation ends after this one request. */
const said = (usage: Record<string, number> = { input_tokens: 900, output_tokens: 300, cache_read_input_tokens: 2500 }) =>
  new Response(
    JSON.stringify({
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      content: [{ type: "text", text: "Baik." }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

const refusedWith = (status: number, type: string) =>
  new Response(JSON.stringify({ type: "error", error: { type, message: "no" } }), {
    status,
    headers: { "content-type": "application/json" },
  });

function start(limitMicro: number, reply: (n: number) => Response) {
  const budget = new Budget(limitMicro);
  const { api, fetch } = fakeApi(reply);
  const client = new Anthropic({
    apiKey: "test-key",
    authToken: null,
    baseURL: "http://fake.test",
    maxRetries: 0,
    fetch: budgetFetch(budget, fetch as typeof globalThis.fetch),
  });
  return { budget, api, client };
}

const facts = (planned: number, stopped?: "budget" | "key" | "api") => ({ planned, chosen: false, split: "dev", stopped });

describe("a run", () => {
  it("plays the first sentence alone, then the rest side by side, and returns them in order", async () => {
    const { budget, api, client } = start(50_000_000, () => said());
    const cases = dev.slice(0, 8);
    const run = await playRun({ client, budget, variant: opus, household, cases, concurrency: 3 });
    expect(run.stopped).toBeUndefined();
    expect(run.outcomes.map((o) => o.kakakCase.id)).toEqual(cases.map((c) => c.id).sort());
    // The second request begins only once the first has ended.
    expect(api.overlaps.slice(0, 2)).toEqual([1, 1]);
    expect(Math.max(...api.overlaps)).toBe(3);
    expect(verdict(summarise(run.outcomes), facts(8), unansweredCases(run.outcomes)).complete).toBe(true);
  });

  it("ends after one request when the key is refused, having spent nothing", async () => {
    for (const [status, type] of [
      [401, "authentication_error"],
      [403, "permission_error"],
    ] as const) {
      const { budget, api, client } = start(50_000_000, () => refusedWith(status, type));
      const run = await playRun({ client, budget, variant: opus, household, cases: dev.slice(0, 12), concurrency: 4 });
      expect(run.stopped, String(status)).toBe("key");
      expect(api.calls, String(status)).toBe(1);
      expect(budget.spentMicro, String(status)).toBe(0);
      const result = verdict(summarise(run.outcomes), facts(12, run.stopped), unansweredCases(run.outcomes));
      expect(result.passed).toBe(false);
      expect(result.line).toMatch(/^INCOMPLETE, so not passed: only 1 of 12 sentences were played \(the key was refused\)/);
    }
  });

  it("ends before a request that could go past the budget, alone or side by side", async () => {
    for (const concurrency of [1, 4]) {
      const limit = 1_000_000;
      // Every answer uses all the output it is allowed: about 8 cents on Opus.
      const { budget, api, client } = start(limit, () => said({ input_tokens: 0, output_tokens: 4096 }));
      const cases = dev.slice(0, 30);
      const run = await playRun({ client, budget, variant: opus, household, cases, concurrency });
      expect(run.stopped, String(concurrency)).toBe("budget");
      expect(budget.spentMicro, String(concurrency)).toBeLessThanOrEqual(limit);
      expect(budget.boundBroken).toBe(false);
      // Every request that was sent got its answer and is a result: none was cut off half way.
      expect(run.outcomes.length).toBe(api.calls);
      expect(run.outcomes.length).toBeLessThan(cases.length);
      expect(run.outcomes.some((o) => stoppedByBudget(o.conversation.error))).toBe(false);
      // It did not stop early either: what is left would not cover one more request.
      const dearest = Math.max(...api.bodies.map((body) => worstCaseMicroUsd(body)!.micro));
      expect(limit - budget.spentMicro).toBeLessThan(dearest);
      const result = verdict(summarise(run.outcomes), facts(cases.length, run.stopped), unansweredCases(run.outcomes));
      expect(result.passed).toBe(false);
      expect(result.line).toContain(`only ${run.outcomes.length} of 30 sentences were played (the budget was reached)`);
    }
  });

  it("sends nothing at all when the budget is under one request's worst case", async () => {
    const { budget, api, client } = start(10_000, () => said());
    const run = await playRun({ client, budget, variant: opus, household, cases: dev.slice(0, 5), concurrency: 4 });
    expect(run.stopped).toBe("budget");
    expect(api.calls).toBe(0);
    expect(run.outcomes).toEqual([]);
    expect(budget.spentMicro).toBe(0);
    expect(verdict(summarise(run.outcomes), facts(5, run.stopped)).line).toMatch(/^INCOMPLETE/);
  });

  it(`ends when ${API_ERRORS_IN_A_ROW} sentences in a row get no answer`, async () => {
    for (const concurrency of [1, 4]) {
      const { budget, api, client } = start(50_000_000, () => refusedWith(529, "overloaded_error"));
      const run = await playRun({ client, budget, variant: opus, household, cases: dev.slice(0, 20), concurrency });
      expect(run.stopped, String(concurrency)).toBe("api");
      // No sentence starts after the last of the row; the ones already begun side by side end.
      expect(api.calls).toBeGreaterThanOrEqual(API_ERRORS_IN_A_ROW);
      expect(api.calls).toBeLessThanOrEqual(API_ERRORS_IN_A_ROW + concurrency - 1);
      expect(run.outcomes).toHaveLength(api.calls);
      expect(run.lastApiError).toContain("529");
      expect(budget.spentMicro).toBe(0);
      const result = verdict(summarise(run.outcomes), facts(20, run.stopped), unansweredCases(run.outcomes));
      expect(result.line).toMatch(/^INCOMPLETE, so not passed: only \d+ of 20 sentences were played \(the API stopped answering\)/);
    }
  });

  it("goes on past a sentence with no answer, and reports the run as incomplete", async () => {
    // Every third request is refused as overloaded; the rest are answered.
    const { budget, client } = start(50_000_000, (n) => (n % 3 === 0 ? refusedWith(529, "overloaded_error") : said()));
    const run = await playRun({ client, budget, variant: opus, household, cases: dev.slice(0, 9), concurrency: 1 });
    expect(run.stopped).toBeUndefined();
    expect(run.outcomes).toHaveLength(9);
    const unanswered = unansweredCases(run.outcomes);
    expect(unanswered).toHaveLength(3);
    const result = verdict(summarise(run.outcomes), facts(9), unanswered);
    expect(result.complete).toBe(false);
    expect(result.line).toMatch(/^INCOMPLETE, so not passed: 3 got no answer from the API/);
  });
});

describe("the sentences a run may play", () => {
  const heldOutId = heldOut[0].id;
  const devIds = [dev[0].id, dev[5].id];

  it("are the dev sentences unless the holdout is asked for by name", () => {
    expect(heldOut.length).toBe(30);
    const all = selectCases(testSet);
    expect(all).toMatchObject({ split: "dev", chosen: false });
    expect(all.cases).toHaveLength(dev.length);
    expect(all.cases.some((c) => c.holdout)).toBe(false);
    expect(selectCases(testSet, { split: "holdout" }).cases).toHaveLength(30);
    expect(selectCases(testSet, { split: "all" }).cases).toHaveLength(testSet.cases.length);
    expect(() => selectCases(testSet, { split: "everything" })).toThrow("--split must be dev, holdout or all.");
  });

  it("can be picked by id, in the test set's order, and that is never a full evaluation", () => {
    const picked = selectCases(testSet, { only: [` ${devIds[1]}`, devIds[0], devIds[1]] });
    expect(picked.chosen).toBe(true);
    expect(picked.cases.map((c) => c.id)).toEqual(devIds);
  });

  it("refuse an id that does not exist, instead of quietly playing fewer", () => {
    expect(() => selectCases(testSet, { only: [devIds[0], "K999"] })).toThrow("No such sentence: K999.");
    expect(() => selectCases(testSet, { only: [" ", ""] })).toThrow("No cases selected.");
  });

  it("refuse a held-out sentence picked by id", () => {
    expect(() => selectCases(testSet, { only: [devIds[0], heldOutId] })).toThrow(
      `Held out, so not played: ${heldOutId}. Held-out sentences are played only with --split holdout`,
    );
    // Asked for by name, at the laptop, it plays; a dev sentence does not ride along.
    expect(selectCases(testSet, { split: "holdout", only: [heldOutId] }).cases.map((c) => c.id)).toEqual([heldOutId]);
    expect(() => selectCases(testSet, { split: "holdout", only: [devIds[0]] })).toThrow(
      `Not in the holdout split: ${devIds[0]}.`,
    );
  });

  it("never include the holdout on GitHub, where every conversation is public", () => {
    for (const split of ["holdout", "all"]) {
      expect(() => selectCases(testSet, { split, onGitHub: true })).toThrow("never played from GitHub");
      expect(() => selectCases(testSet, { split, only: [heldOutId], onGitHub: true })).toThrow("never played from GitHub");
    }
    expect(() => selectCases(testSet, { only: [heldOutId], onGitHub: true })).toThrow("Held out, so not played");
    expect(selectCases(testSet, { onGitHub: true }).cases.some((c) => c.holdout)).toBe(false);
  });
});

describe("how a run's result is said", () => {
  const run = (cases: number, passed: number, mustNeverCases: string[] = []) => ({ cases, passed, mustNeverCases });

  it("PASSED: every sentence of the split answered, 90% or more passed, no must-never", () => {
    expect(PASS_MARK_PERCENT).toBe(90);
    expect(verdict(run(109, 106), facts(109))).toEqual({
      passed: true,
      complete: true,
      full: true,
      line: "PASSED: the whole dev split, 106 of 109 sentences, no must-never.",
      reasons: [],
    });
    // Whole numbers: 99 of 110 is exactly the mark, 98 is under it.
    expect(verdict(run(110, 99), facts(110)).passed).toBe(true);
    expect(verdict(run(110, 98), facts(110)).line).toBe("NOT PASSED: 98 of 110 passed, under 90%.");
  });

  it("NOT PASSED for one must-never, whatever else passed", () => {
    expect(verdict(run(109, 109, ["K021"]), facts(109)).line).toBe("NOT PASSED: must-never: K021.");
  });

  it("chosen sentences can pass, and the line says they are not a full evaluation", () => {
    const result = verdict(run(2, 2), { planned: 2, chosen: true, split: "dev" });
    expect(result).toMatchObject({ passed: true, complete: true, full: false });
    expect(result.line).toBe("PASSED for the 2 chosen sentences only. This is not a full evaluation.");
    expect(result.line).not.toContain("whole");
    expect(verdict(run(2, 1), { planned: 2, chosen: true, split: "dev" }).line).toBe(
      "NOT PASSED (chosen sentences): 1 of 2 passed, under 90%.",
    );
  });

  it("INCOMPLETE, never PASSED, when the run stopped early, even if all it played passed", () => {
    for (const [stopped, words] of [
      ["budget", "the budget was reached"],
      ["key", "the key was refused"],
      ["api", "the API stopped answering"],
    ] as const) {
      const result = verdict(run(60, 60), facts(109, stopped));
      expect(result).toMatchObject({ passed: false, complete: false });
      expect(result.line).toBe(`INCOMPLETE, so not passed: only 60 of 109 sentences were played (${words}).`);
    }
    // Fewer played than planned, for any reason.
    expect(verdict(run(108, 108), facts(109)).line).toMatch(/^INCOMPLETE/);
    expect(verdict(run(0, 0), facts(0)).passed).toBe(false);
  });

  it("INCOMPLETE when a sentence got no answer, even above 90%", () => {
    const result = verdict(run(109, 107), facts(109), ["K010", "K020"]);
    expect(result.passed).toBe(false);
    expect(result.line).toBe("INCOMPLETE, so not passed: 2 got no answer from the API (K010, K020).");
  });

  it("knows a refused key from the errors a run goes on past", () => {
    expect([401, 403].map(keyWasRefused)).toEqual([true, true]);
    expect([400, 402, 429, 500, 529, undefined].map(keyWasRefused)).toEqual([false, false, false, false, false, false]);
  });
});
