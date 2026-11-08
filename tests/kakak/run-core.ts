// Plays one Kakak conversation against the real API, the way the planned
// route will (docs/phase-156-step2-kakak-plan.md, sections 2–4): cached
// instructions and tools, the household block, one tool call or reply per
// turn, scripted answers to questions, one retry after a call that fails the
// route's checks. Used by run-test-set.ts and run-photos.ts. Costs money.

import Anthropic from "@anthropic-ai/sdk";
import { costMicroUsd, type KakakModel } from "@/lib/kakak/cost";
import { renderHouseholdBlock, type KakakHousehold } from "@/lib/kakak/household";
import { KAKAK_SYSTEM_PROMPT } from "@/lib/kakak/prompt";
import { KAKAK_TOOLS } from "@/lib/kakak/tools";
import { validateToolCall } from "@/lib/kakak/validate";
import { scriptedReply, type ActualTurn, type ToolCall } from "./grade";
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
  calls: CallRecord[];
  /** Set when the conversation stopped for a reason other than its end. */
  error?: string;
}

/**
 * A client that always talks to Anthropic directly. ANTHROPIC_BASE_URL is
 * ignored on purpose: tools that wrap Claude (Claude Code among them) set it
 * in the shell, and the eval must measure the real API.
 */
export function makeClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set. See docs/kakak-eval.md, 'Before the first run'.");
  }
  return new Anthropic({
    apiKey,
    authToken: null,
    baseURL: process.env.KAKAK_EVAL_BASE_URL ?? "https://api.anthropic.com",
    maxRetries: 3,
  });
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
  const system: Anthropic.TextBlockParam[] = [
    // Breakpoint 1: instructions + tools, the same for every household.
    { type: "text", text: KAKAK_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    // Breakpoint 2: this household, cached within the conversation.
    { type: "text", text: renderHouseholdBlock(caseHousehold), cache_control: { type: "ephemeral" } },
  ];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: firstMessage }];
  const result: ConversationResult = { turns: [], calls: [] };
  let retried = false;

  while (result.calls.length < MAX_CALLS) {
    const started = performance.now();
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: variant.model,
        max_tokens: 4096,
        system,
        tools: KAKAK_TOOLS,
        tool_choice: { type: "auto" },
        thinking: variant.thinking === "between_tools" ? { type: "between_tools" } : { type: "adaptive" },
        output_config: { effort: variant.effort },
        messages,
      });
    } catch (error) {
      result.error = `API error: ${error instanceof Error ? error.message : String(error)}`;
      return result;
    }
    const usage = response.usage;
    const record: CallRecord = {
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
    const turn: ActualTurn = { ...classify(plain), calls: plain, text };
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
