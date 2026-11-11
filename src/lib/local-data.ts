/**
 * What signing out removes from this phone's localStorage (Codex P1, PR
 * #101). Deny by default: every key Miamus writes is removed, except a short
 * list of this phone's own display preferences that hold no household data.
 * A cache added later (the menu, recipes, whatever comes next) is therefore
 * removed without anyone remembering to list it, so the privacy policy's
 * promise holds: a phone handed to someone else keeps nothing of the
 * household.
 *
 * Every Miamus key starts with one of MIAMUS_KEY_PREFIXES (a unit test
 * scans the source for storage keys that don't, so a new one can't slip
 * past). The session itself ("sb-…" keys and cookies) is the auth library's
 * and is handled by signOut().
 */

/** Every key Miamus writes starts with one of these (older names included). */
export const MIAMUS_KEY_PREFIXES = ["miamus", "maimus_", "banyuwangi11:", "b11", "dismissed_proposals"] as const;

/**
 * Kept on sign-out: this phone's own display preferences, which say nothing
 * about the household or anyone in it. Everything else goes.
 */
export const KEPT_ON_SIGN_OUT = [
  "miamus.public-locale", // the start page's language
  "miamus.whats-new.", // which tutorial cards this phone has closed, and the week's card
  "miamus.staff-tip.closed-on",
  "miamus.push-prompt.snoozed-until",
  "miamus.kakak-hint-seen",
  "miamus.first-run.", // whether the setup checklist was closed (no household data)
  "miamus_update_reload_at", // when the app last reloaded for an update
  "b11_onboarding_dismissed", // the Add to Home Screen tip
] as const;

/** True for a key that signing out removes. */
export function removedOnSignOut(key: string): boolean {
  if (!MIAMUS_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) return false;
  return !KEPT_ON_SIGN_OUT.some((kept) => (kept.endsWith(".") ? key.startsWith(kept) : key === kept));
}

/** Removes every key signing out removes from `storage`; returns them. */
export function clearHouseholdKeys(storage: Storage): string[] {
  const removed: string[] = [];
  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i);
    if (key && removedOnSignOut(key)) removed.push(key);
  }
  for (const key of removed) storage.removeItem(key);
  return removed;
}
