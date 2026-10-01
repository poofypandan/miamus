"use client";

import { AppHeader, HeaderNavLink } from "@/components/navigation/app-header";

/**
 * The dashboard header: the property name and the way into the staff view.
 *
 * It used to carry a second row of pills for whichever module had two panels —
 * Pets split into Daily Feed and Schedule, Household into Chores and
 * Inventory. Phase 100 promoted all of those to the tab bar, so there is no
 * sub-navigation left to render and the header is back to what it is for.
 */
export function TopNav() {
  return <AppHeader action={<HeaderNavLink href="/staff">Open Staff View →</HeaderNavLink>} />;
}
