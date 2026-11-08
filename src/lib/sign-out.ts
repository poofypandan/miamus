"use client";

/**
 * Signing out of Miamus on this phone (owner request, 2026-11-08: "it's scary
 * if someone wants to stop using a service and doesn't know how to log out").
 *
 * One path for owners and staff. It does more than end the session: a phone
 * can be handed to someone else, so what Miamus remembered about the
 * household on it goes too — the cached copy of the household, which staff
 * member this phone was, the household it was linked to, and app lock.
 * Nothing in the household itself changes; signing in again brings it all back.
 */

import { del } from "idb-keyval";
import { getOfflineQueue } from "@/lib/offline-queue";
import { hasPendingPhotos } from "@/lib/photo-queue";
import { clearCachedOwnerLocale } from "@/lib/owner-locale";
import { setAppLockEnabled } from "@/lib/app-lock";
import { TENANT_STORAGE_KEY } from "@/lib/tenant";

/** Keys in this phone's storage that belong to the signed-in person. */
const LOCAL_KEYS = [
  TENANT_STORAGE_KEY,
  "banyuwangi11:staffId",
  "banyuwangi11:staffName",
  "banyuwangi11:isOwner",
];
const SESSION_KEYS = ["miamus_owner_unlocked_at"];
const SNAPSHOT_PREFIX = "miamus_snapshot_v";
const OFFLINE_QUEUE_KEY = "b11-sync-queue";

/**
 * True when something logged on this phone has not reached the server yet.
 * Signing out now would lose it, so the sheet says so first.
 */
export async function hasUnsavedWork(): Promise<boolean> {
  try {
    if (hasPendingPhotos()) return true;
    return (await getOfflineQueue()).length > 0;
  } catch {
    return false;
  }
}

function clearLocalData(): void {
  try {
    for (const key of LOCAL_KEYS) window.localStorage.removeItem(key);
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(SNAPSHOT_PREFIX)) window.localStorage.removeItem(key);
    }
  } catch {
    // Storage blocked: nothing was stored to clear.
  }
  try {
    for (const key of SESSION_KEYS) window.sessionStorage.removeItem(key);
  } catch {
    // As above.
  }
}

/**
 * Ends this phone's session and forgets the household on it, then opens the
 * start screen. Every clean-up step is best-effort: a failure in one must
 * never leave someone signed in.
 */
export async function signOutThisDevice(): Promise<void> {
  setAppLockEnabled(false);
  clearCachedOwnerLocale();
  try {
    // Stops this phone's notifications. Done while still signed in: only the
    // signed-in person may delete their own subscription row (Phase 119).
    const { disablePush } = await import("@/lib/push");
    await disablePush().catch((err) => console.error("Push clean-up on sign-out failed", err));
    // Unsent logs would otherwise be sent later under whoever signs in next.
    await del(OFFLINE_QUEUE_KEY).catch(() => undefined);
    const { supabase } = await import("@/lib/supabase/client");
    await supabase?.auth.signOut();
  } finally {
    clearLocalData();
    // A full page load, not a client-side route change: the household held
    // in memory (context, caches) must not survive into the next session.
    window.location.replace("/");
  }
}
