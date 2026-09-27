"use client";

import { supabase } from "@/lib/supabase/client";

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
 *
 * Signing in is not the same as being let in: a fresh anonymous session can
 * see nothing until it is bound to a household, and since Phase 97 the only
 * thing that binds it is redeeming an invite token (/join/staff).
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
