"use client";

import { useEffect, useSyncExternalStore } from "react";
import { syncNewVoice } from "@/lib/kakak/voice";

// Kakak's new voice flow (tap to talk, tap Done to send) is the default since
// 20 Nov. ?newvoice=0 on any address turns it off for this phone, back to the
// older flow (kakak-voice.tsx), while it settles in; ?newvoice=1 turns it on
// again (src/lib/kakak/voice.ts).

let on: boolean | null = null;
const listeners = new Set<() => void>();

/** This phone's storage, or undefined where even touching it throws (storage blocked). */
function phoneStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function read(): boolean {
  return syncNewVoice(window.location.search, phoneStorage());
}

function sync() {
  on = read();
  listeners.forEach((listener) => listener());
}

function snapshot(): boolean {
  if (on === null) on = read();
  return on;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether the new voice flow is on for this phone. On, the default, on the server. */
export function useNewVoice(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}

/** Reads ?newvoice= from the address the app was opened at. Renders nothing. */
export function NewVoiceSwitch() {
  useEffect(sync, []);
  return null;
}
