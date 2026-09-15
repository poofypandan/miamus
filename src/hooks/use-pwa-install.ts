"use client";

import { useCallback, useSyncExternalStore } from "react";

// Not in lib.dom yet — Chromium-only, so TypeScript ships no type for it.
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

/**
 * The captured prompt lives at module scope, not in component state.
 *
 * Chrome fires `beforeinstallprompt` once per page load, frequently before
 * React has mounted whatever component wants it — and a listener that only
 * exists while the landing page is mounted would lose it for good the moment
 * someone navigates to /staff and back. Registering when this module is first
 * evaluated (it's imported from the root Providers) catches it on any route,
 * and every hook instance reads the same captured event.
 */
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<() => void>();

function notifyPromptChange() {
  promptListeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Suppresses Chrome's own mini-infobar so the landing page's button is the
    // single, deliberate way in. The event stays usable for prompt() later.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notifyPromptChange();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notifyPromptChange();
  });
}

function subscribePrompt(listener: () => void) {
  promptListeners.add(listener);
  return () => promptListeners.delete(listener);
}

const STANDALONE_QUERY = "(display-mode: standalone)";

function subscribeStandalone(listener: () => void) {
  const query = window.matchMedia(STANDALONE_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

function readStandalone(): boolean {
  return (
    window.matchMedia(STANDALONE_QUERY).matches ||
    // iOS home-screen apps predating display-mode support expose only this.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function readIOS(): boolean {
  const { userAgent, maxTouchPoints } = window.navigator;
  return (
    /iPad|iPhone|iPod/.test(userAgent) ||
    // iPadOS 13+ requests the desktop site and reports itself as a Mac; a
    // multi-touch screen is what gives it away.
    (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
  );
}

const noopSubscribe = () => () => {};
const serverFalse = () => false;
const serverNull = () => null;

/**
 * Installation state for the current device.
 *
 * Every value is `false`/`null` during SSR and the hydration render, then
 * resolves on the client — so UI gated on `isInstallable || isIOS` renders
 * nothing in server HTML and can't flash into an already-installed app.
 */
export function usePwaInstall() {
  const prompt = useSyncExternalStore(subscribePrompt, () => deferredPrompt, serverNull);
  const isStandalone = useSyncExternalStore(subscribeStandalone, readStandalone, serverFalse);
  const isIOS = useSyncExternalStore(noopSubscribe, readIOS, serverFalse);

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    const event = deferredPrompt;
    if (!event) return "unavailable";
    await event.prompt();
    const { outcome } = await event.userChoice;
    // A prompt event is single-use either way; Chrome fires a fresh one later
    // if the user dismissed and is still eligible.
    deferredPrompt = null;
    notifyPromptChange();
    return outcome;
  }, []);

  return {
    isInstallable: prompt !== null && !isStandalone,
    isIOS,
    isStandalone,
    deferredPrompt: prompt,
    promptInstall,
  };
}
