/**
 * Who may create a household (Phase 148, migrations/113).
 *
 * A Google account with no household lands on /onboarding (see middleware).
 * Before this phase that screen let anyone create one; now the operator
 * approves each new household first. The database decides — every function
 * here is a view of what my_household_access() and create_household() say,
 * and both refuse anonymous (staff phone) sessions on their own.
 */

/**
 * What /onboarding shows. "admin", "approved" and "open" all get the name
 * form. "open" (Phase 172, migrations/143) only while a platform admin has
 * switched automatic approval on (it is off: the owner approves every new
 * household): no request yet, and the account is approved when it creates
 * its household. With the switch off, or over the day's cap, it reads
 * "none" and the Request access screen shows.
 */
export type HouseholdAccess = "admin" | "approved" | "open" | "pending" | "rejected" | "none";

const ACCESS_VALUES: readonly HouseholdAccess[] = ["admin", "approved", "open", "pending", "rejected", "none"];

/** Anything the server sends that isn't a known state reads as "none": ask, don't assume. */
export function parseHouseholdAccess(value: unknown): HouseholdAccess {
  return ACCESS_VALUES.includes(value as HouseholdAccess) ? (value as HouseholdAccess) : "none";
}

export function canCreateHousehold(access: HouseholdAccess): boolean {
  return access === "admin" || access === "approved" || access === "open";
}

export type AccessRequestStatus = "pending" | "approved" | "rejected";

export interface AccessRequest {
  user_id: string;
  full_name: string | null;
  email: string | null;
  status: AccessRequestStatus;
  requested_at: string;
  decided_at: string | null;
  /** Approved automatically at sign-up (migrations/143). */
  auto?: boolean;
  /** The account's language, for the Email them text. */
  locale?: string | null;
}

/** Pending first (oldest first, so nobody waits longest), then decisions, newest first. */
export function sortAccessRequests(requests: readonly AccessRequest[]): AccessRequest[] {
  return [...requests].sort((a, b) => {
    const aPending = a.status === "pending";
    const bPending = b.status === "pending";
    if (aPending !== bPending) return aPending ? -1 : 1;
    if (aPending) return a.requested_at.localeCompare(b.requested_at);
    return (b.decided_at ?? b.requested_at).localeCompare(a.decided_at ?? a.requested_at);
  });
}

export function pendingCount(requests: readonly AccessRequest[]): number {
  return requests.filter((r) => r.status === "pending").length;
}

/**
 * What a failed create_household() means for the screen. The function raises
 * these names as its message (migrations/113); PostgREST passes them through.
 */
export type CreateHouseholdFailure = "not_approved" | "has_household" | "invalid_name" | "other";

export function createHouseholdFailure(error: { message?: string } | null | undefined): CreateHouseholdFailure {
  const message = error?.message ?? "";
  if (message.includes("household_not_approved") || message.includes("anonymous_cannot_create_household")) {
    return "not_approved";
  }
  if (message.includes("already_has_household")) return "has_household";
  if (message.includes("invalid_household_name")) return "invalid_name";
  return "other";
}

/** "Sam Lee" / "sam@…" / "Someone": the name an approvals row leads with. */
export function requesterLabel(request: Pick<AccessRequest, "full_name" | "email">): string {
  return request.full_name?.trim() || request.email || "Someone";
}

/**
 * The "Email them" link on the approvals page (Phase 172, D2): a ready
 * message in the account's language, sent by hand from the support address.
 * Miamus has no mail service; this only opens the operator's mail app.
 * Null when the account has no email.
 */
export function emailThemHref(request: Pick<AccessRequest, "email" | "locale" | "full_name">): string | null {
  const to = request.email?.trim();
  if (!to) return null;
  const id = request.locale === "id";
  const first = request.full_name?.trim().split(/\s+/)[0];
  const subject = id ? "Miamus: Anda sudah bisa masuk" : "Miamus: you're in";
  const greeting = first ? (id ? `Halo ${first},` : `Hi ${first},`) : id ? "Halo," : "Hi,";
  const body = id
    ? `${greeting}\n\nAnda sudah bisa masuk. Buka miamus.app untuk menyiapkan rumah Anda.\n\nPoofy Labs`
    : `${greeting}\n\nYou're in. Open miamus.app to set up your household.\n\nPoofy Labs`;
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
