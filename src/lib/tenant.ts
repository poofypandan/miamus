/**
 * Which household (tenant) this device is working for.
 *
 * Resolved once at startup by HouseholdProvider and read by the data provider
 * on every query, in this order:
 *
 *   1. the signed-in Google account's membership   — the owner's phone
 *   2. localStorage, written by /join              — a staff phone that has
 *                                                    opened its invite link
 *   3. DEFAULT_HOUSEHOLD_ID                        — the grandfather rule
 *
 * Step 3 is what keeps the staff phones already in the house working: they
 * have no Google account and never opened an invite, and without a fallback
 * their next fetch would come back empty (Phase 86C).
 */

/** Banyuwangi 11 — the household that existed before any of this. */
export const DEFAULT_HOUSEHOLD_ID = "975f0914-4d0d-43ad-8dee-a967d9bd10cd";

/** Where /join stores the household a staff phone was invited to. */
export const TENANT_STORAGE_KEY = "miamus_tenant_id";

let activeHouseholdId: string = DEFAULT_HOUSEHOLD_ID;

export function getActiveHouseholdId(): string {
  return activeHouseholdId;
}

export function setActiveHouseholdId(id: string): void {
  activeHouseholdId = id;
}

/** The tenant this staff device was invited to, if it has opened a link. */
export function readStoredTenantId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TENANT_STORAGE_KEY);
  } catch {
    // Private browsing or blocked site data: fall through to the default.
    return null;
  }
}

export function storeTenantId(id: string): void {
  try {
    window.localStorage.setItem(TENANT_STORAGE_KEY, id);
  } catch {
    // The redirect still works; this phone just asks again next time.
  }
}

/**
 * Works out which household this device belongs to, in the documented order:
 * membership of the signed-in account, then a stored invite, then the
 * grandfather default.
 *
 * Called once by HouseholdProvider before the first fetch — every query is
 * scoped to whatever this returns, so fetching ahead of it would load the
 * wrong household's data and then swap it under the user.
 */
export async function resolveActiveHouseholdId(): Promise<string> {
  const stored = readStoredTenantId();

  // getSession, not getUser: it reads the cookie without a network round
  // trip, and the membership query below is verified by RLS regardless. A
  // staff phone has no session at all and skips straight past this.
  const { supabase } = await import("@/lib/supabase/client");
  if (supabase) {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        const { data } = await supabase
          .from("household_members")
          .select("household_id")
          .eq("user_id", session.user.id)
          .limit(1)
          .maybeSingle();
        if (data?.household_id) return data.household_id;
      }
    } catch (err) {
      // A failed lookup must not strand the app on a blank screen; the
      // fallbacks below are both better answers than nothing.
      console.error("Household resolution failed", err);
    }
  }

  return stored ?? DEFAULT_HOUSEHOLD_ID;
}
