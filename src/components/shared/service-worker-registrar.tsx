"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { registerServiceWorker } from "@/lib/push";

/**
 * Registers public/sw.js on every route, owner and staff alike (Phase 119),
 * and carries out the navigation a tapped notification asks for.
 *
 * Registering here rather than only when someone enables push means the
 * worker is already active by the time they do — subscribing needs one — and
 * an updated sw.js is picked up on the next visit to any page.
 *
 * The worker cannot route the app itself. When a notification is tapped and
 * Miamus is already open, sw.js focuses the window and posts the URL here, and
 * this hands it to the router: a soft navigation, never a reload.
 */
export function ServiceWorkerRegistrar() {
  const router = useRouter();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    registerServiceWorker().catch((err) => console.error("Service worker registration failed", err));

    function onMessage(event: MessageEvent) {
      const { type, url } = (event.data ?? {}) as { type?: string; url?: unknown };
      if (type === "miamus:navigate" && typeof url === "string" && url.startsWith("/")) {
        router.push(url);
      }
    }
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  return null;
}
