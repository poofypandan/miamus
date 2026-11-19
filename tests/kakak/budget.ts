// The spending limit of a run against the real API, held at the one place
// every request has to pass: fetch. Nothing is sent unless its worst case
// still fits, so the limit is a bound and not a point at which the run
// notices it has already overspent.
//
// How it holds:
//   - Before a request is sent, its worst case is set aside: every byte of
//     the request counted as one input token (real text is about three bytes
//     a token, so this is about three times too high), a whole reply's worth
//     more for each earlier reply it carries, all at the dearest input rate
//     the request can be charged, plus the whole of max_tokens as output. A
//     request is sent only when that fits beside the worst cases of the
//     requests still in flight. One that fits later waits; one that can
//     never fit stops the run.
//   - Each attempt is counted on its own, so the SDK's own retries (429, 529,
//     5xx, a dropped connection) and the runner's second tries pass the same
//     gate: there is no path to the API around it.
//   - An answer with usage is counted at what it cost. An answer that is an
//     error is not billed. No answer at all (a timeout, a dropped connection)
//     is counted at its worst case, because the work may still have been done.
//
// What it cannot promise: the prices are the ones written in
// src/lib/kakak/cost.ts (global routing; a workspace set to US-only
// inference pays a tenth more). Anthropic's invoice is the truth, and the
// workspace's monthly spend limit in the Claude Console is the limit
// Anthropic itself enforces. If a request ever costs more than its worst
// case, the table or the size rule is wrong: the run says so and stops.

import { costMicroUsd, PRICES, type KakakModel, type UsageLike } from "@/lib/kakak/cost";

/** The error type of the answer a request gets when the budget does not let it be sent. */
export const BUDGET_STOP = "kakak_run_budget_reached";

/** Input tokens the API adds that are not in the request's body: its tool-use instructions and framing. */
export const UNSEEN_INPUT_TOKENS = 2_000;

export class Budget {
  private spent = 0;
  private reserved = 0;
  private waiting: (() => void)[] = [];
  /** A request could not be sent: the run must not start anything more. */
  stopped = false;
  /** A request cost more than its worst case: the price table or the size rule is wrong. */
  boundBroken = false;
  /** Requests sent (every attempt, retries included). */
  requests = 0;
  /** Requests with no answer, and what they were counted at. */
  unanswered = 0;
  unansweredMicro = 0;

  constructor(readonly limitMicro: number) {
    if (!Number.isFinite(limitMicro) || limitMicro <= 0) throw new Error("The budget must be above 0.");
  }

  /** Counted so far, in micro-dollars. Never above the limit unless boundBroken. */
  get spentMicro(): number {
    return this.spent;
  }

  /** Set aside for requests in flight. */
  get reservedMicro(): number {
    return this.reserved;
  }

