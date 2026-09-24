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
 * Works out which household this device belongs to, and makes sure it has an
 * identity the database will accept (Phase 88).
 *
 *   1. an owner's Google session      -> their household_members row
 *   2. a device already bound         -> its device_sessions row
 *   3. a legacy staff phone           -> signs in anonymously and binds itself
 *   4. nothing to go on               -> the stored id, then the default
 *
 * Steps 1-3 all end with a real auth.uid(), which is what the RLS policies in
 * migrations/090 require. Step 4 is the honest last resort: it keeps the app
 * rendering, but once the lockdown is applied those queries come back empty.
 *
 * Called once by HouseholdProvider before the first fetch — every query is
 * scoped to whatever this returns, so fetching ahead of it would load the
 * wrong household's data and then swap it under the user.
 */
export interface ResolvedTenant {
  householdId: string;
  /**
   * True when this identity is a member of the household (a Google account in
   * household_members) rather than a bound staff device. The dashboard is
   * already behind Google sign-in, so membership is what makes someone an
   * owner — the PIN is a screen lock, not an identity check (Phase 87).
   */
  isMember: boolean;
}

export async function resolveActiveHouseholdId(): Promise<ResolvedTenant> {
  const stored = readStoredTenantId();
  const fallback = stored ?? DEFAULT_HOUSEHOLD_ID;

  const { supabase } = await import("@/lib/supabase/client");
  if (!supabase) return { householdId: fallback, isMember: false };

  try {
    // getSession reads the cookie without a network round trip.
    let userId = (await supabase.auth.getSession()).data.session?.user?.id ?? null;

    if (!userId) {
      // No identity yet: a phone that has been in service since before any of
      // this existed. Upgrade it in place — anonymous sign-in, then bind.
      const { upgradeLegacyDevice } = await import("@/lib/auth/device-session");
      const bound = await upgradeLegacyDevice();
      if (bound) {
        storeTenantId(bound);
        return { householdId: bound, isMember: false };
      }
      userId = (await supabase.auth.getSession()).data.session?.user?.id ?? null;
      if (!userId) return { householdId: fallback, isMember: false };
    }

    // An owner may manage several households later; today the first row is
    // the answer for both lookups.
    const { data: member } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (member?.household_id) return { householdId: member.household_id, isMember: true };

    const { data: device } = await supabase
      .from("device_sessions")
      .select("household_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (device?.household_id) {
      storeTenantId(device.household_id);
      return { householdId: device.household_id, isMember: false };
    }
  } catch (err) {
    // A failed lookup must not strand the app on a blank screen; the
    // fallbacks are both better answers than nothing.
    console.error("Household resolution failed", err);
  }

  return { householdId: fallback, isMember: false };
}
