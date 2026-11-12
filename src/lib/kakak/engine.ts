// One turn of a Kakak conversation, as the route runs it
// (docs/phase-156-step2-kakak-plan.md, sections 2 and 4). Kept apart from the
// route so it can be tested against a fake API: the route supplies the
// client, the household and the two database calls (begin, record).
//
// The conversation lives on the phone. Each turn the phone sends back the
// history this function returned last time, plus what the owner typed or
// tapped; nothing of it is stored on the server. The assistant turns go back
// to Claude unchanged (thinking blocks and their signatures included), which
// is what tool use with thinking requires.

import type Anthropic from "@anthropic-ai/sdk";
import { costMicroUsd, type KakakModel } from "./cost";
import { jakartaNow, type RefMap, type RefNames } from "./context";
import { renderHouseholdBlock, type KakakHousehold } from "./household";
import { KAKAK_SYSTEM_PROMPT } from "./prompt";
import { toSuggestion, type KakakSuggestion } from "./suggestions";
import { KAKAK_TOOLS, KAKAK_TOOL_NAMES } from "./tools";
import { validateToolCall } from "./validate";

export const MAX_TYPED = 500;
export const MAX_CALLS_PER_CONVERSATION = 8;
export const MAX_QUESTIONS = 3;
export const MAX_TOKENS = 4000;
/** The history as JSON; thinking blocks are most of it. */
export const MAX_HISTORY_BYTES = 200_000;

export type KakakEffort = "low" | "medium" | "high";

export interface KakakHistory {
  messages: Anthropic.MessageParam[];
  /**
   * When the conversation began (ISO 8601). Every turn builds the household
   * block, with its "Today … 08.30" line, from this moment rather than from
   * the clock, so the system prompt stays byte-identical across turns. The
   * API requires that for the thinking blocks Kakak replays ("preserved
   * thinking" on Opus 5.5, enforced for accounts created from 2026-08-31),
   * and it keeps the household block cached for the whole conversation.
   * Without it, answering Kakak's question a minute later is a 400.
   */
  startedAt?: string;
}

/** How long one conversation may last before the owner starts again. */
export const MAX_CONVERSATION_MS = 6 * 60 * 60 * 1000;
/** A phone clock a little ahead of the server's is fine; more is not. */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export type RefusalReason = "not_admin" | "not_allowed" | "off" | "limit" | "busy";

export type BeginResult =
  | { ok: true; requestId: string; callsLeft: number }
  | { ok: false; reason: RefusalReason };

export interface CallRecord {
  model: string;
  outcome: "question" | "suggestion" | "message" | "error";
  tools: string[];
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  costMicroUsd: number;
  latencyMs: number;
}

export type TurnResult =
  | { kind: "question"; question: string; answers: string[]; allowTyping: boolean; requestId: string; history: KakakHistory }
  | { kind: "suggestions"; text: string; items: KakakSuggestion[]; requestId: string; history: KakakHistory }
  | { kind: "message"; text: string; requestId: string; history: KakakHistory }
  | { kind: "refused"; reason: RefusalReason }
  /** Checked twice and still wrong, or the API failed: nothing to show but "add it yourself". */
  | { kind: "failed"; reason: "invalid" | "api" | "too_long" | "refusal" };

export interface TurnDeps {
  client: Anthropic;
  model: KakakModel;
  effort: KakakEffort;
  household: KakakHousehold;
  refs: RefMap;
  names: RefNames;
  begin: () => Promise<BeginResult>;
  record: (requestId: string, call: CallRecord) => Promise<void>;
  /** The conversation's start (KakakHistory.startedAt), handed back with the history. */
  startedAt?: string;
}

export class BadTurnError extends Error {}
/** The sheet was left open for hours, or past midnight in Jakarta: start a new conversation. */
export class StaleConversationError extends BadTurnError {}

/** The moment this conversation's household block is built from: its start, or now for a new one. */
export function conversationStart(history: KakakHistory, now: number = Date.now()): Date {
  return history.startedAt ? new Date(history.startedAt) : new Date(now);
}

const ASSISTANT_BLOCKS = new Set(["thinking", "redacted_thinking", "text", "tool_use"]);

/**
 * Checks the history the phone sent back is the shape this function hands
 * out: alternating turns starting with the owner, only the block types Kakak
 * produces, typed text within limits, and no more calls than allowed. An
 * owner could still forge earlier turns; that only steers their own
 * suggestions, which are checked again like any other (plan, section 5).
 */
