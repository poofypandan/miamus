"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { onChoreDraftChange, readChoreDraft, writeChoreDraft, type ChoreDraft } from "@/lib/chore-draft";
import { discardPhoto } from "@/lib/photo-queue";

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

function notify(key: string) {
  listeners.get(key)?.forEach((listener) => listener());
}

/** The key setChoreProof is writing right now: its snapshot is already the new draft. */
let writing: string | null = null;

// Cleared or written from outside (a queued send that went, a moved phone,
// the owner's sheet): read it afresh.
onChoreDraftChange((key) => {
  if (key === writing) return;
  snapshots.delete(key);
  notify(key);
});

/**
 * Saves the draft and tells every screen showing this chore. The snapshot is
 * set first and kept even if storage is full or blocked, so the photos still
 * work for this session.
 */
export function setChoreProof(key: string, draft: ChoreDraft): void {
  snapshots.set(key, draft);
  writing = key;
  try {
    writeChoreDraft(key, draft);
  } finally {
    writing = null;
  }
  notify(key);
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

/**
 * Finished, here or on another phone, and nothing left waiting to send:
 * nothing is owed any more, including any proof still waiting on this phone
 * to upload (Phase 138). Finished here, both are already in storage and
 * discarding is a no-op. Run by the chore's sheet and by the staff card
 * (19 Nov): photos are taken on the card now, and the sheet may never open.
 */
export function useClearProofWhenSettled(key: string, settled: boolean) {
  useEffect(() => {
    if (!settled) return;
    // Straight from storage, not the snapshot: every finished card on the
    // list runs this, and none of them needs a cached copy.
    const draft = snapshots.get(key) ?? readChoreDraft(key);
    if (!draft || (!draft.before && !draft.after)) return;
    setChoreProof(key, EMPTY);
    if (draft.before) void discardPhoto(draft.before);
    if (draft.after) void discardPhoto(draft.after);
  }, [key, settled]);
}
