"use client";

import { useEffect, useSyncExternalStore } from "react";
import { syncNewVoice } from "@/lib/kakak/voice";

// Kakak's new voice flow (tap Done, check, then Send) is opt-in per phone
// while the owner tries it on production: ?newvoice=1 on any address turns it
// on for this phone, ?newvoice=0 turns it off (src/lib/kakak/voice.ts). Off by
// default, and then the current flow (kakak-voice.tsx) runs unchanged.

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

/** Whether the new voice flow is on for this phone. Always off on the server. */
export function useNewVoice(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

/** Reads ?newvoice= from the address the app was opened at. Renders nothing. */
export function NewVoiceSwitch() {
  useEffect(sync, []);
  return null;
}
