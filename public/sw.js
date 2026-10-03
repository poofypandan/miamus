/**
 * Miamus service worker (Phase 119): push notifications, and nothing else.
 *
 * Deliberately no `fetch` handler. Every request still goes straight to the
 * network exactly as before this file existed — caching is not this phase's
 * business, and a stale-cache bug in a household app is worse than no cache.
 *
 * Served by Next from /public with no-cache headers (next.config.ts), so a
 * changed worker is picked up on the next visit rather than days later.
 */

// Take over at once instead of waiting for every tab to close: there is no
// cached state an older worker could be holding.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/**
 * The payload is what send-push writes: { title, body, url, tag }. A push
 * that cannot be parsed still shows something — on Safari a push that shows
 * no notification counts against the site, and enough of them revoke it.
 */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Miamus";
  const options = {
    body: data.body || "",
    icon: "/icon/192",
    data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/" },
  };
  if (data.tag) {
    // Same tag replaces rather than stacks; renotify makes the replacement
    // buzz again instead of updating silently.
    options.tag = data.tag;
    options.renotify = true;
  }
  event.waitUntil(self.registration.showNotification(title, options));
});

/**
 * Tap → the app, on the page the message is about.
 *
 * An open Miamus window is focused and told where to go (the registrar in
 * the root layout routes it — a soft navigation, no reload). Only when there
 * is no window does this open one.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const own = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (own) {
        await own.focus();
        own.postMessage({ type: "miamus:navigate", url });
        return;
      }
      await self.clients.openWindow(url);
    })()
  );
});
