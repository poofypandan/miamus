import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { choreDraftKey, clearChoreDraft, onChoreDraftChange, readChoreDraft, writeChoreDraft } from "@/lib/chore-draft";

// 19 Nov: the staff card and the chore's sheet both show a chore's draft, and a
// queued send (use-offline-sync) or a moved phone clears it from outside
// either, so every write and clear says so.
describe("chore draft changes", () => {
  const store = new Map<string, string>();
  const key = choreDraftKey("h1", "t1", "2026-11-20");

  beforeEach(() => {
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    };
  });

  afterEach(() => {
    store.clear();
    delete (globalThis as { window?: unknown }).window;
  });

  it("tells listeners about a write, an emptying write and a clear", () => {
    const seen: string[] = [];
    const stop = onChoreDraftChange((k) => seen.push(k));
    writeChoreDraft(key, { before: "a.jpg", after: null });
    expect(readChoreDraft(key)).toEqual({ before: "a.jpg", after: null });
    writeChoreDraft(key, { before: null, after: null });
    expect(readChoreDraft(key)).toBeNull();
    clearChoreDraft(key);
    expect(seen).toEqual([key, key, key]);
    stop();
    clearChoreDraft(key);
    expect(seen).toHaveLength(3);
  });

  it("still tells listeners when storage is blocked", () => {
    delete (globalThis as { window?: unknown }).window;
    const seen: string[] = [];
    const stop = onChoreDraftChange((k) => seen.push(k));
    writeChoreDraft(key, { before: "a.jpg", after: null });
    clearChoreDraft(key);
    expect(seen).toEqual([key, key]);
    stop();
  });
});
