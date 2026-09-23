"use client";

import { supabase } from "@/lib/supabase/client";

// Written by the staff gate the first time someone picks their name on this
// phone. On a device that predates invites it is the only evidence we have of
// which household it belongs to (see bind_legacy_device in migrations/089).
const STAFF_ID_KEY = "banyuwangi11:staffId";

function readLegacyStaffId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STAFF_ID_KEY);
  } catch {
    return null;
  }
}

/**
 * Gives this device an identity of its own, signing in anonymously if it has
 * none (Phase 88).
 *
 * Staff have no Google account and never will — the whole point of the app is
 * that a phone is picked up and used. An anonymous session gives them a real
 * auth.uid() all the same, which is what the database needs before it can tell
 * this household's phone from anyone holding the public key.
 *
 * Returns the user id, or null if anonymous sign-ins are switched off on the
 * project, in which case the caller falls back to whatever it knew before.
 */
export async function ensureAnonymousSession(): Promise<string | null> {
  if (!supabase) return null;

  const existing = (await supabase.auth.getSession()).data.session;
  if (existing?.user) return existing.user.id;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    // The most likely cause is the Anonymous provider being disabled. Loud in
    // the console, silent on screen: the staff view still renders, it just
    // won't see anything once the lockdown is applied.
    console.error("Anonymous sign-in failed", error);
    return null;
  }
  return data.user.id;
}

/**
 * The grandfather upgrade: a phone that has been logging tasks for months
 * gets an anonymous identity and is bound to the household whose staff member
 * it belongs to — without anyone seeing a sign-in screen.
 *
 * Returns the household id it bound to, or null when there is nothing to go
 * on (no staff marker) or the household's legacy window has closed.
 */
export async function upgradeLegacyDevice(): Promise<string | null> {
  const staffId = readLegacyStaffId();
  if (!staffId || !supabase) return null;

  const userId = await ensureAnonymousSession();
  if (!userId) return null;

  const { data, error } = await supabase.rpc("bind_legacy_device", { p_staff_id: staffId });
  if (error || !data) {
    console.error("Legacy device binding failed", error);
    return null;
  }
  return data;
}
