// Plays one Kakak conversation against the real API, the way the planned
// route will (docs/phase-156-step2-kakak-plan.md, sections 2–4): cached
// instructions and tools, the household block, one tool call or reply per
// turn, scripted answers to questions, one retry after a call that fails the
// route's checks. Used by run-test-set.ts and run-photos.ts. Costs money.

import Anthropic from "@anthropic-ai/sdk";
import { costMicroUsd, type KakakModel } from "@/lib/kakak/cost";
import { kakakSystem, toolsFor } from "@/lib/kakak/engine";
import type { KakakHousehold } from "@/lib/kakak/household";
import { correctionFor, guardReplyText, replyProblems } from "@/lib/kakak/reply-guard";
import { validateToolCall } from "@/lib/kakak/validate";
import { scriptedReply, type ActualTurn, type RejectedAttempt, type ToolCall } from "./grade";
import type { KakakCase } from "./types";

export type Effort = "low" | "medium" | "high";
export type Thinking = "adaptive" | "between_tools";

export interface Variant {
  model: KakakModel;
  effort: Effort;
  thinking: Thinking;
}

export const MODELS: Record<string, KakakModel> = {
  opus: "claude-opus-5-5",
  sonnet: "claude-sonnet-5-5",
  haiku: "claude-haiku-5-5",
};

/** The set compared by --all-variants (about $8–10 for all of them on 100 cases). */
export const DEFAULT_VARIANTS: Variant[] = [
  { model: "claude-opus-5-5", effort: "low", thinking: "adaptive" },
  { model: "claude-opus-5-5", effort: "medium", thinking: "adaptive" },
  { model: "claude-sonnet-5-5", effort: "low", thinking: "adaptive" },
  { model: "claude-sonnet-5-5", effort: "medium", thinking: "adaptive" },
  { model: "claude-sonnet-5-5", effort: "low", thinking: "between_tools" },
  { model: "claude-haiku-5-5", effort: "low", thinking: "adaptive" },
  { model: "claude-haiku-5-5", effort: "medium", thinking: "adaptive" },
];

export function variantLabel(variant: Variant): string {
  const name = Object.entries(MODELS).find(([, id]) => id === variant.model)?.[0] ?? variant.model;
  return `${name}-${variant.effort}${variant.thinking === "between_tools" ? "-nothink" : ""}`;
}

/** Rejects combinations the API refuses (claude-api reference, thinking table). */
export function checkVariant(variant: Variant): void {
  if (variant.thinking === "between_tools" && variant.model !== "claude-sonnet-5-5") {
    throw new Error("Thinking can be turned off (between_tools) only on Sonnet 5.5.");
  }
}

export interface CallRecord {
  /** When the call started (ms since the epoch), to set the run's first, cold call apart. */
  startedAt?: number;
  ms: number;
  costMicroUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  stopReason: string | null;
  /** Calls that failed the route's checks, with why. */
  rejected?: string[];
}

export interface ConversationResult {
  turns: ActualTurn[];
  /**
   * Replies that failed the route's checks and were sent back for a retry.
   * Not turns of the conversation, but still graded for must-nevers: a retry
   * must not erase an invented reference.
   */
  rejected: RejectedAttempt[];
  calls: CallRecord[];
  /** Set when the conversation stopped for a reason other than its end. */
  error?: string;
  /** The HTTP status of an API error, when there was one (400: the API refused the settings). */
  apiStatus?: number;
}

/**
 * Rate limits (429) and overloads (529) the API answered with, including the
 * ones the SDK retried by itself. Read before and after a run.
 */
export const apiPressure = { rateLimited: 0, overloaded: 0 };

/** `base` with every 429 and 529 counted in apiPressure. */
export function countingFetch(base: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const response = await base(input, init);
    if (response.status === 429) apiPressure.rateLimited += 1;
    if (response.status === 529) apiPressure.overloaded += 1;
    return response;
  };
}

/**
 * A client that always talks to Anthropic directly. The host is fixed, with
 * no override: ANTHROPIC_BASE_URL is ignored on purpose (tools that wrap
 * Claude, Claude Code among them, set it in the shell), so the key and the
 * household's photos only ever go to api.anthropic.com and the comparison
 * measures the real API. Unit tests pass their own fake client instead.
 */
export function makeClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set. See docs/kakak-eval.md, 'Before the first run'.");
  }
  return new Anthropic({
    apiKey,
    authToken: null,
    baseURL: "https://api.anthropic.com",
    maxRetries: 3,
    fetch: countingFetch(),
  });
}

/** Runs `work` over the items, `size` at a time, starting them in order. */
export async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await work(item);
    }
  });
  await Promise.all(workers);
}

const MAX_QUESTIONS = 3;
const MAX_CALLS = 8;

function toCalls(content: Anthropic.ContentBlock[]): { calls: (ToolCall & { id: string })[]; text: string } {
  const calls: (ToolCall & { id: string })[] = [];
  const texts: string[] = [];
  for (const block of content) {
    if (block.type === "tool_use") {
      calls.push({ id: block.id, name: block.name, input: (block.input ?? {}) as Record<string, unknown> });
    } else if (block.type === "text") {
      texts.push(block.text);
    }
  }
  return { calls, text: texts.join("\n").trim() };
}

function classify(calls: ToolCall[]): Pick<ActualTurn, "kind" | "invalidReason"> {
  const questions = calls.filter((c) => c.name === "ask_question").length;
  if (calls.length === 0) return { kind: "message" };
  if (questions === 1 && calls.length === 1) return { kind: "question" };
  if (questions > 0) return { kind: "invalid", invalidReason: "a question together with other tool calls" };
  return { kind: "suggestions" };
}

