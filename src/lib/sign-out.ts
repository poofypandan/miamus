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

import { clear, createStore, del } from "idb-keyval";
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
const CHORE_DRAFT_PREFIX = "miamus_chore_draft:";
const OFFLINE_QUEUE_KEY = "b11-sync-queue";

/**
 * True when something logged on this phone has not reached the server yet.
 * Signing out now would lose it, so the sheet says so first.
 */
export async function hasUnsavedWork(): Promise<boolean> {
  try {
    if (hasPendingPhotos()) return true;
    if (Object.keys(window.localStorage).some((key) => key.startsWith(CHORE_DRAFT_PREFIX))) return true;
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
      if (key?.startsWith(SNAPSHOT_PREFIX) || key?.startsWith(CHORE_DRAFT_PREFIX)) {
        window.localStorage.removeItem(key);
      }
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
 * The session's own copy on this phone (cookies and storage named "sb-…"),
 * removed by hand. Used when the sign-out request can't reach the server:
 * this phone must still be signed out (Codex review, PR #17).
 */
function forgetStoredSession(): void {
  for (const part of document.cookie.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (name?.startsWith("sb-")) document.cookie = `${name}=; Max-Age=0; path=/`;
  }
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (key?.startsWith("sb-")) window.localStorage.removeItem(key);
    }
  } catch {
    // Nothing stored there.
  }
}

/** Unsent work on this phone: queued logs, queued photos (Codex review, PR #17). */
async function clearQueues(): Promise<void> {
  await del(OFFLINE_QUEUE_KEY).catch(() => undefined);
  await clear(createStore("miamus-photo-queue", "photos")).catch(() => undefined);
}

/** Stops this phone's notifications even when the server row can't be removed. */
async function stopPush(): Promise<void> {
  const push = await import("@/lib/push");
  try {
    // The row first, while still signed in: only its owner may delete it.
    await push.disablePush();
  } catch (err) {
    console.error("Push row clean-up on sign-out failed", err);
    // The browser's side regardless, so nothing more arrives on this phone.
    await push
      .currentSubscription()
      .then((subscription) => subscription?.unsubscribe())
      .catch(() => undefined);
  }
}

/**
 * Signs this phone out — only this phone: the owner stays signed in on their
 * other devices (scope "local"; the default would end every session) — and
 * forgets the household on it, then opens the start screen.
 *
 * Throws if this phone is somehow still signed in afterwards, so the caller
 * can say so instead of reloading into the app with app lock already off.
 */
export async function signOutThisDevice(): Promise<void> {
  const { supabase } = await import("@/lib/supabase/client");
  await stopPush().catch(() => undefined);

  const result = await supabase?.auth.signOut({ scope: "local" });
  // Offline or the server refused: the stored session is still here.
  if (result?.error) forgetStoredSession();
  const { peekStoredUser } = await import("@/lib/auth/device-session");
  if (await peekStoredUser()) throw new Error("still_signed_in");

  setAppLockEnabled(false);
  clearCachedOwnerLocale();
  await clearQueues();
  clearLocalData();
  // A full page load, not a client-side route change: the household held in
  // memory (context, caches) must not survive into the next session.
  window.location.replace("/");
}
