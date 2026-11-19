"use client";

import { useCallback, useSyncExternalStore } from "react";
import { readChoreDraft, writeChoreDraft, type ChoreDraft } from "@/lib/chore-draft";

/**
 * A chore's before and after photos, one copy per day's chore on this phone
 * (19 Nov, product change #2). The staff card and the chore's sheet both take
 * photos now, so they read and write the same draft (lib/chore-draft.ts):
 * a before taken on the card is there when the sheet opens, and the other
 * way round.
 *
 * Kept in localStorage exactly as before (Phase 133), so a killed tab still
 * finds its photos; this only tells every screen showing the chore when one
 * changes.
 */
const listeners = new Map<string, Set<() => void>>();
/** The last draft read per key, so the snapshot keeps its identity between changes. */
const snapshots = new Map<string, ChoreDraft>();
const EMPTY: ChoreDraft = { before: null, after: null };

function read(key: string): ChoreDraft {
  let draft = snapshots.get(key);
  if (!draft) {
    draft = readChoreDraft(key) ?? EMPTY;
    snapshots.set(key, draft);
  }
  return draft;
}

function subscribe(key: string, listener: () => void) {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) {
      listeners.delete(key);
      // Read afresh next time: another tab, or a draft that expired.
      snapshots.delete(key);
    }
  };
}

/** Saves the draft and tells every screen showing this chore. */
export function setChoreProof(key: string, draft: ChoreDraft) {
  writeChoreDraft(key, draft);
  snapshots.set(key, draft);
  listeners.get(key)?.forEach((listener) => listener());
}

export function useChoreProof(key: string) {
  const draft = useSyncExternalStore(
    useCallback((listener: () => void) => subscribe(key, listener), [key]),
    () => read(key),
    () => EMPTY
  );
  const setBefore = useCallback((before: string | null) => setChoreProof(key, { ...read(key), before }), [key]);
  const setAfter = useCallback((after: string | null) => setChoreProof(key, { ...read(key), after }), [key]);
  return { before: draft.before, after: draft.after, setBefore, setAfter };
}
