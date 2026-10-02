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
 *   3. nothing to go on               -> the stored id, then the default
 *
 * Steps 1-2 end with a real auth.uid(), which is what the RLS policies in
 * migrations/090 require. Step 3 is the honest last resort: it keeps the app
 * rendering, but those queries come back empty.
 *
 * There used to be a step between: a phone with a staff id in localStorage
 * could sign in anonymously and bind itself. That carried the pre-SaaS phones
 * across and was closed in Phase 97 — a staff id is a uuid, not a secret, and
 * every real device has since been bound by a token.
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
   * owner. There is no owner PIN (removed in Phase 108).
   */
  isMember: boolean;
}

export async function resolveActiveHouseholdId(): Promise<ResolvedTenant> {
  const stored = readStoredTenantId();
  const fallback = stored ?? DEFAULT_HOUSEHOLD_ID;

  const { supabase } = await import("@/lib/supabase/client");
  // Mock mode (no Supabase configured) is a local sandbox with no accounts to
  // check, so whoever runs it is the owner. It used to get there by typing the
  // owner PIN, which Phase 108 removed. The staff view still works here — the
  // gate lets an owner through, as it does for a real one.
  if (!supabase) return { householdId: fallback, isMember: true };

  try {
    // getSession reads the cookie without a network round trip.
    const userId = (await supabase.auth.getSession()).data.session?.user?.id ?? null;

    // No session at all: an unbound device. It gets no identity here — one is
    // created by /join/staff when an invite is redeemed, which is also what
    // binds it to a household.
    if (!userId) return { householdId: fallback, isMember: false };

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
