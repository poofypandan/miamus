import type { MouseEvent } from "react";

/**
 * Switching views inside one page without asking the server (Phase 121).
 *
 * The dashboard's tabs and the staff view's pills are the same page with a
 * different ?module= / ?view=. Through <Link> or router.push, each switch was
 * a full navigation: an RSC request for a page whose data is already in the
 * HouseholdProvider, and — on /dashboard — the middleware's two Supabase
 * round trips (getUser, then the membership lookup) before anything moved.
 * The tab highlight is derived from the URL, so it waited for all of that too.
 *
 * The App Router integrates the native History API: pushState updates
 * useSearchParams in place, with no request and no middleware. Back still
 * returns to the previous view, exactly as a push did.
 *
 * Only for URLs on the page already showing. A different route still needs
 * the router.
 */
export function pushInPlace(href: string): void {
  window.history.pushState(null, "", href);
}

/**
 * For a <Link> whose click should become pushInPlace: true for a plain
 * primary click. Cmd/Ctrl/Shift/middle clicks keep their browser meaning —
 * open in a new tab or window — which is why these stay real links with real
 * hrefs rather than buttons.
 */
export function isPlainClick(event: MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/** pushInPlace's counterpart for router.replace: no new Back step. */
export function replaceInPlace(href: string): void {
  window.history.replaceState(null, "", href);
}