  /**
   * Sets `worstMicro` aside for one request. Waits while it only fits once a
   * request in flight has ended. False when it can never fit, or the run has
   * already stopped: the request must not be sent.
   */
  async reserve(worstMicro: number): Promise<boolean> {
    for (;;) {
      if (this.stopped || this.spent + worstMicro > this.limitMicro) {
        this.stop();
        return false;
      }
      if (this.spent + this.reserved + worstMicro <= this.limitMicro) {
        this.reserved += worstMicro;
        this.requests += 1;
        return true;
      }
      // Something is in flight (reserved > 0), so a settle will wake this.
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
  }

  /** The request ended: its worst case is released and what it cost is counted. */
  settle(worstMicro: number, actualMicro: number, noAnswer = false): void {
    this.reserved -= worstMicro;
    this.spent += actualMicro;
    if (noAnswer) {
      this.unanswered += 1;
      this.unansweredMicro += actualMicro;
    }
    if (actualMicro > worstMicro) {
      this.boundBroken = true;
      this.stopped = true;
    }
    this.wake();
  }

  /** Ends the run's sending: everything waiting is turned away. */
  stop(): void {
    this.stopped = true;
    this.wake();
  }

  private wake(): void {
    const waiting = this.waiting;
    this.waiting = [];
    for (const resume of waiting) resume();
  }
}

/** Whether a 1-hour cache write, the dearest input rate, is asked for anywhere in the request. */
function asksForHourCache(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(asksForHourCache);
  if (!node || typeof node !== "object") return false;
  const record = node as Record<string, unknown>;
  if (record.ttl === "1h") return true;
  return Object.values(record).some(asksForHourCache);
}

const dearest = (pick: (price: (typeof PRICES)[KakakModel]) => number) => Math.max(...Object.values(PRICES).map(pick));

/**
 * The most one request can cost, from its body alone, or null when that
 * can't be worked out (such a request is never sent). A model that isn't in
 * the price table is counted at the dearest price of each kind.
 */
export function worstCaseMicroUsd(body: string): { micro: number; model: KakakModel | null } | null {
  let request: unknown;
  try {
    request = JSON.parse(body);
  } catch {
    return null;
  }
  if (!request || typeof request !== "object") return null;
  const { model, max_tokens: maxTokens, messages } = request as {
    model?: unknown;
    max_tokens?: unknown;
    messages?: unknown;
  };
  if (typeof maxTokens !== "number" || !Number.isFinite(maxTokens) || maxTokens <= 0) return null;
  const known = typeof model === "string" && model in PRICES ? (model as KakakModel) : null;
  const hour = asksForHourCache(request);
  const inputRate = (price: (typeof PRICES)[KakakModel]) =>
    Math.max(price.input, price.cacheWrite5m, hour ? price.cacheWrite1h : 0);
  const input = known ? inputRate(PRICES[known]) : dearest(inputRate);
  const output = known ? PRICES[known].output : dearest((price) => price.output);
  const bytes = Buffer.byteLength(body, "utf8");
  // An earlier reply of hers that is sent back can stand for more tokens
  // than its bytes: its thinking comes back as a short signature. Each such
  // reply was at most max_tokens long, so that much is added for each.
  const earlierReplies = Array.isArray(messages)
    ? messages.filter((message) => (message as { role?: unknown } | null)?.role === "assistant").length
    : 0;
  const inputTokens = bytes + UNSEEN_INPUT_TOKENS + earlierReplies * maxTokens;
  return { micro: Math.ceil(inputTokens * input + maxTokens * output), model: known };
}

/** What a request is answered with, unsent, when the budget does not let it go. Never retried. */
function notSent(why: string): Response {
  return new Response(JSON.stringify({ type: "error", error: { type: BUDGET_STOP, message: why } }), {
    status: 402,
    headers: { "content-type": "application/json", "x-should-retry": "false" },
  });
}

/** `base` with every request passed through the budget first. */
export function budgetFetch(budget: Budget, base: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const worst = typeof init?.body === "string" ? worstCaseMicroUsd(init.body) : null;
    if (!worst) {
      budget.stop();
      return notSent("This request could not be sized, so it was not sent.");
    }
    if (!(await budget.reserve(worst.micro))) {
      return notSent("The run's budget does not cover this request's worst case, so it was not sent.");
    }
    let response: Response;
    try {
      response = await base(input, init);
    } catch (error) {
      // No answer: the work may still have been done, and billed.
      budget.settle(worst.micro, worst.micro, true);
      throw error;
    }
    if (!response.ok) {
      // Refused, rate limited, overloaded or failed: not billed.
      budget.settle(worst.micro, 0);
      return response;
    }
    let usage: UsageLike | undefined;
    try {
      usage = ((await response.clone().json()) as { usage?: UsageLike }).usage;
    } catch {
      usage = undefined;
    }
    if (usage && worst.model) {
      budget.settle(worst.micro, costMicroUsd(worst.model, usage));
    } else {
      // An answer whose cost can't be read is counted at its worst case.
      budget.settle(worst.micro, worst.micro, true);
    }
    return response;
  };
}

/** Whether a conversation ended because the budget did not let its next request be sent. */
export function stoppedByBudget(error: string | undefined): boolean {
  return Boolean(error?.includes(BUDGET_STOP));
}