export function checkHistory(history: unknown, now: number = Date.now()): KakakHistory {
  if (history === null || history === undefined) return { messages: [] };
  if (typeof history !== "object" || !Array.isArray((history as KakakHistory).messages)) {
    throw new BadTurnError("history is not a list of messages");
  }
  const startedAt = (history as KakakHistory).startedAt;
  if (startedAt !== undefined) {
    const at = typeof startedAt === "string" ? Date.parse(startedAt) : NaN;
    if (Number.isNaN(at)) throw new BadTurnError("startedAt is not a date");
    if (at > now + CLOCK_SKEW_MS || at < now - MAX_CONVERSATION_MS) {
      throw new StaleConversationError("the conversation is too old");
    }
    // Past midnight in Jakarta, the frozen "today" would be yesterday, and
    // "besok" or "today" in an answer would land on the wrong date (Codex,
    // PR #68): start again rather than change the system prompt.
    if (jakartaNow(new Date(at)).today !== jakartaNow(new Date(now)).today) {
      throw new StaleConversationError("the day changed during the conversation");
    }
  }
  if (JSON.stringify(history).length > MAX_HISTORY_BYTES) throw new BadTurnError("history is too long");
  const messages = (history as KakakHistory).messages;
  messages.forEach((message, index) => {
    const role = index % 2 === 0 ? "user" : "assistant";
    if (!message || message.role !== role) throw new BadTurnError(`message ${index} should be from the ${role}`);
    if (role === "user") {
      if (typeof message.content === "string") {
        if (message.content.length > MAX_TYPED) throw new BadTurnError("typed text is too long");
        return;
      }
      if (!Array.isArray(message.content)) throw new BadTurnError(`message ${index} has no content`);
      for (const block of message.content) {
        if (block.type !== "tool_result" || typeof block.content !== "string" || block.content.length > 2000) {
          throw new BadTurnError(`message ${index} has an unexpected block`);
        }
      }
      return;
    }
    if (!Array.isArray(message.content)) throw new BadTurnError(`message ${index} has no content`);
    for (const block of message.content) {
      if (!ASSISTANT_BLOCKS.has(block.type)) throw new BadTurnError(`message ${index} has an unexpected block`);
      if (block.type === "tool_use" && !(KAKAK_TOOL_NAMES as readonly string[]).includes(block.name)) {
        throw new BadTurnError(`message ${index} uses an unknown tool`);
      }
      // Kakak's own words and calls are short. Thinking blocks are signed by
      // Anthropic, so a forged one is refused by the API itself.
      if (block.type === "text" && block.text.length > 2000) throw new BadTurnError(`message ${index} is too long`);
      if (block.type === "tool_use" && JSON.stringify(block.input ?? {}).length > 4000) {
        throw new BadTurnError(`message ${index} is too long`);
      }
    }
  });
  if (messages.length > 0 && messages.length % 2 !== 0) throw new BadTurnError("history must end with Kakak's turn");
  return startedAt === undefined ? { messages } : { messages, startedAt };
}

function toolUses(message: Anthropic.MessageParam | undefined): Anthropic.ToolUseBlockParam[] {
  if (!message || !Array.isArray(message.content)) return [];
  return (message.content as Anthropic.ContentBlockParam[]).filter(
    (block): block is Anthropic.ToolUseBlockParam => block.type === "tool_use",
  );
}

function questionsAsked(messages: Anthropic.MessageParam[]): number {
  return messages.filter((m) => m.role === "assistant" && toolUses(m).some((t) => t.name === "ask_question")).length;
}

/** The owner's words, as the next user turn after the history. */
export function nextUserTurn(history: KakakHistory, reply: string): Anthropic.MessageParam {
  const text = reply.trim();
  if (!text) throw new BadTurnError("nothing was typed");
  if (text.length > MAX_TYPED) throw new BadTurnError("typed text is too long");
  const last = history.messages[history.messages.length - 1];
  const uses = toolUses(last);
  if (uses.length === 0) return { role: "user", content: text };
  if (uses.length === 1 && uses[0].name === "ask_question") {
    const third = questionsAsked(history.messages) >= MAX_QUESTIONS;
    return {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: uses[0].id,
          content: third ? `${text}\n(That was the third question: now suggest with what you have.)` : text,
        },
      ],
    };
  }
  // The owner typed a correction instead of tapping "Looks right".
  return {
    role: "user",
    content: uses.map((use, index) => ({
      type: "tool_result" as const,
      tool_use_id: use.id,
      content: index === 0 ? `Not saved. The owner says: ${text}` : "Not saved.",
    })),
  };
}

function problemsWith(
  household: KakakHousehold,
  calls: Anthropic.ToolUseBlock[],
  priorQuestions: number,
): Map<string, string[]> {
  const problems = new Map<string, string[]>();
  const questions = calls.filter((c) => c.name === "ask_question");
  for (const call of calls) {
    const check = validateToolCall(household, call.name, (call.input ?? {}) as Record<string, unknown>);
    const errors = check.ok ? [] : [...check.errors];
    if (call.name === "ask_question") {
      if (questions.length < calls.length) errors.push("a question can't come with suggestions in the same turn");
      if (questions.length > 1) errors.push("only one question per turn");
      if (priorQuestions >= MAX_QUESTIONS) errors.push("no more questions: suggest with what you have");
    }
    if (errors.length) problems.set(call.id, errors);
  }
  return problems;
}

