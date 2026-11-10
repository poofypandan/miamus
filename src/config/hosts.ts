/**
 * Where Miamus lives, and the addresses it used to live at (address move,
 * 2026-11-10).
 *
 * Browser storage belongs to one address. A phone that still opens an old
 * address has its own sign-in there and its own queue of unsent logs
 * (lib/offline-queue.ts), so the app on an old address sends that queue
 * first and then shows the way to the current one (AddressMoveGate).
 *
 * One list, here. Exact host names only: Vercel's preview deployments are
 * also on vercel.app and must keep working as they are.
 */

/** The current address. */
export const CANONICAL_HOST = "miamus.app";
export const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`;

/**
 * Old addresses that still serve the app. Taken off this list only after the
 * old address redirects to the current one on the server (a Vercel setting,
 * owner's decision) — until then a phone there may hold unsent logs.
 */
export const OLD_HOSTS: readonly string[] = ["miamus.vercel.app"];

export function isOldHost(hostname: string | null | undefined): boolean {
  if (!hostname) return false;
  return OLD_HOSTS.includes(hostname.toLowerCase());
}
