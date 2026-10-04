/**
 * A chore's proof photos, kept on the device until the chore is finished
 * (Phase 133).
 *
 * WHY. The before shot is taken when the work starts and the after shot when
 * it ends — often an hour apart, with the phone in a pocket in between. A
 * backgrounded PWA is the first thing iOS and Android reclaim memory from, so
 * the tab was regularly killed in that hour, and the uploaded before photo
 * lived only in React state: reopening the chore asked for it again, by which
 * point the "before" no longer existed to photograph.
 *
 * WHAT. The photo itself is already safe in storage the moment it uploads;
 * only its reference was being lost. So that reference is written here as
 * soon as each upload lands, and read back when the chore's sheet opens.
 * Cleared once the completion is saved — and when the chore turns out to be
 * finished already, by another phone.
 *
 * KEYED by household, template and day — the same identity as the
 * occurrence's own key, which stays put when a virtual day is materialised by
 * a claim or by another phone. A rolled-over chore keeps its original day, so
 * a before shot taken yesterday is still there today.
 *
 * localStorage rather than IndexedDB: two short strings, and a synchronous
 * read lets the sheet open with the photos already in place instead of
 * flashing empty steps first.
 */

const PREFIX = "miamus_chore_draft:";

/**
 * Old enough that nobody is coming back to it. Well inside the 30-day photo
 * retention (migrations/102), so a draft never points at a deleted file.
 */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface ChoreDraft {
  before: string | null;
  after: string | null;
}

interface StoredDraft extends ChoreDraft {
  savedAt: number;
}

export function choreDraftKey(householdId: string, templateId: string, date: string): string {
  return `${PREFIX}${householdId}:${templateId}:${date}`;
}

export function readChoreDraft(key: string): ChoreDraft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<StoredDraft>;
    if (typeof draft.savedAt !== "number" || Date.now() - draft.savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return {
      before: typeof draft.before === "string" ? draft.before : null,
      after: typeof draft.after === "string" ? draft.after : null,
    };
  } catch {
    // Blocked storage or a corrupt entry: start with empty steps, as before.
    return null;
  }
}

/** Writes the draft, or removes it once neither photo is left. */
export function writeChoreDraft(key: string, draft: ChoreDraft): void {
  try {
    if (!draft.before && !draft.after) {
      window.localStorage.removeItem(key);
      return;
    }
    const stored: StoredDraft = { ...draft, savedAt: Date.now() };
    window.localStorage.setItem(key, JSON.stringify(stored));
  } catch {
    // Full or blocked storage: the photos still work for this session.
  }
}

export function clearChoreDraft(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to clear.
  }
}