/** Every tool this household can use: a switched-off module's tool isn't offered. */
export function toolsFor(household: KakakHousehold): Anthropic.Tool[] {
  // Pets (Phase 162), Food at home (Phase 171), and ingredients' places
  // (Phase 176), which exist only while Kitchen amounts and Food at home are
  // both on. Every other household gets the list as it was.
  if (!household.petsOff && !household.foodOff && household.ingredientsOn) return KAKAK_TOOLS;
  return KAKAK_TOOLS.filter(
    (tool) =>
      !(household.petsOff && tool.name === "add_pet_routine") &&
      !(household.foodOff && tool.name === "add_food") &&
      !(!household.ingredientsOn && tool.name === "put_away_ingredient"),
  );
}

export async function runKakakTurn(deps: TurnDeps, historyIn: unknown, reply: string): Promise<TurnResult> {
  const history = checkHistory(historyIn);
  const messages: Anthropic.MessageParam[] = [...history.messages, nextUserTurn(history, reply)];
  const system: Anthropic.TextBlockParam[] = [
    // Breakpoint 1: instructions and tools, the same for every household.
    { type: "text", text: KAKAK_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    // Breakpoint 2: this household, cached within the conversation.
    { type: "text", text: renderHouseholdBlock(deps.household), cache_control: { type: "ephemeral" } },
  ];
  let retried = false;

  for (;;) {
    if (messages.filter((m) => m.role === "assistant").length >= MAX_CALLS_PER_CONVERSATION) {
      return { kind: "failed", reason: "too_long" };
    }
    const begun = await deps.begin();
    if (!begun.ok) return { kind: "refused", reason: begun.reason };

    const started = Date.now();
    let response: Anthropic.Message;
    try {
      response = await deps.client.messages.create({
        model: deps.model,
        max_tokens: MAX_TOKENS,
        system,
        tools: toolsFor(deps.household),
        tool_choice: { type: "auto" },
        thinking: { type: "adaptive" },
        output_config: { effort: deps.effort },
        messages,
      });
    } catch (error) {
      await deps.record(begun.requestId, emptyRecord(deps.model, Date.now() - started)).catch(() => undefined);
      throw error;
    }
    const usage = response.usage;
    const calls = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    const record: CallRecord = {
      model: deps.model,
      outcome: "error",
      tools: [...new Set(calls.map((c) => c.name))].filter((n) => (KAKAK_TOOL_NAMES as readonly string[]).includes(n)),
      inputTokens: usage.input_tokens,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
      outputTokens: usage.output_tokens,
      costMicroUsd: costMicroUsd(deps.model, usage),
      latencyMs: Date.now() - started,
    };

    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      await deps.record(begun.requestId, record);
      return { kind: "failed", reason: response.stop_reason === "refusal" ? "refusal" : "invalid" };
    }

    const problems = problemsWith(deps.household, calls, questionsAsked(messages));
    if (problems.size > 0) {
      await deps.record(begun.requestId, record);
      if (retried) return { kind: "failed", reason: "invalid" };
      retried = true;
      messages.push({ role: "assistant", content: response.content });
      messages.push({
        role: "user",
        content: calls.map((call) => {
          const errors = problems.get(call.id);
          return {
            type: "tool_result" as const,
            tool_use_id: call.id,
            is_error: Boolean(errors),
            content: errors
              ? `Not accepted: ${errors.join("; ")}. Correct it and suggest again.`
              : "Not saved: another part of this turn needs correcting first.",
          };
        }),
      });
      continue;
    }

    messages.push({ role: "assistant", content: response.content });
    const out: KakakHistory = deps.startedAt ? { messages, startedAt: deps.startedAt } : { messages };

    if (calls.length === 1 && calls[0].name === "ask_question") {
      record.outcome = "question";
      await deps.record(begun.requestId, record);
      const input = calls[0].input as { question: string; answers: string[]; allow_typing: boolean };
      return {
        kind: "question",
        question: input.question.trim(),
        answers: input.answers.map((a) => a.trim()),
        allowTyping: input.allow_typing,
        requestId: begun.requestId,
        history: out,
      };
    }

    const items = calls
      .map((call) => toSuggestion(deps.household, deps.refs, deps.names, call.name, (call.input ?? {}) as Record<string, unknown>))
      .filter((item): item is KakakSuggestion => item !== null);
    if (calls.length === 0 || items.length === 0) {
      record.outcome = "message";
      await deps.record(begun.requestId, record);
      return { kind: "message", text, requestId: begun.requestId, history: out };
    }
    record.outcome = "suggestion";
    await deps.record(begun.requestId, record);
    return { kind: "suggestions", text, items, requestId: begun.requestId, history: out };
  }
}

function emptyRecord(model: string, latencyMs: number): CallRecord {
  return {
    model,
    outcome: "error",
    tools: [],
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    costMicroUsd: 0,
    latencyMs,
  };
}
