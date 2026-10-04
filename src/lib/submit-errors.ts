/**
 * Why a save failed, in the terms a staff member can act on (Phase 133).
 *
 *   - "update":  the app was redeployed while this tab was open, and the
 *                code it needs next no longer exists on the server. Only a
 *                reload fixes it.
 *   - "network": the request never reached the server. Trying again later
 *                will work.
 *   - "other":   the server answered and said no.
 *
 * Read from the message, since none of these have a reliable type: a missing
 * chunk is webpack's ChunkLoadError in one browser and a TypeError from a
 * dynamic import in another, and supabase-js turns a failed fetch into an
 * error object whose message carries the browser's own wording.
 */
export type SubmitFailure = "update" | "network" | "other";

const UPDATE_PATTERNS = [
  /Loading chunk [\w-]+ failed/i,
  /Loading CSS chunk/i,
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Failed to find Server Action/i,
];

const NETWORK_PATTERNS = [
  /Failed to fetch/i, // Chrome
  /Load failed/i, // Safari
  /NetworkError when attempting to fetch resource/i, // Firefox
  /Network request failed/i,
  /The network connection was lost/i,
  /The Internet connection appears to be offline/i,
];

function messageOf(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

export function classifySubmitError(err: unknown): SubmitFailure {
  const message = messageOf(err);
  // Checked first: "Failed to fetch dynamically imported module" would
  // otherwise read as a dropped connection.
  if (/ChunkLoadError/.test(message) || UPDATE_PATTERNS.some((p) => p.test(message))) {
    return "update";
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) return "network";
  if (NETWORK_PATTERNS.some((p) => p.test(message))) return "network";
  return "other";
}

const RELOAD_MARK = "miamus_update_reload_at";
/** A reload this recent that did not fix it will not be fixed by another. */
const RELOAD_COOLDOWN_MS = 30_000;

/**
 * Reloads onto the new version — at most once per cooldown, so a failure
 * that survives a reload (a broken deploy, a CDN still serving the old
 * manifest) cannot trap the phone in a reload loop. Returns false when it
 * declined, so the caller can fall back to an ordinary error.
 */
export function reloadForUpdate(delayMs = 1200): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_MARK));
    if (last && Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    window.sessionStorage.setItem(RELOAD_MARK, String(Date.now()));
  } catch {
    // No sessionStorage: reload anyway; the loop guard is a nicety.
  }
  window.setTimeout(() => window.location.reload(), delayMs);
  return true;
}
