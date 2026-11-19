"use client";

// The phone's side of /api/kakak: sends the owner's words with the history
// the route handed back last time, and turns every failure into one of the
// plain messages on screen 8 of the plan. Nothing here is stored: the
// conversation lives in the open sheet and is forgotten when it closes.

import type { KakakHistory, RefusalReason } from "./engine";
import type { KakakSuggestion } from "./suggestions";

/** `practice`: the server is in practice mode (scripted answers, no AI). */
export type KakakReply =
  | { kind: "question"; question: string; answers: string[]; allowTyping: boolean; requestId: string; history: KakakHistory; practice?: boolean }
  | { kind: "suggestions"; text: string; items: KakakSuggestion[]; requestId: string; history: KakakHistory; practice?: boolean }
  | { kind: "message"; text: string; requestId: string; history: KakakHistory; practice?: boolean }
  | { kind: "refused"; reason: RefusalReason | "unavailable" }
  | { kind: "failed"; reason: KakakFailure };

/**
 * Why a turn failed, as the sheet words it. `cap`: the monthly spend limit;
 * `slow`: timed out; `stale`: the sheet was open for hours; `offline`: no
 * internet on the phone.
 */
export type KakakFailure = "invalid" | "api" | "too_long" | "refusal" | "offline" | "cap" | "slow" | "stale";

/**
 * What this page can show, sent with every turn. The route sends a newer
 * kind of card only to a page that says it knows it (route.ts), so a page
 * left open across a deploy is asked to reopen instead of crashing.
 *   2 (2026-11-14): a new ingredient's card, and amounts on an ingredient.
 *   3 (Phase 178 follow-up): what a staff member sees.
 */
export const KAKAK_CLIENT_VERSION = 3;

/**
 * A long chat rolls over (2026-11-14). A conversation may hold only so many
 * of Kakak's turns (engine.ts MAX_CALLS_PER_CONVERSATION), and now that she
 * answers questions an owner can simply keep asking. So once she has spoken
 * this many times, and the conversation is at rest (her last turn was a
 * plain reply: no question waiting for an answer, no card waiting to be
 * confirmed), the next words start a new conversation. Earlier turns can't
 * be dropped one by one: the API takes a history whole or not at all.
 */
export const FRESH_AFTER_TURNS = 5;

/** The history the next words go with: this one, or none once a long chat is at rest. */
export function historyForNextTurn(history: KakakHistory | null, atRest: boolean): KakakHistory | null {
  if (!history || !atRest) return history;
  const hers = history.messages.filter((message) => message.role === "assistant").length;
  return hers >= FRESH_AFTER_TURNS ? null : history;
}

export async function askKakak(
  householdId: string,
  history: KakakHistory | null,
  reply: string,
  locale: "en" | "id",
  signal?: AbortSignal,
): Promise<KakakReply> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { kind: "failed", reason: "offline" };
  let response: Response;
  try {
    response = await fetch("/api/kakak", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ householdId, history, reply, locale, v: KAKAK_CLIENT_VERSION }),
      signal,
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    return { kind: "failed", reason: "offline" };
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Not JSON (a proxy error page): treated as a failure below.
  }
  const kind = (body as { kind?: string } | null)?.kind;
  if (kind === "question" || kind === "suggestions" || kind === "message" || kind === "refused" || kind === "failed") {
    return body as KakakReply;
  }
  if (response.status === 401 || response.status === 403) return { kind: "refused", reason: "not_admin" };
  return { kind: "failed", reason: "api" };
}

/** What the owner did with a suggestion; statistics only, so failures are ignored. */
export function reportKakakOutcome(requestId: string, result: "confirmed" | "changed" | "cancelled" | "undone"): void {
  void fetch("/api/kakak/outcome", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestId, result }),
    keepalive: true,
  }).catch(() => undefined);
}
