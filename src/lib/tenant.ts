/**
 * Which household (tenant) this app instance is working for — Phase 86A.
 *
 * Hardcoded to the one household that exists, Banyuwangi 11, until Phase 86B
 * resolves it from the signed-in Google account. Every query against a
 * tenant-stamped table (see migrations/086) filters or stamps with this, so
 * swapping the resolution later touches this file and nothing else.
 *
 * Lives here rather than in HouseholdContext because the data provider needs
 * it, and the provider sits beneath the context — importing upward would be a
 * cycle. The context re-exposes it as `activeHouseholdId` for components.
 */
export const DEFAULT_HOUSEHOLD_ID = "975f0914-4d0d-43ad-8dee-a967d9bd10cd";

export function getActiveHouseholdId(): string {
  return DEFAULT_HOUSEHOLD_ID;
}
