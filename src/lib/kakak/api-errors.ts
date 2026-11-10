import Anthropic from "@anthropic-ai/sdk";

// What the owner sees when the call to Anthropic itself fails (plan, screen
// 8). Each failure becomes one plain reason; the sheet turns it into a
// sentence and offers "Try again" only where trying again can help.
//
//   cap          the Console workspace's monthly spend limit (US$20 for the
//                family phase), or the organisation's tier limit: no point
//                retrying until next month or until the limit is raised
//   busy         rate limited or overloaded: try again in a minute
//   slow         timed out: try again
//   unavailable  the key is wrong, revoked or not allowed: the operator
//                must fix it, the owner can't
//   api          anything else

export type ApiFailure =
  | { kind: "failed"; reason: "cap" | "slow" | "api" }
  | { kind: "refused"; reason: "busy" | "unavailable" };

export interface ClassifiedFailure {
  body: ApiFailure;
  status: number;
  /** For the server log: never the household's words. */
  log: string;
}

// The workspace spend limit has no stable error code in the SDK's types (the
// tier limit does: enforced_spend_limit_reached), so its message is the only
// signal. Matched on a 400/402 only, and a miss just reads as "api".
const SPEND_WORDS = /\b(spend(ing)? limits?|usage limits?|credit balance)\b/i;

export function classifyApiError(error: unknown): ClassifiedFailure {
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return { body: { kind: "failed", reason: "slow" }, status: 504, log: "timeout" };
  }
  if (error instanceof Anthropic.APIError) {
    const name = `${error.status ?? "?"} ${error.type ?? error.name}`;
    const message = error.apiMessage ?? "";
    if (
      error.errorCode === "enforced_spend_limit_reached" ||
      error.type === "billing_error" ||
      ((error.status === 400 || error.status === 402 || error.status === 429) && SPEND_WORDS.test(message))
    ) {
      return { body: { kind: "failed", reason: "cap" }, status: 200, log: `${name}: spend limit reached` };
    }
    if (error.status === 401 || error.status === 403) {
      return { body: { kind: "refused", reason: "unavailable" }, status: 503, log: `${name}: check ANTHROPIC_API_KEY` };
    }
    if (error.status === 429 || error.status === 529 || error.type === "overloaded_error") {
      return { body: { kind: "refused", reason: "busy" }, status: 429, log: name };
    }
    return { body: { kind: "failed", reason: "api" }, status: 502, log: name };
  }
  return { body: { kind: "failed", reason: "api" }, status: 502, log: (error as Error)?.name ?? "unknown" };
}
