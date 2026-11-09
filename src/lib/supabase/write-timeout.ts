/**
 * A deadline for saves (Phase 161, R10).
 *
 * On one bar of Wi-Fi a request can hang for minutes without failing, and a
 * save that never fails is never queued: the staff member watches a spinner,
 * gives up and closes the app. So a write to a table gives up after
 * WRITE_TIMEOUT_MS, the save queue (lib/offline-queue.ts) keeps it, and the
 * retry sends the same row ids — a write that did land in the meantime is
 * not saved twice.
 *
 * Only writes to tables (POST, PATCH, DELETE on /rest/v1/<table>). Reads have
 * their own retry loop (Phase 146); RPCs include slow, one-off jobs (organising
 * rooms, the household export) that must not be cut short; and photo uploads
 * on a weak signal legitimately take a long time.
 */
export const WRITE_TIMEOUT_MS = 20_000;

export function isTableWrite(url: string, method: string | undefined): boolean {
  const verb = (method ?? "GET").toUpperCase();
  if (verb === "GET" || verb === "HEAD" || verb === "OPTIONS") return false;
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  return path.includes("/rest/v1/") && !path.includes("/rest/v1/rpc/");
}

export function fetchWithWriteTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = WRITE_TIMEOUT_MS
): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = init?.method ?? (typeof input === "object" && "method" in input ? input.method : undefined);
  // A caller's own signal wins: it already decides when to give up.
  if (init?.signal || !isTableWrite(url, method)) return fetch(input, init);
  const controller = new AbortController();
  const timer = setTimeout(() => {
    // TimeoutError, not AbortError: postgrest-js re-throws an AbortError as
    // a deliberate cancel, but reports this as a failed request with no
    // answer — which lib/network-errors.ts reads as a connection problem.
    controller.abort(new DOMException("The save timed out", "TimeoutError"));
  }, timeoutMs);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}
