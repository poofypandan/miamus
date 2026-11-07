"use client";

import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { isConnectionError } from "@/lib/network-errors";

/**
 * True when this device has a session that cannot be used *right now* — the
 * access token ran out overnight and the refresh that would renew it could
 * not reach the server (Phase 146).
 *
 * supabase-js reports that exactly as it reports "never signed in": a null
 * session. The difference is only in the error beside it, and it matters a
 * great deal. The session is still on the phone and will renew itself once
 * the Wi-Fi is back. Treating it as missing is how a staff phone ends up
 * signed in afresh as somebody new (see ensureAnonymousSession), and how a
 * query goes out with only the public key and comes back from RLS as an
 * empty household.
 */
export async function isSessionUnreachable(): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.auth.getSession();
  return !data.session && isAuthRetryableFetchError(error);
}

/**
 * The user this device's stored session belongs to, read straight from
 * storage — without renewing it, and so without touching the network
 * (Phase 146).
 *
 * getSession() cannot answer "whose phone is this?" quickly in the one case
 * that matters most: the first open of the morning. The access token ran out
 * overnight, so it renews it first, and on bad Wi-Fi auth-js keeps retrying
 * that for up to 30 seconds. Who the session belongs to does not depend on
 * whether the token is fresh, and the stored copy already says.
 *
 * Reads the auth client's own storage adapter, so the cookie chunking and
 * base64 encoding are decoded exactly as auth-js itself would. Those two
 * fields are not in its public types; anything unexpected returns null and
 * the caller takes the slow path.
 */
export async function peekStoredUser(): Promise<{ id: string; isAnonymous: boolean } | null> {
  if (!supabase) return null;
  try {
    const auth = supabase.auth as unknown as {
      storage?: { getItem(key: string): string | null | Promise<string | null> };
      storageKey?: string;
    };
    if (!auth.storage || !auth.storageKey) return null;
    const raw = await auth.storage.getItem(auth.storageKey);
    if (!raw) return null;
    const user = (JSON.parse(raw) as { user?: { id?: unknown; is_anonymous?: unknown } }).user;
    if (typeof user?.id !== "string") return null;
    return { id: user.id, isAnonymous: user.is_anonymous === true };
  } catch {
    return null;
  }
}

/** What ensureAnonymousSession found or made. */
export type DeviceIdentity =
  | { status: "ready"; userId: string; isAnonymous: boolean }
  /** No answer from the server: the session it has is out of reach, or the sign-in never arrived. */
  | { status: "offline" }
  /** The server refused: anonymous sign-ins switched off, or no Supabase configured. */
  | { status: "unavailable" };

/**
 * Gives this device an identity of its own, signing in anonymously if it has
 * none (Phase 88).
 *
 * Staff have no Google account and never will — the whole point of the app is
 * that a phone is picked up and used. An anonymous session gives them a real
 * auth.uid() all the same, which is what the database needs before it can tell
 * this household's phone from anyone holding the public key.
 *
 * Signing in is not the same as being let in: a fresh anonymous session can
 * see nothing until it is bound to a household, and since Phase 97 the only
 * thing that binds it is redeeming an invite token (/join/staff).
 *
 * Never signs in over a session that is only out of reach (Phase 147). Until
 * then, an expired token plus bad Wi-Fi read as "no session", and the device
 * was signed in afresh as a brand-new anonymous user — the old one, still
 * bound and still valid, abandoned on the server. The live household shows
 * the pattern: eleven device sessions for three staff, each orphan holding a
 * refresh token that was never used again, each replaced the morning after
 * its last use. Now that case is reported as offline, and the caller waits
 * for the connection instead.
 */
export async function ensureAnonymousSession(): Promise<DeviceIdentity> {
  if (!supabase) return { status: "unavailable" };

  const { data: existing, error: readError } = await supabase.auth.getSession();
  const user = existing.session?.user;
  if (user) return { status: "ready", userId: user.id, isAnonymous: user.is_anonymous === true };
  if (isAuthRetryableFetchError(readError)) return { status: "offline" };

  const { data, error } = await supabase.auth.signInAnonymously();
  if (data.user && !error) return { status: "ready", userId: data.user.id, isAnonymous: true };
  if (isConnectionError(error)) return { status: "offline" };
  // The most likely cause is the Anonymous provider being disabled. Loud in
  // the console; the caller says on screen that this phone could not be set
  // up.
  console.error("Anonymous sign-in failed", error);
  return { status: "unavailable" };
}
