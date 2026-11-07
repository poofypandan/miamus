import { isAuthRetryableFetchError } from "@supabase/supabase-js";

/**
 * True when a failed request never got an answer from the server — no Wi-Fi,
 * a router with no internet behind it, a gateway briefly down — as opposed to
 * the server answering "no" (Phase 146).
 *
 * The difference decides what a person is told. "The house's Wi-Fi is down,
 * this will retry" and "this link has been used" call for opposite actions,
 * and before this every failure on a staff phone read as the second kind.
 */
export function isConnectionError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  // What auth-js throws when the token endpoint is unreachable or answers
  // 502/503/504.
  if (isAuthRetryableFetchError(err)) return true;
  if (!err || typeof err !== "object") return false;
  const { code, message, name } = err as { code?: unknown; message?: unknown; name?: unknown };
  if (name === "AbortError" || name === "TimeoutError") return true;
  // fetch() itself rejecting. Chrome says "Failed to fetch", Safari "Load
  // failed", Firefox "NetworkError when attempting to fetch resource". A
  // TypeError with any other message is a bug, and calling that "offline"
  // would hide it.
  if (err instanceof TypeError) return /fetch|network|load failed/i.test(String(message));
  // PostgREST's shape for the same thing: no HTTP status, so no error code —
  // { message: "TypeError: Failed to fetch", code: "" }. A real refusal from
  // the database always carries one (42501, PGRST116, …).
  return code === "" && typeof message === "string";
}