/** The offered answer the owner would tap, or the scripted text typed in. */
export function pickAnswer(offered: string[], scripted: string): string {
  const want = scripted.toLowerCase();
  return (
    offered.find((answer) => answer.toLowerCase() === want) ??
    offered.find((answer) => answer.toLowerCase().includes(want)) ??
    scripted
  );
}

export async function playConversation(
  client: Anthropic,
  variant: Variant,
  household: KakakHousehold,
  kakakCase: KakakCase,
  firstMessage: Anthropic.MessageParam["content"],
): Promise<ConversationResult> {
  checkVariant(variant);
  const caseHousehold: KakakHousehold = { ...household, ownerLocale: kakakCase.ownerLocale };
  // The route's own blocks (engine.ts): her instructions, the guide to
  // Miamus in the owner's language, then this household, each cached.
  const system = kakakSystem(caseHousehold);
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: firstMessage }];
  const result: ConversationResult = { turns: [], rejected: [], calls: [] };
  let retried = false;

  while (result.calls.length < MAX_CALLS) {
    const started = performance.now();
    const startedAt = Date.now();
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: variant.model,
        max_tokens: 4096,
        system,
        tools: toolsFor(caseHousehold),
        tool_choice: { type: "auto" },
        thinking: variant.thinking === "between_tools" ? { type: "between_tools" } : { type: "adaptive" },
        output_config: { effort: variant.effort },
        messages,
      });
    } catch (error) {
      result.error = `API error: ${error instanceof Error ? error.message : String(error)}`;
      if (error instanceof Anthropic.APIError && typeof error.status === "number") result.apiStatus = error.status;
      return result;
    }
    const usage = response.usage;
    const record: CallRecord = {
      startedAt,
      ms: Math.round(performance.now() - started),
      costMicroUsd: costMicroUsd(variant.model, usage),
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
      stopReason: response.stop_reason,
    };
    result.calls.push(record);

    if (response.stop_reason === "refusal") {
      result.turns.push({ kind: "invalid", calls: [], text: "", invalidReason: "refusal" });
      result.error = "refusal";
      return result;
    }
    if (response.stop_reason === "max_tokens") {
      result.turns.push({ kind: "invalid", calls: [], text: "", invalidReason: "ran out of output tokens" });
      result.error = "max_tokens";
      return result;
    }

    const { calls, text } = toCalls(response.content);
    const rejected = calls
      .map((call) => ({ call, check: validateToolCall(caseHousehold, call.name, call.input) }))
      .filter((entry) => !entry.check.ok);

    if (rejected.length > 0) {
      record.rejected = rejected.map(
        (entry) => `${entry.call.name}: ${entry.check.ok ? "" : entry.check.errors.join("; ")}`,
      );
      if (retried) {
        result.turns.push({
          kind: "invalid",
          calls: calls.map(({ name, input }) => ({ name, input })),
          text,
          invalidReason: `failed the route's checks twice: ${record.rejected.join(" | ")}`,
        });
        return result;
      }
      // The route sends the problems back once, as error results.
      retried = true;
      result.rejected.push({
        beforeTurn: result.turns.length,
        turn: { ...classify(calls), calls: calls.map(({ name, input }) => ({ name, input })), text },
      });
      messages.push({ role: "assistant", content: response.content });
      messages.push({
        role: "user",
        content: calls.map((call) => {
          const bad = rejected.find((entry) => entry.call.id === call.id);
          return {
            type: "tool_result" as const,
            tool_use_id: call.id,
            is_error: Boolean(bad),
            content: bad && !bad.check.ok
              ? `Not accepted: ${bad.check.errors.join("; ")}. Correct it and suggest again.`
              : "Not saved: another suggestion in this turn needs correcting first.",
          };
        }),
      });
      continue;
    }

    const plain = calls.map(({ name, input }) => ({ name, input }));
    const classified = classify(plain);
    // A plain reply the owner can't be shown goes back once, with the reason
    // (engine.ts): the turn's one second try, shared with a failed check.
    if (classified.kind === "message" && !retried) {
      const wrong = replyProblems(text, caseHousehold.ownerLocale);
      if (wrong.length > 0) {
        retried = true;
        record.rejected = [`reply not shown: ${wrong.join(", ")}`];
        result.rejected.push({ beforeTurn: result.turns.length, turn: { kind: "message", calls: [], text } });
        if (!wrong.includes("empty")) {
          messages.push({ role: "assistant", content: response.content });
          messages.push({ role: "user", content: correctionFor(wrong, caseHousehold.ownerLocale) });
        }
        continue;
      }
    }
    // What the owner would see: the route's guard on the model's words.
    const guarded =
      classified.kind === "invalid" ? { text, tells: [] } : guardReplyText(classified.kind, text, caseHousehold.ownerLocale);
    const turn: ActualTurn = {
      ...classified,
      calls: plain,
      text: guarded.text,
      ...(guarded.text !== text ? { rawText: text } : {}),
      ...(guarded.tells.length ? { guarded: guarded.tells } : {}),
    };
    result.turns.push(turn);
    if (turn.kind !== "question") return result;

    const reply = scriptedReply(kakakCase, result.turns, result.turns.length - 1);
    if (reply === undefined) return result; // a question no path expects: graded as a failure
    const questionsSoFar = result.turns.filter((t) => t.kind === "question").length;
    if (questionsSoFar > MAX_QUESTIONS) return result; // graded as a must-never
    const offered = ((calls[0].input.answers as unknown[]) ?? []).map(String);
    const answer = pickAnswer(offered, reply);
    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: calls[0].id,
          content:
            questionsSoFar === MAX_QUESTIONS
              ? `${answer}\n(That was the third question: now suggest with what you have.)`
              : answer,
        },
      ],
    });
  }
  result.error = "too many calls";
  return result;
}
