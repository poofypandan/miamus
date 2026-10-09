/**
 * Who an admin is on the roster (Phase 139; migrations/106).
 *
 * Admins sign in with Google, so they never pass the name-and-PIN gate that
 * tells the app who is holding a staff phone. Since they can now be assigned
 * chores, they need the same answer: their own staff_profiles row. The
 * household context resolves it; this module holds it where the data layer
 * can reach it (readActiveStaffId, which stamps every write) and keeps a copy
 * on the device, so Action Mode opens already filtered to "mine" instead of
 * showing everyone's chores for the moment before the lookup lands.
 */

export interface MemberProfile {
  id: string;
  name: string;
}

const PREFIX = "miamus_member_profile:";

/**
 * undefined: not an admin session — the staff gate's stored choice decides.
 * null: an admin with no roster row (yet, or ever, before migrations/106).
 */
let active: MemberProfile | null | undefined;

export function setActiveMemberProfile(profile: MemberProfile | null | undefined): void {
  active = profile;
}

/** See `active`. */
export function activeMemberProfile(): MemberProfile | null | undefined {
  return active;
}

export function readCachedMemberProfile(householdId: string): MemberProfile | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + householdId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MemberProfile>;
    return typeof parsed.id === "string" && typeof parsed.name === "string"
      ? { id: parsed.id, name: parsed.name }
      : null;
  } catch {
    return null;
  }
}

export function writeCachedMemberProfile(householdId: string, profile: MemberProfile | null): void {
  try {
    if (profile) window.localStorage.setItem(PREFIX + householdId, JSON.stringify(profile));
    else window.localStorage.removeItem(PREFIX + householdId);
  } catch {
    // Not remembered; it is looked up again next launch.
  }
}
