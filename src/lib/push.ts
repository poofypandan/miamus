import { supabase } from "@/lib/supabase/client";
import type { PushSubscriptionJSON } from "@/types/database";

/**
 * Web Push on this device (Phase 119).
 *
 * The browser half of migrations/103: register the service worker
 * (public/sw.js), ask for permission, subscribe against the VAPID public key,
 * and hand the subscription to save_push_subscription. Sending is entirely
 * server-side — nothing here can make a notification appear anywhere else.
 */

export const SERVICE_WORKER_URL = "/sw.js";

/** iPhone, iPod, or an iPad (which has reported itself as a Mac since iPadOS 13). */
export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1)
  );
}

/** Opened from the home screen, not a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

/**
 * Whether this device can be asked at all.
 *
 * iOS is its own case: Safari only offers push to a site added to the Home
 * Screen and opened from there (iOS 16.4+). In a tab, PushManager simply does
 * not exist — so the honest thing to show is how to get to where it does,
 * not "unsupported".
 */
export type PushAvailability = "supported" | "ios-install-first" | "unsupported";

export function pushAvailability(): PushAvailability {
  if (typeof window === "undefined" || !supabase) return "unsupported";
  if (isIos() && !isStandalone()) return "ios-install-first";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported";
  }
  return "supported";
}

export function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  // updateViaCache "none": the browser always revalidates sw.js itself, on
  // top of the no-cache header next.config.ts sends.
  return navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "/", updateViaCache: "none" });
}

/** Subscribing needs an *active* worker; `ready` waits for one. */
async function activeRegistration(): Promise<ServiceWorkerRegistration> {
  if (!(await navigator.serviceWorker.getRegistration("/"))) await registerServiceWorker();
  return navigator.serviceWorker.ready;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration("/");
  return registration ? registration.pushManager.getSubscription() : null;
}

/** The VAPID public key, from Vault. Null while push is not configured. */
export async function fetchPushPublicKey(): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_push_public_key");
  if (error) throw error;
  return data;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Whether a subscription was made against this key — false after a rotation. */
function madeWith(subscription: PushSubscription, key: Uint8Array): boolean {
  const used = subscription.options.applicationServerKey;
  if (!used) return false;
  const bytes = new Uint8Array(used);
  return bytes.length === key.length && bytes.every((b, i) => b === key[i]);
}

async function save(subscription: PushSubscription, householdId: string): Promise<void> {
  if (!supabase) return;
  const { endpoint, keys } = subscription.toJSON();
  if (!endpoint || !keys?.p256dh || !keys?.auth) throw new Error("Incomplete push subscription");
  const payload: PushSubscriptionJSON = { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
  const { error } = await supabase.rpc("save_push_subscription", {
    p_household_id: householdId,
    p_subscription: payload,
  });
  if (error) throw error;
}

/** A subscription against `key`, replacing one made with an older key. */
async function subscribe(
  registration: ServiceWorkerRegistration,
  key: Uint8Array<ArrayBuffer>
): Promise<PushSubscription> {
  const existing = await registration.pushManager.getSubscription();
  if (existing && madeWith(existing, key)) return existing;
  if (existing) {
    // Dead the moment the key rotated; its row goes too, while the endpoint
    // that identifies it is still in hand.
    await supabase?.from("push_subscriptions").delete().eq("endpoint", existing.endpoint);
    await existing.unsubscribe();
  }
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}

/**
 * Turns push on for this device.
 *
 * Call it straight from the tap, with the public key already fetched: Safari
 * only shows the permission prompt in response to a user gesture, and an
 * awaited network request ahead of requestPermission() can spend that gesture
 * before the prompt is asked for.
 */
export async function enablePush(
  householdId: string,
  publicKey: string
): Promise<"enabled" | "denied"> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  const registration = await activeRegistration();
  await save(await subscribe(registration, keyBytes(publicKey)), householdId);
  return "enabled";
}

/** Turns push off for this device: the row first, then the browser's side. */
export async function disablePush(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const subscription = await currentSubscription();
  if (!subscription) return;
  if (supabase) {
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", subscription.endpoint);
    if (error) throw error;
  }
  await subscription.unsubscribe();
}

/**
 * Keeps an already-enabled device registered, silently.
 *
 * Browsers rotate subscriptions now and then, and a VAPID key rotation voids
 * them all; either way the device stops receiving with nothing on screen to
 * say so. Run on every dashboard visit (usePushResync), this re-saves what
 * the browser holds — and re-subscribes against the current key if needed.
 * Never prompts: it does nothing unless permission was already granted.
 */
export async function resyncPush(householdId: string): Promise<void> {
  if (pushAvailability() !== "supported" || Notification.permission !== "granted") return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const existing = await registration?.pushManager.getSubscription();
  if (!registration || !existing) return;
  const publicKey = await fetchPushPublicKey();
  if (!publicKey) return;
  await save(await subscribe(registration, keyBytes(publicKey)), householdId);
}

/** Queues a test to every device of this account's; resolves to how many. */
export async function sendTestPush(): Promise<number> {
  if (!supabase) return 0;
  const { data, error } = await supabase.rpc("send_test_push");
  if (error) throw error;
  return data;
}
