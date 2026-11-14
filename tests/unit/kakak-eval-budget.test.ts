// The spending limit of a Kakak test run (tests/kakak/budget.ts): a bound
// held where every request passes, not a point at which the run notices it
// has overspent. Retries and requests side by side go through the same gate.

import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { costMicroUsd, PRICES } from "@/lib/kakak/cost";
import {
  Budget,
  BUDGET_STOP,
  budgetFetch,
  stoppedByBudget,
  UNSEEN_INPUT_TOKENS,
  worstCaseMicroUsd,
} from "../kakak/budget";

const request = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    model: "claude-opus-5-5",
    max_tokens: 4096,
    system: [{ type: "text", text: "Kakak. ".repeat(500), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: "Tolong pel teras besok pagi." }],
    ...extra,
  });

const answer = (usage: Record<string, number>, status = 200) =>
  new Response(JSON.stringify({ id: "msg_1", type: "message", role: "assistant", content: [], usage }), {
    status,
    headers: { "content-type": "application/json" },
  });

const errorAnswer = (status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ type: "error", error: { type: "some_error", message: "no" } }), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

/** Lets every promise that is ready run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the worst case of one request", () => {
  it("counts every byte as a token at the dearest input rate, plus the whole of max_tokens", () => {
    const body = request();
    const bytes = Buffer.byteLength(body, "utf8");
    const opus = PRICES["claude-opus-5-5"];
    expect(worstCaseMicroUsd(body)).toEqual({
      micro: Math.ceil((bytes + UNSEEN_INPUT_TOKENS) * opus.cacheWrite5m + 4096 * opus.output),
      model: "claude-opus-5-5",
    });
  });

  it("is never under what the request can really cost", () => {
    const body = request();
    const worst = worstCaseMicroUsd(body)!.micro;
    const tokens = Buffer.byteLength(body, "utf8") + UNSEEN_INPUT_TOKENS;
    // Every token it could hold, charged each way it could be charged, and all the output allowed.
    for (const usage of [
      { input_tokens: tokens, output_tokens: 4096 },
      { input_tokens: 0, output_tokens: 4096, cache_creation_input_tokens: tokens },
      { input_tokens: 0, output_tokens: 4096, cache_read_input_tokens: tokens },
      { input_tokens: 9550, output_tokens: 523, cache_read_input_tokens: 0 },
    ]) {
      expect(costMicroUsd("claude-opus-5-5", usage)).toBeLessThanOrEqual(worst);
    }
  });

  it("adds a whole reply's worth of input for each earlier reply sent back, whatever its size in bytes", () => {
    const first = request();
    const later = request({
      messages: [
        { role: "user", content: "Tolong pel teras besok pagi." },
        { role: "assistant", content: [{ type: "thinking", thinking: "", signature: "sig-1" }] },
        { role: "user", content: "Mbak Yanti" },
        { role: "assistant", content: [{ type: "thinking", thinking: "", signature: "sig-2" }] },
        { role: "user", content: "Jam 9" },
      ],
    });
    const opus = PRICES["claude-opus-5-5"];
    const bytes = Buffer.byteLength(later, "utf8");
    expect(worstCaseMicroUsd(later)!.micro).toBe(
      Math.ceil((bytes + UNSEEN_INPUT_TOKENS + 2 * 4096) * opus.cacheWrite5m + 4096 * opus.output),
    );
    expect(worstCaseMicroUsd(later)!.micro).toBeGreaterThan(worstCaseMicroUsd(first)!.micro + 2 * 4096 * opus.input);
  });

  it("uses the 1-hour cache price only when the request asks for it", () => {
    const hour = request({
      system: [{ type: "text", text: "Kakak. ".repeat(500), cache_control: { type: "ephemeral", ttl: "1h" } }],
    });
    const bytes = Buffer.byteLength(hour, "utf8");
    const opus = PRICES["claude-opus-5-5"];
    expect(worstCaseMicroUsd(hour)!.micro).toBe(
      Math.ceil((bytes + UNSEEN_INPUT_TOKENS) * opus.cacheWrite1h + 4096 * opus.output),
    );
  });

  it("counts a model that is not in the price table at the dearest prices", () => {
    const body = request({ model: "claude-something-new" });
    const bytes = Buffer.byteLength(body, "utf8");
    const opus = PRICES["claude-opus-5-5"];
    expect(worstCaseMicroUsd(body)).toEqual({
      micro: Math.ceil((bytes + UNSEEN_INPUT_TOKENS) * opus.cacheWrite5m + 4096 * opus.output),
      model: null,
    });
  });

  it("can't be worked out for a request it can't read, or one with no limit on its output", () => {
    expect(worstCaseMicroUsd("not json")).toBeNull();
    expect(worstCaseMicroUsd("null")).toBeNull();
    expect(worstCaseMicroUsd(JSON.stringify({ model: "claude-opus-5-5" }))).toBeNull();
    expect(worstCaseMicroUsd(JSON.stringify({ model: "claude-opus-5-5", max_tokens: 0 }))).toBeNull();
  });
});

describe("the budget", () => {
  it("lets a request go only when its worst case fits beside the ones in flight", async () => {
    const budget = new Budget(100);
    expect(await budget.reserve(40)).toBe(true);
    expect(await budget.reserve(40)).toBe(true);
    let third: boolean | undefined;
    const waiting = budget.reserve(40).then((ok) => (third = ok));
    await settle();
    // 40 + 40 + 40 would pass 100: it waits, and nothing has been spent yet.
    expect(third).toBeUndefined();
    expect(budget.spentMicro).toBe(0);
    budget.settle(40, 10);
    await waiting;
    expect(third).toBe(true);
    expect(budget.spentMicro + budget.reservedMicro).toBeLessThanOrEqual(100);
  });

  it("turns away a request that can never fit, and everything after it", async () => {
    const budget = new Budget(100);
    expect(await budget.reserve(60)).toBe(true);
    budget.settle(60, 55);
    expect(await budget.reserve(60)).toBe(false);
    expect(budget.stopped).toBe(true);
    // Even one that would fit: the run has ended.
    expect(await budget.reserve(1)).toBe(false);
    expect(budget.spentMicro).toBe(55);
  });

  it("turns away the ones that were waiting when the run stops", async () => {
    const budget = new Budget(100);
    expect(await budget.reserve(70)).toBe(true);
    const waiting = budget.reserve(60);
    await settle();
    budget.settle(70, 70);
    expect(await waiting).toBe(false);
    expect(budget.stopped).toBe(true);
  });

  it("never counts past its limit, however the requests overlap", async () => {
    // A fixed sequence of pseudo-random sizes, so the test is the same every time.
    let seed = 20261114;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const limit = 1_000_000;
    const budget = new Budget(limit);
    let highest = 0;
    const one = async () => {
      const worst = 20_000 + Math.floor(random() * 280_000);
      if (!(await budget.reserve(worst))) return;
      highest = Math.max(highest, budget.spentMicro + budget.reservedMicro);
      await new Promise((resolve) => setTimeout(resolve, Math.floor(random() * 3)));
      budget.settle(worst, Math.floor(random() * worst));
      highest = Math.max(highest, budget.spentMicro + budget.reservedMicro);
    };
    await Promise.all(Array.from({ length: 300 }, one));
    expect(highest).toBeLessThanOrEqual(limit);
    expect(budget.spentMicro).toBeLessThanOrEqual(limit);
    expect(budget.reservedMicro).toBe(0);
    expect(budget.stopped).toBe(true);
    expect(budget.boundBroken).toBe(false);
  });

  it("says so, and stops, if a request ever costs more than its worst case", async () => {
    const budget = new Budget(100);
    await budget.reserve(10);
    budget.settle(10, 11);
    expect(budget.boundBroken).toBe(true);
    expect(await budget.reserve(1)).toBe(false);
  });

  it("needs a limit above 0", () => {
    for (const limit of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new Budget(limit)).toThrow();
    }
  });
});

describe("every request passes the budget", () => {
  const usage = { input_tokens: 900, output_tokens: 300, cache_read_input_tokens: 2500 };

  it("counts an answer at what it cost", async () => {
    const budget = new Budget(1_000_000);
    const fetch = budgetFetch(budget, async () => answer(usage));
    const response = await fetch("http://fake.test/v1/messages", { method: "POST", body: request() });
    expect(response.status).toBe(200);
    // The caller can still read the answer.
    expect(((await response.json()) as { usage: unknown }).usage).toEqual(usage);
    expect(budget.spentMicro).toBe(costMicroUsd("claude-opus-5-5", usage));
    expect(budget.reservedMicro).toBe(0);
    expect(budget.requests).toBe(1);
  });

  it("counts nothing for an answer that is an error", async () => {
    for (const status of [400, 401, 403, 429, 500, 529]) {
      const budget = new Budget(1_000_000);
      const fetch = budgetFetch(budget, async () => errorAnswer(status));
      expect((await fetch("http://fake.test/v1/messages", { method: "POST", body: request() })).status).toBe(status);
      expect(budget.spentMicro, String(status)).toBe(0);
      expect(budget.reservedMicro, String(status)).toBe(0);
    }
  });

  it("counts a request with no answer at its worst case", async () => {
    const budget = new Budget(1_000_000);
    const fetch = budgetFetch(budget, async () => {
      throw new TypeError("fetch failed");
    });
    await expect(fetch("http://fake.test/v1/messages", { method: "POST", body: request() })).rejects.toThrow("fetch failed");
    expect(budget.spentMicro).toBe(worstCaseMicroUsd(request())!.micro);
    expect(budget.unanswered).toBe(1);
    expect(budget.reservedMicro).toBe(0);
  });

  it("counts an answer it can't read the cost of at its worst case", async () => {
    const budget = new Budget(1_000_000);
    const fetch = budgetFetch(budget, async () => new Response("{}", { status: 200 }));
    await fetch("http://fake.test/v1/messages", { method: "POST", body: request() });
    expect(budget.spentMicro).toBe(worstCaseMicroUsd(request())!.micro);
    expect(budget.unanswered).toBe(1);
  });

  it("does not send a request whose worst case does not fit, or one it can't size", async () => {
    let sent = 0;
    const base = async () => {
      sent += 1;
      return answer(usage);
    };
    const small = new Budget(worstCaseMicroUsd(request())!.micro - 1);
    const refused = await budgetFetch(small, base)("http://fake.test/v1/messages", { method: "POST", body: request() });
    expect(refused.status).toBe(402);
    expect(refused.headers.get("x-should-retry")).toBe("false");
    expect(((await refused.json()) as { error: { type: string } }).error.type).toBe(BUDGET_STOP);
    expect(small.stopped).toBe(true);
    expect(small.spentMicro).toBe(0);

    const unsized = new Budget(1_000_000);
    const fetch = budgetFetch(unsized, base);
    expect((await fetch("http://fake.test/v1/messages", { method: "POST" })).status).toBe(402);
    expect((await fetch("http://fake.test/v1/messages", { method: "POST", body: "not json" })).status).toBe(402);
    expect(unsized.stopped).toBe(true);
    expect(sent).toBe(0);
  });

  const create = (client: Anthropic) =>
    client.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4096,
      messages: [{ role: "user", content: "Tolong pel teras besok pagi." }],
    });

  it("counts each of the SDK's own retries: an overloaded answer twice, then the real one", async () => {
    const budget = new Budget(2_000_000);
    const statuses = [529, 429, 200];
    let attempt = 0;
    const base = async () => {
      const status = statuses[attempt];
      attempt += 1;
      return status === 200 ? answer(usage) : errorAnswer(status, { "retry-after-ms": "1" });
    };
    const client = new Anthropic({
      apiKey: "test-key",
      authToken: null,
      baseURL: "http://fake.test",
      maxRetries: 3,
      fetch: budgetFetch(budget, base),
    });
    const message = await create(client);
    expect(message.usage.output_tokens).toBe(300);
    // Three requests passed the gate; only the answered one cost anything.
    expect(budget.requests).toBe(3);
    expect(budget.spentMicro).toBe(costMicroUsd("claude-opus-5-5", usage));
    expect(budget.reservedMicro).toBe(0);
  });

  it("counts a dropped connection at its worst case each time the SDK tries again", async () => {
    const budget = new Budget(5_000_000);
    let attempt = 0;
    const base = async () => {
      attempt += 1;
      if (attempt < 3) throw new TypeError("fetch failed");
      return answer(usage);
    };
    const client = new Anthropic({
      apiKey: "test-key",
      authToken: null,
      baseURL: "http://fake.test",
      maxRetries: 3,
      fetch: budgetFetch(budget, base),
    });
    await create(client);
    expect(budget.requests).toBe(3);
    expect(budget.unanswered).toBe(2);
    expect(budget.spentMicro).toBe(budget.unansweredMicro + costMicroUsd("claude-opus-5-5", usage));
    expect(budget.spentMicro).toBeLessThanOrEqual(5_000_000);
  }, 15_000);

  it("ends the SDK's call at once, unsent and unretried, when the budget does not cover it", async () => {
    let sent = 0;
    const budget = new Budget(1_000);
    const client = new Anthropic({
      apiKey: "test-key",
      authToken: null,
      baseURL: "http://fake.test",
      maxRetries: 3,
      fetch: budgetFetch(budget, async () => {
        sent += 1;
        return answer(usage);
      }),
    });
    const error = await create(client).then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(Anthropic.APIError);
    expect((error as InstanceType<typeof Anthropic.APIError>).status).toBe(402);
    // What the runner records for the conversation, and how it tells this from a real answer.
    expect(stoppedByBudget(`API error: ${(error as Error).message}`)).toBe(true);
    expect(stoppedByBudget("API error: 401 invalid x-api-key")).toBe(false);
    expect(stoppedByBudget(undefined)).toBe(false);
    expect(sent).toBe(0);
    expect(budget.requests).toBe(0);
    expect(budget.spentMicro).toBe(0);
  });
});
